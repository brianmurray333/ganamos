-- Money-path hardening (security review 2026-11-08).
--
-- 1. Wallet functions were executable by browsers. update_withdrawal_complete
--    and atomic_transfer never revoked Postgres' default PUBLIC EXECUTE, and
--    create_pending_withdrawal was granted to `authenticated`. None checks
--    auth.uid(), so any session could:
--      * mint sats: create_pending_withdrawal(me, -N) then
--        update_withdrawal_complete(tx, me, _, -N) adds N to the balance;
--      * move any user's balance to itself via atomic_transfer;
--      * complete its own pending withdrawal for 0 sats while the server is
--        still paying it.
--    All are now service_role only. Amounts must be positive, and a withdrawal
--    is completed for exactly the amount it reserved.
-- 2. Transfers and rewarded posts ignored pending withdrawals, so one balance
--    could be withdrawn (e.g. to a held invoice) and transferred/posted again.
-- 3. pay_fix_reward ignored an in-flight anonymous Lightning payout lock, so
--    the reward could be credited internally while the Lightning payout was
--    still pending (or uncertain) and paid twice.
-- 4. posts.fixed_by_is_anonymous was not pinned for browser sessions; the
--    owner (or a group admin) could flip it and claim the reward into an
--    account without a server-side approval or funding check.
-- 5. Refunds of deleted/expired posts were plain read-modify-write balance
--    updates; refund_post_reward() does it atomically, once, and never for a
--    reward that has been paid or has a payout in flight.

-- ---------------------------------------------------------------------------
-- 1. Wallet functions: server only, positive amounts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_pending_withdrawal(
  p_transaction_id UUID,
  p_user_id UUID,
  p_amount INTEGER,
  p_payment_request TEXT,
  p_memo TEXT,
  p_requires_approval BOOLEAN,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_balance BIGINT;
  v_pending_withdrawals BIGINT;
  v_available_balance BIGINT;
  v_status TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal amount must be positive');
  END IF;

  SELECT balance INTO v_stored_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_stored_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User profile not found');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending_withdrawals
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'withdrawal'
    AND status IN ('pending', 'pending_approval');

  v_available_balance := v_stored_balance - v_pending_withdrawals;

  IF v_available_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'available_balance', v_available_balance,
      'requested_amount', p_amount
    );
  END IF;

  v_status := CASE WHEN p_requires_approval THEN 'pending_approval' ELSE 'pending' END;

  INSERT INTO transactions (
    id, user_id, type, amount, status, payment_request, memo,
    requires_approval, ip_address, user_agent, created_at, updated_at
  ) VALUES (
    p_transaction_id, p_user_id, 'withdrawal', p_amount, v_status, p_payment_request, p_memo,
    p_requires_approval, p_ip_address, p_user_agent, NOW(), NOW()
  );

  RETURN json_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'status', v_status,
    'available_balance', v_available_balance - p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION update_withdrawal_complete(
  p_transaction_id UUID,
  p_user_id UUID,
  p_payment_hash TEXT,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_tx_amount INTEGER;
  v_updated_rows INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal amount must be positive');
  END IF;

  SELECT balance INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- The completed amount must be exactly what this withdrawal reserved.
  SELECT amount INTO v_tx_amount
  FROM transactions
  WHERE id = p_transaction_id
    AND user_id = p_user_id
    AND status = 'pending'
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Transaction not found or already processed',
      'transaction_id', p_transaction_id
    );
  END IF;

  IF v_tx_amount IS DISTINCT FROM p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Withdrawal amount does not match the pending transaction',
      'transaction_id', p_transaction_id
    );
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'current_balance', v_current_balance,
      'requested_amount', p_amount
    );
  END IF;

  v_new_balance := v_current_balance - p_amount;

  UPDATE transactions
  SET status = 'completed', payment_hash = p_payment_hash, updated_at = NOW()
  WHERE id = p_transaction_id
    AND user_id = p_user_id
    AND status = 'pending'
    AND type = 'withdrawal';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Transaction not found or already processed',
      'transaction_id', p_transaction_id
    );
  END IF;

  UPDATE profiles
  SET balance = v_new_balance, updated_at = NOW()
  WHERE id = p_user_id AND balance >= p_amount;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Balance update failed - concurrent modification detected';
  END IF;

  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_id', p_transaction_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$func$;

