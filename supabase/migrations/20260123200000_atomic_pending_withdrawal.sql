-- Migration: Atomic withdrawal initiation function
-- This prevents race conditions by locking the row and checking balance atomically

-- Atomically check balance and create pending withdrawal
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
AS $$
DECLARE
  v_stored_balance BIGINT;
  v_pending_withdrawals BIGINT;
  v_available_balance BIGINT;
  v_status TEXT;
BEGIN
  -- Lock the profile row to prevent concurrent withdrawals
  SELECT balance INTO v_stored_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_stored_balance IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User profile not found'
    );
  END IF;

  -- Get sum of pending withdrawals (with profile row locked, no new ones can be created)
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_withdrawals
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'withdrawal'
    AND status IN ('pending', 'pending_approval');

  -- Calculate available balance
  v_available_balance := v_stored_balance - v_pending_withdrawals;

  -- Check if user has sufficient available balance
  IF v_available_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'available_balance', v_available_balance,
      'requested_amount', p_amount
    );
  END IF;

  -- Determine status based on approval requirement
  v_status := CASE WHEN p_requires_approval THEN 'pending_approval' ELSE 'pending' END;

  -- Insert the pending transaction (still holding the lock)
  INSERT INTO transactions (
    id,
    user_id,
    type,
    amount,
    status,
    payment_request,
    memo,
    requires_approval,
    ip_address,
    user_agent,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    p_user_id,
    'withdrawal',
    p_amount,
    v_status,
    p_payment_request,
    p_memo,
    p_requires_approval,
    p_ip_address,
    p_user_agent,
    NOW(),
    NOW()
  );

  -- Return success with the new available balance
  RETURN json_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'status', v_status,
    'available_balance', v_available_balance - p_amount
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_pending_withdrawal(UUID, UUID, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_pending_withdrawal(UUID, UUID, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION create_pending_withdrawal IS 'Atomically checks balance and creates pending withdrawal to prevent race conditions';
