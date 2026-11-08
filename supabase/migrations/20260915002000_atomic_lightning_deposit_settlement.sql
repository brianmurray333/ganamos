-- A provider payment hash may fund at most one internal transaction.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS deposit_request_id UUID,
  ADD COLUMN IF NOT EXISTS deposit_reconcile_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_reconcile_attempts INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_r_hash_str_unique
ON public.transactions (r_hash_str)
WHERE r_hash_str IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_deposit_request_id_unique
ON public.transactions (deposit_request_id)
WHERE deposit_request_id IS NOT NULL;

-- Atomically reserve capacity and create a durable fixed-value invoice intent.
-- Locking the profile serializes concurrent invoice requests for the same account.
CREATE OR REPLACE FUNCTION public.prepare_lightning_deposit(
  p_user_id UUID,
  p_amount INTEGER,
  p_request_id UUID,
  p_payment_hash TEXT
)
RETURNS TABLE(outcome TEXT, transaction_id UUID, current_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_reserved INTEGER;
  v_outstanding INTEGER;
  v_allowed BOOLEAN;
  v_transaction_id UUID;
  v_rearm_failed_intent BOOLEAN := FALSE;
  v_affected INTEGER;
BEGIN
  IF p_request_id IS NULL
    OR p_amount IS NULL
    OR p_amount < 100
    OR p_amount > 10000000
    OR p_payment_hash IS NULL
    OR p_payment_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN QUERY SELECT 'invalid_amount'::TEXT, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT p.* INTO v_profile
  FROM profiles AS p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT t.id INTO v_transaction_id
  FROM transactions AS t
  WHERE t.deposit_request_id = p_request_id
    AND t.user_id = p_user_id
    AND t.amount = p_amount
  FOR UPDATE;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1 FROM transactions AS t
      WHERE t.id = v_transaction_id
        AND t.status = 'pending'
    ) THEN
      RETURN QUERY SELECT 'existing'::TEXT, v_transaction_id, v_profile.balance;
      RETURN;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM transactions AS t
      WHERE t.id = v_transaction_id
        AND t.r_hash_str = p_payment_hash
    ) THEN
      RETURN QUERY SELECT 'request_conflict'::TEXT, NULL::UUID, v_profile.balance;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1 FROM transactions AS t
      WHERE t.id = v_transaction_id
        AND t.status = 'failed'
        AND t.payment_request IS NULL
    ) THEN
      v_rearm_failed_intent := TRUE;
    ELSE
      RETURN QUERY SELECT 'existing'::TEXT, v_transaction_id, v_profile.balance;
      RETURN;
    END IF;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(t.amount), 0)
  INTO v_outstanding, v_reserved
  FROM transactions AS t
  WHERE t.user_id = p_user_id
    AND t.type = 'deposit'
    AND t.status = 'pending';

  IF v_outstanding >= 5 THEN
    RETURN QUERY SELECT 'outstanding_limit'::TEXT, NULL::UUID, v_profile.balance;
    RETURN;
  END IF;

  SELECT cap.allowed INTO STRICT v_allowed
  FROM check_balance_cap(p_user_id, COALESCE(v_profile.balance, 0) + v_reserved + p_amount, FALSE) AS cap;

  IF NOT v_allowed THEN
    RETURN QUERY SELECT 'cap_exceeded'::TEXT, NULL::UUID, v_profile.balance;
    RETURN;
  END IF;

  IF v_rearm_failed_intent THEN
    UPDATE transactions
    SET status = 'pending',
        created_at = NOW(),
        updated_at = NOW(),
        deposit_reconcile_after = NOW(),
        deposit_reconcile_attempts = 0,
        r_hash_str = p_payment_hash
    WHERE id = v_transaction_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RAISE EXCEPTION 'deposit intent rearm failed';
    END IF;
    RETURN QUERY SELECT 'prepared'::TEXT, v_transaction_id, v_profile.balance;
    RETURN;
  END IF;

  INSERT INTO transactions (user_id, type, amount, status, memo, r_hash_str, deposit_request_id, deposit_reconcile_after)
  VALUES (p_user_id, 'deposit', p_amount, 'pending', 'Ganamos Lightning deposit intent', p_payment_hash, p_request_id, NOW())
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT 'prepared'::TEXT, v_transaction_id, v_profile.balance;
EXCEPTION
  WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RETURN QUERY SELECT 'cap_check_failed'::TEXT, NULL::UUID, COALESCE(v_profile.balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_lightning_deposit(UUID, INTEGER, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_lightning_deposit(UUID, INTEGER, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.prepare_lightning_deposit(UUID, INTEGER, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_lightning_deposit(UUID, INTEGER, UUID, TEXT) TO service_role;

-- Atomically settle a paid, fixed-value Lightning deposit exactly once.
-- The API preflights deposit caps before creating the irreversible invoice.
-- Once LND has accepted payment, this function always records the liability and credits the user.
CREATE OR REPLACE FUNCTION public.settle_lightning_deposit(
  p_transaction_id UUID,
  p_actual_amount INTEGER
)
RETURNS TABLE(outcome TEXT, amount INTEGER, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction transactions%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_owner_id UUID;
  v_new_balance INTEGER;
  v_affected INTEGER;
BEGIN
  IF p_actual_amount IS NULL OR p_actual_amount < 100 OR p_actual_amount > 10000000 THEN
    RAISE EXCEPTION 'invalid settlement amount';
  END IF;

  SELECT t.user_id INTO v_owner_id
  FROM transactions AS t
  WHERE t.id = p_transaction_id AND t.type = 'deposit';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT p.* INTO v_profile
  FROM profiles AS p
  WHERE p.id = v_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT t.* INTO v_transaction
  FROM transactions AS t
  WHERE t.id = p_transaction_id AND t.type = 'deposit'
  FOR UPDATE;

  IF NOT FOUND OR v_transaction.user_id <> v_owner_id THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  IF v_transaction.status = 'completed' THEN
    RETURN QUERY SELECT 'already_settled'::TEXT, v_transaction.amount, v_profile.balance;
    RETURN;
  END IF;

  IF v_transaction.status <> 'pending' THEN
    RETURN QUERY SELECT 'not_payable'::TEXT, v_transaction.amount, v_profile.balance;
    RETURN;
  END IF;

  IF v_transaction.amount <> p_actual_amount THEN
    RETURN QUERY SELECT 'amount_mismatch'::TEXT, p_actual_amount, v_profile.balance;
    RETURN;
  END IF;

  v_new_balance := COALESCE(v_profile.balance, 0) + p_actual_amount;

  UPDATE profiles AS p
  SET balance = v_new_balance,
      pet_coins = COALESCE(p.pet_coins, 0) + p_actual_amount,
      updated_at = NOW()
  WHERE p.id = v_transaction.user_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION 'deposit profile credit failed';
  END IF;

  UPDATE transactions AS t
  SET status = 'completed',
      amount = p_actual_amount,
      updated_at = NOW()
  WHERE t.id = v_transaction.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION 'deposit settlement transition failed';
  END IF;

  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata, created_at)
  VALUES (
    gen_random_uuid(),
    v_transaction.user_id,
    'bitcoin_received',
    v_transaction.id,
    'transactions',
    NOW(),
    jsonb_build_object(
      'amount', p_actual_amount,
      'description', 'Received ' || p_actual_amount || ' sats via Lightning Network',
      'status', 'completed'
    ),
    NOW()
  );

  RETURN QUERY SELECT 'settled'::TEXT, p_actual_amount, v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_lightning_deposit(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_lightning_deposit(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.settle_lightning_deposit(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_lightning_deposit(UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION public.settle_lightning_deposit(UUID, INTEGER)
IS 'Atomically credits an authenticated, paid, fixed-value Lightning deposit exactly once. Service role only.';