-- ---------------------------------------------------------------------------
-- 2. Transfers can't spend sats reserved by pending withdrawals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION atomic_transfer(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_amount INTEGER,
  p_sender_tx_id UUID,
  p_receiver_tx_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_sender_balance INTEGER;
  v_receiver_balance INTEGER;
  v_sender_pet_coins INTEGER;
  v_receiver_pet_coins INTEGER;
  v_sender_pending BIGINT;
  v_sender_new_balance INTEGER;
  v_receiver_new_balance INTEGER;
  v_updated_rows INTEGER;
BEGIN
  IF p_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Transfer amount must be positive');
  END IF;

  IF p_sender_id < p_receiver_id THEN
    SELECT balance, pet_coins INTO v_sender_balance, v_sender_pet_coins
    FROM profiles WHERE id = p_sender_id FOR UPDATE;
    SELECT balance, pet_coins INTO v_receiver_balance, v_receiver_pet_coins
    FROM profiles WHERE id = p_receiver_id FOR UPDATE;
  ELSE
    SELECT balance, pet_coins INTO v_receiver_balance, v_receiver_pet_coins
    FROM profiles WHERE id = p_receiver_id FOR UPDATE;
    SELECT balance, pet_coins INTO v_sender_balance, v_sender_pet_coins
    FROM profiles WHERE id = p_sender_id FOR UPDATE;
  END IF;

  IF v_sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender profile not found');
  END IF;
  IF v_receiver_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Receiver profile not found');
  END IF;

  -- Sats reserved by pending withdrawals are not spendable.
  SELECT COALESCE(SUM(amount), 0) INTO v_sender_pending
  FROM transactions
  WHERE user_id = p_sender_id
    AND type = 'withdrawal'
    AND status IN ('pending', 'pending_approval');

  IF v_sender_balance - v_sender_pending < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'current_balance', v_sender_balance - v_sender_pending,
      'requested_amount', p_amount
    );
  END IF;

  v_sender_new_balance := v_sender_balance - p_amount;
  v_receiver_new_balance := v_receiver_balance + p_amount;

  UPDATE profiles
  SET balance = v_sender_new_balance,
      pet_coins = COALESCE(v_sender_pet_coins, 0) - p_amount,
      updated_at = NOW()
  WHERE id = p_sender_id AND balance >= p_amount;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Sender balance update failed - concurrent modification detected');
  END IF;

  UPDATE profiles
  SET balance = v_receiver_new_balance,
      pet_coins = COALESCE(v_receiver_pet_coins, 0) + p_amount,
      updated_at = NOW()
  WHERE id = p_receiver_id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Receiver balance update failed';
  END IF;

  -- The two ledger rows must be this transfer's own pending rows.
  UPDATE transactions
  SET status = 'completed', updated_at = NOW()
  WHERE status = 'pending'
    AND type = 'internal'
    AND ((id = p_sender_tx_id AND user_id = p_sender_id AND amount = -p_amount)
      OR (id = p_receiver_tx_id AND user_id = p_receiver_id AND amount = p_amount));

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows != 2 THEN
    RAISE EXCEPTION 'Transaction update failed - expected 2 updates, got %', v_updated_rows;
  END IF;

  RETURN json_build_object(
    'success', true,
    'sender_new_balance', v_sender_new_balance,
    'receiver_new_balance', v_receiver_new_balance,
    'sender_tx_id', p_sender_tx_id,
    'receiver_tx_id', p_receiver_tx_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$func$;

REVOKE ALL ON FUNCTION create_pending_withdrawal(UUID, UUID, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_withdrawal_complete(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atomic_transfer(UUID, UUID, INTEGER, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_pending_withdrawal(UUID, UUID, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_withdrawal_complete(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION atomic_transfer(UUID, UUID, INTEGER, UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. pay_fix_reward: also refuse while an anonymous Lightning payout is in
--    flight (or was left locked after an uncertain failure).
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
  v_lock TEXT;
  v_deleted_at TIMESTAMPTZ;
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  SELECT p.reward, p.reward_paid_at, p.anonymous_reward_paid_at, p.anonymous_reward_payment_lock::text, p.deleted_at
    INTO v_reward, v_paid_at, v_anon_paid_at, v_lock, v_deleted_at
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
  IF v_lock IS NOT NULL THEN
    RAISE EXCEPTION 'reward_payout_in_progress' USING ERRCODE = 'P0001';
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

REVOKE ALL ON FUNCTION pay_fix_reward(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pay_fix_reward(UUID, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 4/5. Refund marker + pin fixed_by_is_anonymous for browser sessions.
-- ---------------------------------------------------------------------------
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reward_refunded_at TIMESTAMPTZ;
COMMENT ON COLUMN posts.reward_refunded_at IS 'When the reward was refunded to the poster (set only by refund_post_reward).';

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

CREATE OR REPLACE FUNCTION protect_post_insert_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := NULLIF(current_setting('request.jwt.claims', true), '')::json->>'role';
BEGIN
  IF v_role IS NULL OR v_role = 'service_role'
     OR current_setting('ganamos.payout_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.created_at := NOW();
  NEW.fixed := FALSE;
  NEW.fixed_by := NULL;
  NEW.fixed_at := NULL;
  NEW.fixed_by_is_anonymous := FALSE;
  NEW.deleted_at := NULL;
  NEW.funding_transaction_id := NULL;
  NEW.funding_status := NULL;
  NEW.funding_r_hash := NULL;
  NEW.funding_payment_request := NULL;
  NEW.reward_paid_at := NULL;
  NEW.reward_paid_to := NULL;
  NEW.reward_refunded_at := NULL;
  NEW.anonymous_claim_token_hash := NULL;
  NEW.anonymous_reward_paid_at := NULL;
  NEW.anonymous_reward_payment_hash := NULL;
  NEW.anonymous_reward_payment_lock := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- refund_post_reward: credit a deleted/expired post's reward back to its
-- owner exactly once. Callers (server only) check funding first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_post_reward(
  p_post_id UUID,
  p_memo TEXT
)
RETURNS TABLE (transaction_id UUID, amount INTEGER, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  SELECT p.user_id, p.reward, p.deleted_at, p.fixed, p.reward_paid_at, p.reward_refunded_at,
         p.anonymous_reward_paid_at, p.anonymous_reward_payment_lock
    INTO v_post
  FROM posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_post.deleted_at IS NULL THEN
    RAISE EXCEPTION 'post_not_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_post.reward_refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'reward_already_refunded' USING ERRCODE = 'P0001';
  END IF;
  IF v_post.fixed OR v_post.reward_paid_at IS NOT NULL OR v_post.anonymous_reward_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'reward_already_paid' USING ERRCODE = 'P0001';
  END IF;
  IF v_post.anonymous_reward_payment_lock IS NOT NULL THEN
    RAISE EXCEPTION 'reward_payout_in_progress' USING ERRCODE = 'P0001';
  END IF;
  IF v_post.user_id IS NULL THEN
    RAISE EXCEPTION 'no_owner' USING ERRCODE = 'P0001';
  END IF;
  IF v_post.reward IS NULL OR v_post.reward <= 0 THEN
    RAISE EXCEPTION 'no_reward' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('ganamos.payout_update', 'on', true);
  UPDATE posts SET reward_refunded_at = NOW() WHERE id = p_post_id;
  PERFORM set_config('ganamos.payout_update', 'off', true);

  UPDATE profiles
  SET balance = COALESCE(balance, 0) + v_post.reward, updated_at = NOW()
  WHERE id = v_post.user_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO transactions (user_id, type, amount, status, memo)
  VALUES (v_post.user_id, 'internal', v_post.reward, 'completed', p_memo)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_tx_id, v_post.reward::integer, v_balance;
END;
$$;

REVOKE ALL ON FUNCTION refund_post_reward(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refund_post_reward(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Group admin self-promotion. The group_members INSERT policy didn't
--    restrict role/status, so anyone could insert themselves as an approved
--    admin of any group, then approve/close (and pay out) its posts. Only a
--    group's creator may add themselves as admin; everyone else joins as a
--    pending member and is approved by an existing admin.
-- ---------------------------------------------------------------------------
-- RLS-free helpers (policies on group_members/groups reference each other;
-- calling these avoids policy recursion). They only answer about the caller.
CREATE OR REPLACE FUNCTION public.ganamos_is_group_creator(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM groups g WHERE g.id = p_group_id AND g.created_by = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.ganamos_is_group_admin(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.ganamos_is_group_creator(p_group_id) OR EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
      AND gm.status = 'approved'
  )
$$;

REVOKE ALL ON FUNCTION public.ganamos_is_group_creator(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ganamos_is_group_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ganamos_is_group_creator(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ganamos_is_group_admin(UUID) TO authenticated, service_role;

-- Permissive policies are OR'ed: also drop the older self-insert policy that
-- exists in production (not created by repo migrations) and allows any role.
DROP POLICY IF EXISTS "Users can create their own group memberships" ON group_members;
DROP POLICY IF EXISTS "Users can insert group membership" ON group_members;
CREATE POLICY "Users can insert group membership" ON group_members
  FOR INSERT WITH CHECK (
    (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM connected_accounts
        WHERE primary_user_id = auth.uid()
          AND connected_user_id = group_members.user_id
      )
    )
    AND (
      (role = 'member' AND status = 'pending')
      OR (user_id = auth.uid() AND public.ganamos_is_group_creator(group_id))
    )
  );

-- Existing approved admins (not pending rows) manage memberships.
DROP POLICY IF EXISTS "Group admins can update memberships" ON group_members;
CREATE POLICY "Group admins can update memberships" ON group_members
  FOR UPDATE USING (public.ganamos_is_group_admin(group_id));

-- ---------------------------------------------------------------------------
-- 7. Profiles could be INSERTed by the user with any balance/pet_coins (the
--    balance guard is BEFORE UPDATE only). New browser-created profiles start
--    empty.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_profile_insert_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := NULLIF(current_setting('request.jwt.claims', true), '')::json->>'role';
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.balance := 0;
  NEW.pet_coins := 0;
  NEW.fixed_issues_count := 0;
  NEW.status := 'active';
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_insert_fields ON profiles;
CREATE TRIGGER protect_profile_insert_fields
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_insert_fields();

-- ---------------------------------------------------------------------------
-- 8. Money functions still executable by browsers.
--    * transfer_sats_to_username / family_transfer_sats: `auth.uid() != x`
--      is NULL for anon, so the auth check never fired (anyone could move any
--      user's balance), and negative amounts were accepted. Unused by the app.
--    * spend_coins (granted to anon) takes any p_user_id.
--    * get_active_user_wallet / disconnect_user_wallet take any p_user_id.
--    * Pickleball functions: revoking from PUBLIC alone leaves Supabase's
--      explicit anon/authenticated grants in place.
--    All callers in the app use the service role.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'transfer_sats_to_username(uuid, text, integer, text)',
    'family_transfer_sats(uuid, uuid, integer, text)',
    'spend_coins(character varying, uuid, uuid, integer, character varying, timestamp with time zone)',
    'get_active_user_wallet(uuid)',
    'disconnect_user_wallet(uuid)',
    'join_pickleball_game_atomic(uuid, jsonb)',
    'set_pickleball_wager_consent(uuid, uuid, boolean)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. pet_orders: UPDATE/SELECT were USING (true) for everyone, so anyone
--    could mark an order paid (free device) or read every customer's name,
--    email and address. All app access goes through the service role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pet_orders_update ON pet_orders;
DROP POLICY IF EXISTS "pet_orders_update" ON pet_orders;
CREATE POLICY pet_orders_update ON pet_orders
  FOR UPDATE TO service_role USING (true);
DROP POLICY IF EXISTS pet_orders_select ON pet_orders;
DROP POLICY IF EXISTS "pet_orders_select" ON pet_orders;
CREATE POLICY pet_orders_select ON pet_orders
  FOR SELECT TO service_role USING (true);

-- ---------------------------------------------------------------------------
-- 10. create_post_atomic: don't fund rewards from sats reserved by pending
--     withdrawals, and allow trusted server callers (service_role, e.g. the
--     Alexa job route, which has no user JWT) so every rewarded post is
--     funded atomically with a funding_transaction_id.
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
  v_is_service BOOLEAN := COALESCE(NULLIF(current_setting('request.jwt.claims', TRUE), '')::jsonb->>'role', '') = 'service_role';
  v_balance INTEGER;
  v_pending BIGINT;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_reward_allowed BOOLEAN;
  v_live_allowed BOOLEAN;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authenticated';
  END IF;

  IF p_post_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Post ID and user ID are required';
  END IF;

  IF NOT v_is_service AND v_actor_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.connected_accounts ca
    WHERE ca.primary_user_id = v_actor_id AND ca.connected_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Unauthorized account';
  END IF;

  IF NULLIF(BTRIM(p_title), '') IS NULL OR NULLIF(BTRIM(p_description), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Title and description are required';
  END IF;

  IF p_reward IS NULL OR p_reward < 0 THEN
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

    SELECT COALESCE(SUM(amount), 0) INTO v_pending
    FROM public.transactions
    WHERE user_id = p_user_id
      AND type = 'withdrawal'
      AND status IN ('pending', 'pending_approval');

    IF v_balance - v_pending < p_reward THEN
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

REVOKE ALL ON FUNCTION public.create_post_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_post_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) TO authenticated, service_role;
