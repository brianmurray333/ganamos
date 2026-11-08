-- Atomic, once-only reward payouts and deposit credits.
--
-- Fixes:
--  * Fix rewards could be credited repeatedly / with client-chosen amounts.
--    pay_fix_reward() pays a post's stored reward exactly once, recorded by
--    posts.reward_paid_at, in a single transaction with the balance credit.
--  * Settled deposits could be credited twice by overlapping status checks.
--    credit_deposit() flips the transaction pending -> completed and credits
--    the balance in one transaction; a second call is a no-op.
--  * Anonymous fixers had no proof of being the fixer. Their claim token's
--    SHA-256 is stored in posts.anonymous_claim_token_hash.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS reward_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_paid_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anonymous_claim_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS funding_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN posts.funding_transaction_id IS 'Ledger entry that reserved this post''s reward (set by create_post_atomic).';

-- Each funding transaction funds at most one post.
CREATE UNIQUE INDEX IF NOT EXISTS posts_funding_transaction_id_unique
  ON posts (funding_transaction_id) WHERE funding_transaction_id IS NOT NULL;

COMMENT ON COLUMN posts.reward_paid_at IS 'When the fix reward was credited to a fixer balance (set only by pay_fix_reward).';
COMMENT ON COLUMN posts.reward_paid_to IS 'Profile credited with the fix reward.';
COMMENT ON COLUMN posts.anonymous_claim_token_hash IS 'SHA-256 (hex) of the secret given to an anonymous fixer; required to claim or route their reward.';

-- Backfill: fixed posts were already paid, except anonymous fixes whose reward
-- is still unclaimed (those are paid later via claim or Lightning).
UPDATE posts
SET reward_paid_at = COALESCE(fixed_at, NOW())
WHERE fixed = TRUE
  AND deleted_at IS NULL -- deleted posts can't be paid; some environments reject updates to them
  AND reward_paid_at IS NULL
  AND NOT (COALESCE(fixed_by_is_anonymous, FALSE) AND anonymous_reward_paid_at IS NULL);

