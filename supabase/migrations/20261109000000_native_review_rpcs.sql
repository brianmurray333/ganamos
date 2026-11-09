-- Native (iOS) fix review, issue closing and group-member review.
--
-- The iOS app calls these RPCs with the signed-in user's JWT (PostgREST), so
-- each one does the same authorization and funding checks as the web server
-- actions (createFixRewardAction / closeIssueAction / member-action route)
-- and pays only through pay_fix_reward (stored reward, once). Rewards are
-- never paid for unfunded posts or while a Lightning payout is in flight.

-- ---------------------------------------------------------------------------
-- post_reward_is_funded: SQL twin of lib/payouts.ts isPostRewardFunded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_reward_is_funded(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_created TIMESTAMPTZ;
BEGIN
  SELECT id, user_id, reward, original_reward, created_at, funding_transaction_id, funding_status, funding_r_hash
    INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_post.reward IS NULL OR v_post.reward <= 0 THEN RETURN TRUE; END IF;

  -- Funding verified out of band (server-only table)
  IF EXISTS (SELECT 1 FROM post_funding_overrides o WHERE o.post_id = p_post_id AND o.amount >= v_post.reward) THEN
    RETURN TRUE;
  END IF;

  IF v_post.user_id IS NULL THEN
    RETURN v_post.funding_status = 'paid' AND v_post.funding_r_hash IS NOT NULL;
  END IF;

  IF v_post.funding_transaction_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = v_post.funding_transaction_id AND t.user_id = v_post.user_id
        AND t.type = 'internal' AND t.status = 'completed' AND t.amount < 0
    );
  END IF;

  -- Legacy posts (before funding links): an unlinked deduction of the reward
  -- by the owner within 2 minutes of creation.
  v_created := v_post.created_at;
  IF v_created IS NULL OR v_created >= TIMESTAMPTZ '2026-11-08 00:00:00+00' THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.user_id = v_post.user_id AND t.type = 'internal' AND t.status = 'completed'
      AND t.amount IN (-v_post.reward, -COALESCE(NULLIF(v_post.original_reward, 0), v_post.reward))
      AND t.created_at BETWEEN v_created - INTERVAL '2 minutes' AND v_created + INTERVAL '2 minutes'
      AND NOT EXISTS (SELECT 1 FROM posts p2 WHERE p2.funding_transaction_id = t.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_reward_is_funded(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_reward_is_funded(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Post guard: allow the trusted functions below to complete a post.
-- (Same as 20261108030000 plus the ganamos.trusted_update bypass.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_post_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Trusted, audited SECURITY DEFINER functions (review_submitted_fix_atomic,
  -- close_issue_atomic) do their own authorization and set this flag,
  -- transaction-locally, around their post updates. Browsers can't set it.
  IF current_setting('ganamos.trusted_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.reward := OLD.reward;
  NEW.original_reward := OLD.original_reward;
  NEW.fixed := OLD.fixed;
  NEW.fixed_by := OLD.fixed_by;
  NEW.fixed_at := OLD.fixed_at;
  -- Who is entitled to claim the reward is decided server-side only.
  NEW.fixed_by_is_anonymous := OLD.fixed_by_is_anonymous;
  NEW.total_boost_amount := OLD.total_boost_amount;

  NEW.user_id := OLD.user_id;
  NEW.is_anonymous := OLD.is_anonymous;
  NEW.funding_r_hash := OLD.funding_r_hash;
  NEW.funding_status := OLD.funding_status;
  NEW.funding_payment_request := OLD.funding_payment_request;
  NEW.submitted_fix_payment_hash := OLD.submitted_fix_payment_hash;
  NEW.deleted_at := OLD.deleted_at;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NOT (
       auth.uid() = OLD.user_id
       OR EXISTS (
         SELECT 1 FROM connected_accounts ca
         WHERE ca.primary_user_id = auth.uid() AND ca.connected_user_id = OLD.user_id
       )
     ) THEN
    NEW.expires_at := OLD.expires_at;
  END IF;
  -- group_id decides who may approve and pay out (group admins). Only the
  -- owner may move a post between groups; others (e.g. an admin deleting a
  -- group) may only clear it.
  IF NEW.group_id IS DISTINCT FROM OLD.group_id AND NEW.group_id IS NOT NULL AND NOT (
       auth.uid() = OLD.user_id
       OR EXISTS (
         SELECT 1 FROM connected_accounts ca
         WHERE ca.primary_user_id = auth.uid() AND ca.connected_user_id = OLD.user_id
       )
     ) THEN
    NEW.group_id := OLD.group_id;
  END IF;

  IF current_setting('ganamos.payout_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.reward_paid_at := OLD.reward_paid_at;
  NEW.reward_paid_to := OLD.reward_paid_to;
  NEW.reward_refunded_at := OLD.reward_refunded_at;
  NEW.funding_transaction_id := OLD.funding_transaction_id;
  NEW.anonymous_claim_token_hash := OLD.anonymous_claim_token_hash;
  NEW.anonymous_reward_paid_at := OLD.anonymous_reward_paid_at;
  NEW.anonymous_reward_payment_hash := OLD.anonymous_reward_payment_hash;
  NEW.anonymous_reward_payment_lock := OLD.anonymous_reward_payment_lock;
  NEW.submitted_fix_lightning_address := OLD.submitted_fix_lightning_address;
  NEW.submitted_fix_payout_invoice := OLD.submitted_fix_payout_invoice;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Can the caller approve/close this post? Owner, or an approved group admin
-- (same rule as the web server actions).
CREATE OR REPLACE FUNCTION public.ganamos_can_review_post(p_user_id UUID, p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_user_id = auth.uid()
    OR (p_group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()
        AND gm.role = 'admin' AND gm.status = 'approved'
    ))
  )
$$;
REVOKE ALL ON FUNCTION public.ganamos_can_review_post(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ganamos_can_review_post(UUID, UUID) TO service_role;

-- Shared tail: mark the post fixed by p_fixer_id (or anonymously) and pay.
CREATE OR REPLACE FUNCTION public.ganamos_complete_post_fix(
  p_post_id UUID,
  p_fixer_id UUID,
  p_from_submission BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_tx UUID;
  v_amount INTEGER;
  v_balance INTEGER;
BEGIN
  SELECT * INTO v_post FROM posts WHERE id = p_post_id FOR UPDATE;

  IF v_post.reward IS NOT NULL AND v_post.reward > 0 AND NOT public.post_reward_is_funded(p_post_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This post''s reward was never funded. Cannot issue reward.';
  END IF;
  IF v_post.reward_paid_at IS NOT NULL OR v_post.anonymous_reward_paid_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This reward has already been paid.';
  END IF;
  IF v_post.anonymous_reward_payment_lock IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A reward payout for this post is already in progress.';
  END IF;

  PERFORM set_config('ganamos.trusted_update', 'on', true);
  UPDATE posts SET
    fixed = TRUE,
    fixed_at = NOW(),
    fixed_by = p_fixer_id,
    fixed_by_is_anonymous = (p_fixer_id IS NULL),
    fixed_image_url = CASE WHEN p_from_submission THEN submitted_fix_image_url ELSE fixed_image_url END,
    fixer_note = CASE WHEN p_from_submission THEN submitted_fix_note ELSE fixer_note END,
    fix_proof_text = CASE WHEN p_from_submission THEN submitted_fix_proof_text ELSE fix_proof_text END,
    under_review = FALSE
  WHERE id = p_post_id;
  PERFORM set_config('ganamos.trusted_update', 'off', true);

  -- Anonymous / agent fixers claim later with their claim token or L402 token.
  IF p_fixer_id IS NOT NULL AND v_post.reward IS NOT NULL AND v_post.reward > 0 THEN
    SELECT r.transaction_id, r.amount, r.new_balance INTO v_tx, v_amount, v_balance
    FROM public.pay_fix_reward(p_post_id, p_fixer_id, 'Fix reward earned: ' || COALESCE(v_post.title, 'Issue fixed')) r;

    INSERT INTO activities (user_id, type, related_id, related_table, timestamp, metadata)
    VALUES (p_fixer_id, 'fix', p_post_id, 'posts', NOW(),
      jsonb_build_object('title', COALESCE(v_post.title, 'Issue fixed'), 'reward', v_amount, 'transaction_id', v_tx));
    IF v_post.user_id IS NOT NULL AND v_post.user_id <> p_fixer_id THEN
      INSERT INTO activities (user_id, type, related_id, related_table, timestamp, metadata)
      VALUES (v_post.user_id, 'fix_completed', p_post_id, 'posts', NOW(),
        jsonb_build_object('title', COALESCE(v_post.title, 'Your issue'), 'reward', v_amount, 'fixer_id', p_fixer_id));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'approved', TRUE,
    'post_id', p_post_id,
    'transaction_id', v_tx,
    -- Only reveal a balance to its owner
    'new_balance', CASE WHEN p_fixer_id = auth.uid() THEN v_balance ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ganamos_complete_post_fix(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ganamos_complete_post_fix(UUID, UUID, BOOLEAN) TO service_role;

-- ---------------------------------------------------------------------------
-- review_submitted_fix_atomic: owner / group admin approves or rejects the
-- fix under review. Approval pays a signed-in fixer immediately; an
-- anonymous or agent fixer claims later with their own credential.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_submitted_fix_atomic(
  p_post_id UUID,
  p_approve BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL -- accepted for the iOS client; not stored
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_fixer UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Post not found';
  END IF;
  IF NOT public.ganamos_can_review_post(v_post.user_id, v_post.group_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the post owner or a group admin can review this fix';
  END IF;
  IF v_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post has been deleted';
  END IF;
  IF v_post.fixed OR NOT COALESCE(v_post.under_review, FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'There is no fix awaiting review on this post';
  END IF;

  IF NOT COALESCE(p_approve, FALSE) THEN
    IF v_post.anonymous_reward_payment_lock IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A reward payout for this fix is in progress';
    END IF;
    -- Reopen the post; the rejected fixer's credentials no longer apply.
    PERFORM set_config('ganamos.trusted_update', 'on', true);
    PERFORM set_config('ganamos.payout_update', 'on', true);
    UPDATE posts SET
      under_review = FALSE,
      submitted_fix_by_id = NULL,
      submitted_fix_by_name = NULL,
      submitted_fix_by_avatar = NULL,
      submitted_fix_at = NULL,
      submitted_fix_image_url = NULL,
      submitted_fix_note = NULL,
      submitted_fix_proof_text = NULL,
      submitted_fix_lightning_address = NULL,
      submitted_fix_payout_invoice = NULL,
      submitted_fix_payment_hash = NULL,
      anonymous_claim_token_hash = NULL
    WHERE id = p_post_id;
    PERFORM set_config('ganamos.payout_update', 'off', true);
    PERFORM set_config('ganamos.trusted_update', 'off', true);

    RETURN jsonb_build_object('success', TRUE, 'approved', FALSE, 'post_id', p_post_id,
                              'transaction_id', NULL, 'new_balance', NULL);
  END IF;

  IF v_post.submitted_fix_by_id IS NOT NULL THEN
    BEGIN
      v_fixer := v_post.submitted_fix_by_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The fix submitter is not a valid account';
    END;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_fixer) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The fix submitter is not a valid account';
    END IF;
  ELSIF v_post.anonymous_claim_token_hash IS NULL AND v_post.submitted_fix_payment_hash IS NULL THEN
    -- Nobody could ever claim this reward
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This anonymous fix has no claim credential';
  END IF;

  RETURN public.ganamos_complete_post_fix(p_post_id, v_fixer, TRUE);
END;
$$;

-- ---------------------------------------------------------------------------
-- close_issue_atomic: owner / group admin closes the issue and pays the
-- fixer they name by username (web: closeIssueAction).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_issue_atomic(
  p_post_id UUID,
  p_fixer_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_fixer UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Post not found';
  END IF;
  IF NOT public.ganamos_can_review_post(v_post.user_id, v_post.group_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the original poster or a group admin can close this issue';
  END IF;
  IF v_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post has been deleted';
  END IF;
  IF v_post.fixed THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post is already marked as fixed';
  END IF;

  SELECT id INTO v_fixer FROM profiles
  WHERE username = BTRIM(p_fixer_username) AND COALESCE(status, 'active') = 'active';
  IF v_fixer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('User "%s" not found', BTRIM(p_fixer_username));
  END IF;

  RETURN public.ganamos_complete_post_fix(p_post_id, v_fixer, FALSE);
END;
$$;

-- ---------------------------------------------------------------------------
-- review_group_member_atomic: an approved group admin (or the creator)
-- approves or rejects a pending join request (web: /api/groups/member-action).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_group_member_atomic(
  p_group_member_id UUID,
  p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_status TEXT := CASE WHEN COALESCE(p_approve, FALSE) THEN 'approved' ELSE 'rejected' END;
  v_group_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authenticated';
  END IF;

  SELECT * INTO v_member FROM group_members WHERE id = p_group_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Member request not found';
  END IF;
  IF NOT public.ganamos_is_group_admin(v_member.group_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only group admins can approve or reject members';
  END IF;
  IF v_member.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This request has already been handled';
  END IF;

  -- Approval never changes the requested role (pending rows are members).
  UPDATE group_members SET status = v_status, updated_at = NOW() WHERE id = p_group_member_id;

  SELECT name INTO v_group_name FROM groups WHERE id = v_member.group_id;
  INSERT INTO activities (user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_member.user_id,
    CASE WHEN v_status = 'approved' THEN 'group_join_approved' ELSE 'group_join_rejected' END,
    v_member.group_id, 'groups', NOW(),
    jsonb_build_object('group_name', v_group_name, 'status', v_status));

  RETURN jsonb_build_object('success', TRUE, 'status', v_status, 'member_id', p_group_member_id);
END;
$$;

-- Signed-in users only; each function authorizes the caller itself.
REVOKE ALL ON FUNCTION public.review_submitted_fix_atomic(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_issue_atomic(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_group_member_atomic(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_submitted_fix_atomic(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_issue_atomic(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_group_member_atomic(UUID, BOOLEAN) TO authenticated, service_role;
