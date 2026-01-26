-- Create atomic withdrawal completion function
-- This ensures transaction update and balance deduction happen in a single transaction
-- with proper balance validation to prevent double-spending

CREATE OR REPLACE FUNCTION update_withdrawal_complete(
  p_transaction_id UUID,
  p_user_id UUID,
  p_payment_hash TEXT,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_updated_rows INTEGER;
BEGIN
  -- Get current balance WITH lock to prevent concurrent withdrawals
  SELECT balance INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE; -- Row-level lock prevents concurrent updates

  -- Verify user has sufficient balance
  IF v_current_balance IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User profile not found'
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

  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;

  -- Update transaction status atomically
  UPDATE transactions
  SET 
    status = 'completed',
    payment_hash = p_payment_hash,
    updated_at = NOW()
  WHERE 
    id = p_transaction_id
    AND user_id = p_user_id
    AND status = 'pending'
    AND type = 'withdrawal';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- Verify transaction was updated (prevents updating wrong transaction)
  IF v_updated_rows = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Transaction not found or already processed',
      'transaction_id', p_transaction_id
    );
  END IF;

  -- Update user balance atomically
  UPDATE profiles
  SET 
    balance = v_new_balance,
    updated_at = NOW()
  WHERE 
    id = p_user_id
    AND balance >= p_amount; -- Double-check balance hasn't changed

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- Verify balance was updated
  IF v_updated_rows = 0 THEN
    -- This should never happen due to the lock, but handle it anyway
    RETURN json_build_object(
      'success', false,
      'error', 'Balance update failed - concurrent modification detected'
    );
  END IF;

  -- Success - return new balance
  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_id', p_transaction_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Rollback is automatic on exception
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_withdrawal_complete(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_withdrawal_complete(UUID, UUID, TEXT, INTEGER) TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION update_withdrawal_complete IS 
'Atomically updates withdrawal transaction to completed and deducts balance. 
Prevents double-spending by using row-level locks and balance validation.
Returns JSON with success status and new balance.';