-- ---------------------------------------------------------------------------
-- pay_fix_reward: credit a post's stored reward to a fixer, exactly once.
-- Callers (server only) are responsible for authorization and fix
-- verification; this guarantees amount and once-only semantics.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pay_fix_reward(
  p_post_id UUID,
  p_fixer_id UUID,
  p_memo TEXT
)
RETURNS TABLE (transaction_id UUID, amount INTEGER, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward INTEGER;
  v_paid_at TIMESTAMPTZ;
  v_anon_paid_at TIMESTAMPTZ;
  v_deleted_at TIMESTAMPTZ;
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  SELECT p.reward, p.reward_paid_at, p.anonymous_reward_paid_at, p.deleted_at
    INTO v_reward, v_paid_at, v_anon_paid_at, v_deleted_at
  FROM posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'post_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_paid_at IS NOT NULL OR v_anon_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'reward_already_paid' USING ERRCODE = 'P0001';
  END IF;
  IF v_reward IS NULL OR v_reward <= 0 THEN
    RAISE EXCEPTION 'no_reward' USING ERRCODE = 'P0001';
  END IF;

  UPDATE profiles
  SET balance = COALESCE(balance, 0) + v_reward,
      pet_coins = COALESCE(pet_coins, 0) + v_reward,
      fixed_issues_count = COALESCE(fixed_issues_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_fixer_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fixer_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Let protect_post_financial_fields accept the marker however this
  -- function is invoked (transaction-local; not settable via the REST API).
  PERFORM set_config('ganamos.payout_update', 'on', true);
  UPDATE posts
  SET reward_paid_at = NOW(), reward_paid_to = p_fixer_id
  WHERE id = p_post_id;
  PERFORM set_config('ganamos.payout_update', 'off', true);

  IF (SELECT reward_paid_at FROM posts WHERE id = p_post_id) IS NULL THEN
    RAISE EXCEPTION 'payout_marker_not_set';
  END IF;

  INSERT INTO transactions (user_id, type, amount, status, memo)
  VALUES (p_fixer_id, 'internal', v_reward, 'completed', p_memo)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_tx_id, v_reward, v_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- credit_deposit: complete a pending deposit and credit the balance once.
-- Returns the new balance, or NULL if the transaction was not pending for
-- this user (already credited, or not theirs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_deposit(
  p_transaction_id UUID,
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  UPDATE transactions
  SET status = 'completed', amount = p_amount, updated_at = NOW()
  WHERE id = p_transaction_id
    AND user_id = p_user_id
    AND type = 'deposit'
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE profiles
  SET balance = COALESCE(balance, 0) + p_amount,
      pet_coins = COALESCE(pet_coins, 0) + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    -- Roll back the status change so the deposit stays retryable.
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_balance;
END;
$$;

-- Server (service_role) only. Browsers must never call these directly.
REVOKE ALL ON FUNCTION pay_fix_reward(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION credit_deposit(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pay_fix_reward(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION credit_deposit(UUID, UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Extend the post field guard (from 20260328000000_rls_security_hardening):
-- browser sessions (owner RLS updates) must not be able to reset payout
-- markers or redirect an anonymous fixer's payout.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_post_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.reward := OLD.reward;
  NEW.original_reward := OLD.original_reward;
  NEW.fixed := OLD.fixed;
  NEW.fixed_by := OLD.fixed_by;
  NEW.fixed_at := OLD.fixed_at;
  NEW.total_boost_amount := OLD.total_boost_amount;

  -- Ownership, funding and lifecycle fields: the "submit a fix" RLS policy
  -- lets any session update an open post, so these must be pinned too
  -- (agent API approve/claim and payouts rely on them).
  NEW.user_id := OLD.user_id;
  NEW.is_anonymous := OLD.is_anonymous;
  NEW.funding_r_hash := OLD.funding_r_hash;
  NEW.funding_status := OLD.funding_status;
  NEW.funding_payment_request := OLD.funding_payment_request;
  NEW.submitted_fix_payment_hash := OLD.submitted_fix_payment_hash;
  NEW.deleted_at := OLD.deleted_at;
  -- Expiration is owner-editable (the iOS app PATCHes it directly), but not
  -- by other sessions using the fix-submission policy.
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NOT (
       auth.uid() = OLD.user_id
       OR EXISTS (
         SELECT 1 FROM connected_accounts ca
         WHERE ca.primary_user_id = auth.uid() AND ca.connected_user_id = OLD.user_id
       )
     ) THEN
    NEW.expires_at := OLD.expires_at;
  END IF;

  -- Payout markers may only be written by pay_fix_reward (or service_role).
  IF current_setting('ganamos.payout_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Payout state
  NEW.reward_paid_at := OLD.reward_paid_at;
  NEW.reward_paid_to := OLD.reward_paid_to;
  NEW.funding_transaction_id := OLD.funding_transaction_id;
  NEW.anonymous_claim_token_hash := OLD.anonymous_claim_token_hash;
  NEW.anonymous_reward_paid_at := OLD.anonymous_reward_paid_at;
  NEW.anonymous_reward_payment_hash := OLD.anonymous_reward_payment_hash;
  NEW.anonymous_reward_payment_lock := OLD.anonymous_reward_payment_lock;
  NEW.submitted_fix_lightning_address := OLD.submitted_fix_lightning_address;
  NEW.submitted_fix_payout_invoice := OLD.submitted_fix_payout_invoice;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- A paid funding invoice may fund only one post. Partial index (new rows
-- only) so any historical duplicates can't block this migration.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS posts_funding_r_hash_unique_new
  ON posts (funding_r_hash)
  WHERE funding_r_hash IS NOT NULL AND created_at >= '2026-11-08';

-- ---------------------------------------------------------------------------
-- Browser sessions may INSERT posts directly (RLS). They must not be able to
-- pre-set funding/payout state or backdate a post.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_post_insert_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := NULLIF(current_setting('request.jwt.claims', true), '')::json->>'role';
BEGIN
  -- Only API requests from browsers (anon/authenticated JWT) are restricted;
  -- service_role, trusted functions and direct DB sessions (no JWT) are not.
  IF v_role IS NULL OR v_role = 'service_role'
     OR current_setting('ganamos.payout_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.created_at := NOW();
  NEW.fixed := FALSE;
  NEW.fixed_by := NULL;
  NEW.fixed_at := NULL;
  NEW.deleted_at := NULL;
  NEW.funding_transaction_id := NULL;
  NEW.funding_status := NULL;
  NEW.funding_r_hash := NULL;
  NEW.funding_payment_request := NULL;
  NEW.reward_paid_at := NULL;
  NEW.reward_paid_to := NULL;
  NEW.anonymous_claim_token_hash := NULL;
  NEW.anonymous_reward_paid_at := NULL;
  NEW.anonymous_reward_payment_hash := NULL;
  NEW.anonymous_reward_payment_lock := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_post_insert_fields ON posts;
CREATE TRIGGER protect_post_insert_fields
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION protect_post_insert_fields();

-- ---------------------------------------------------------------------------
-- create_post_atomic: unchanged except it records funding_transaction_id.
-- (CREATE OR REPLACE keeps its existing grants.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_post_atomic(
  p_post_id UUID,
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_image_url TEXT DEFAULT NULL,
  p_has_image BOOLEAN DEFAULT FALSE,
  p_location TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_reward INTEGER DEFAULT 0,
  p_group_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT NULL,
  p_created_by_avatar TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_reward_allowed BOOLEAN;
  v_live_allowed BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authenticated';
  END IF;

  IF p_post_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Post ID and user ID are required';
  END IF;

  IF v_actor_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.connected_accounts ca
    WHERE ca.primary_user_id = v_actor_id AND ca.connected_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Unauthorized account';
  END IF;

  IF NULLIF(BTRIM(p_title), '') IS NULL OR NULLIF(BTRIM(p_description), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Title and description are required';
  END IF;

  IF p_reward < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Reward cannot be negative';
  END IF;

  SELECT allowed INTO v_live_allowed FROM public.check_live_posts_cap() LIMIT 1;
  IF COALESCE(v_live_allowed, TRUE) = FALSE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The live post limit has been reached';
  END IF;

  IF p_reward > 0 THEN
    SELECT allowed INTO v_reward_allowed
    FROM public.check_post_reward_cap(p_user_id, p_reward) LIMIT 1;
    IF COALESCE(v_reward_allowed, TRUE) = FALSE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post reward exceeds the maximum allowed amount';
    END IF;

    SELECT balance INTO v_balance
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'User profile not found';
    END IF;
    IF v_balance < p_reward THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Insufficient balance';
    END IF;
    v_new_balance := v_balance - p_reward;
  ELSE
    SELECT balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'User profile not found';
    END IF;
    v_new_balance := v_balance;
  END IF;

  INSERT INTO public.posts (
    id, user_id, created_by, created_by_avatar, title, description,
    image_url, has_image, location, latitude, longitude, reward,
    claimed, fixed, group_id, assigned_to, city, is_anonymous, expires_at
  ) VALUES (
    p_post_id, p_user_id, p_created_by, p_created_by_avatar,
    BTRIM(p_title), BTRIM(p_description), p_image_url, p_has_image,
    NULLIF(BTRIM(p_location), ''), p_latitude, p_longitude, p_reward,
    FALSE, FALSE, p_group_id, p_assigned_to, NULLIF(BTRIM(p_city), ''),
    FALSE, p_expires_at
  );

  IF p_reward > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, memo)
    VALUES (p_user_id, 'internal', -p_reward, 'completed',
      COALESCE(NULLIF(BTRIM(p_memo), ''), 'Post reward for issue'))
    RETURNING id INTO v_transaction_id;

    -- Record which ledger entry funded this post (used to authorize payouts
    -- and refunds). Transaction-local flag lets the post guard accept it.
    PERFORM set_config('ganamos.payout_update', 'on', true);
    UPDATE public.posts SET funding_transaction_id = v_transaction_id WHERE id = p_post_id;
    PERFORM set_config('ganamos.payout_update', 'off', true);

    UPDATE public.profiles
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_user_id AND balance = v_balance;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Balance changed concurrently; please retry';
    END IF;
  END IF;

  INSERT INTO public.activities (
    id, user_id, type, related_id, related_table, timestamp, metadata
  ) VALUES (
    gen_random_uuid(), p_user_id, 'post', p_post_id, 'posts', NOW(),
    jsonb_strip_nulls(jsonb_build_object(
      'title', COALESCE(NULLIF(BTRIM(p_memo), ''), BTRIM(p_title)),
      'reward', p_reward, 'transaction_id', v_transaction_id
    ))
  );

  RETURN jsonb_build_object(
    'success', TRUE, 'post_id', p_post_id,
    'transaction_id', v_transaction_id, 'new_balance', v_new_balance
  );
END;
$$;

-- The post guard (replaced above) pins funding_transaction_id for sessions
-- without a service_role JWT, which includes this migration; allow it here.
SELECT set_config('ganamos.payout_update', 'on', false);

-- Backfill funding links for existing posts from the post-creation activity
-- (written by create_post_atomic), only where the ledger entry is a completed
-- internal deduction by the post owner, and each entry funds one post.
WITH candidates AS (
  SELECT DISTINCT ON (t.id) p.id AS post_id, t.id AS tx_id
  FROM posts p
  JOIN activities a
    ON a.related_id = p.id AND a.type = 'post' AND a.user_id = p.user_id
   AND (a.metadata->>'transaction_id') IS NOT NULL
  JOIN transactions t
    ON t.id = (a.metadata->>'transaction_id')::uuid
  WHERE p.funding_transaction_id IS NULL
    AND p.deleted_at IS NULL -- deleted posts can't be paid or refunded
    AND p.user_id IS NOT NULL
    AND t.user_id = p.user_id
    AND t.type = 'internal'
    AND t.status = 'completed'
    AND t.amount < 0
    AND NOT EXISTS (SELECT 1 FROM posts p2 WHERE p2.funding_transaction_id = t.id)
  ORDER BY t.id, p.created_at
)
UPDATE posts p
SET funding_transaction_id = c.tx_id
FROM candidates c
WHERE p.id = c.post_id;

SELECT set_config('ganamos.payout_update', 'off', false);
