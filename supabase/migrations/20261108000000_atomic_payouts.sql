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
  ADD COLUMN IF NOT EXISTS anonymous_claim_token_hash TEXT;

COMMENT ON COLUMN posts.reward_paid_at IS 'When the fix reward was credited to a fixer balance (set only by pay_fix_reward).';
COMMENT ON COLUMN posts.reward_paid_to IS 'Profile credited with the fix reward.';
COMMENT ON COLUMN posts.anonymous_claim_token_hash IS 'SHA-256 (hex) of the secret given to an anonymous fixer; required to claim or route their reward.';

-- Backfill: fixed posts were already paid, except anonymous fixes whose reward
-- is still unclaimed (those are paid later via claim or Lightning).
UPDATE posts
SET reward_paid_at = COALESCE(fixed_at, NOW())
WHERE fixed = TRUE
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
  NEW.expires_at := OLD.expires_at;

  -- Payout markers may only be written by pay_fix_reward (or service_role).
  IF current_setting('ganamos.payout_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Payout state
  NEW.reward_paid_at := OLD.reward_paid_at;
  NEW.reward_paid_to := OLD.reward_paid_to;
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
