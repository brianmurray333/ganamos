-- Parents acting for a connected child account can review (approve & pay / send
-- back) and close the child's posts and posts in groups the child admins.
--
-- The web server actions apply the same rule in lib/post-review-auth.ts.
--
-- SECURITY
-- * The parent is always auth.uid(); the child is derived from
--   connected_accounts, which only the service role can write (rows are
--   created when a parent creates a child account), so nobody can link
--   themselves to another person's account.
-- * One hop only: a child's own connected accounts don't count.
-- * Only active child profiles count (suspended / deleted ones don't; NULL
--   status counts as active, as in close_issue_atomic).

CREATE OR REPLACE FUNCTION public.ganamos_can_review_post(p_user_id UUID, p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- 1. the post's owner
    p_user_id = auth.uid()
    -- 2. an approved admin of the post's group
    OR (p_group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()
        AND gm.role = 'admin' AND gm.status = 'approved'
    ))
    -- 3a. a parent of the owner
    OR (p_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM connected_accounts ca
      JOIN profiles child ON child.id = ca.connected_user_id
      WHERE ca.primary_user_id = auth.uid()
        AND ca.connected_user_id = p_user_id
        AND ca.connected_user_id <> auth.uid()
        AND COALESCE(child.status, 'active') = 'active'
    ))
    -- 3b. a parent of an approved admin of the post's group
    OR (p_group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM connected_accounts ca
      JOIN profiles child ON child.id = ca.connected_user_id
      JOIN group_members gm ON gm.user_id = ca.connected_user_id
      WHERE ca.primary_user_id = auth.uid()
        AND ca.connected_user_id <> auth.uid()
        AND COALESCE(child.status, 'active') = 'active'
        AND gm.group_id = p_group_id
        AND gm.role = 'admin' AND gm.status = 'approved'
    ))
  )
$$;
REVOKE ALL ON FUNCTION public.ganamos_can_review_post(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ganamos_can_review_post(UUID, UUID) TO service_role;

-- Production defines this helper outside the migrations; (re)create it with
-- the same signature and body so every environment has it. SECURITY DEFINER
-- so the group_members policy below can call it without recursing into RLS.
CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id
    AND user_id = check_user_id
    AND status = 'approved'
  );
$$;

-- Let a parent read their children's own membership rows (which groups the
-- child is in and its role there), so the app can tell, while viewing as the
-- child, which groups' fixes the child may review. Read-only, and only the
-- child's own rows: other members of those groups stay hidden unless the
-- parent is in the group too.
DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;
CREATE POLICY "Users can view group members of their groups" ON group_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_group_member(group_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM connected_accounts ca
      WHERE ca.primary_user_id = auth.uid()
        AND ca.connected_user_id = group_members.user_id
    )
  );


-- Self-dealing guard (web: isSelfDealingReview in lib/post-review-auth.ts).
-- The post owner, or a parent acting for the owning child, spends their own
-- family's reward and may pay anyone. Anyone whose authority comes from
-- administering the group must not pay it to themselves or their own child,
-- nor approve an anonymous fix (they could have submitted it logged out).
-- NULL-safe: an owner-less post counts as "not the reviewer's".
CREATE OR REPLACE FUNCTION public.ganamos_review_is_self_dealing(p_owner_id UUID, p_fixer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND NOT (
      p_owner_id IS NOT NULL AND (
        p_owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM connected_accounts ca
          JOIN profiles child ON child.id = ca.connected_user_id
          WHERE ca.primary_user_id = auth.uid()
            AND ca.connected_user_id = p_owner_id
            AND ca.connected_user_id <> auth.uid()
            AND COALESCE(child.status, 'active') = 'active'
        )
      )
    )
    AND (
      p_fixer_id IS NULL
      OR p_fixer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM connected_accounts ca
        WHERE ca.primary_user_id = auth.uid() AND ca.connected_user_id = p_fixer_id
      )
    ),
    TRUE  -- anything indeterminate counts as a conflict
  )
$$;
REVOKE ALL ON FUNCTION public.ganamos_review_is_self_dealing(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ganamos_review_is_self_dealing(UUID, UUID) TO service_role;

-- Same as 20261109000000, plus the self-dealing guard above.
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

  -- An admin (or a parent acting for an admin child) can't pay someone
  -- else's reward to themselves or their own child, or approve an anonymous
  -- fix on it (20261122000000).
  IF auth.uid() IS NOT NULL
     AND public.ganamos_review_is_self_dealing(v_post.user_id, p_fixer_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = CASE WHEN p_fixer_id IS NULL
        THEN 'Only the post owner can approve an anonymous fix on this post'
        ELSE 'You can''t approve your own fix (or your child''s) on someone else''s post' END;
  END IF;

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
