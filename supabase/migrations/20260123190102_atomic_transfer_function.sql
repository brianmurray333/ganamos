-- Migration: Atomic transfer function
-- Create atomic transfer function for username-based transfers
-- This ensures both sender deduction and receiver credit happen atomically
-- with proper row-level locks to prevent race conditions

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
AS $func$
DECLARE
  v_sender_balance INTEGER;
  v_receiver_balance INTEGER;
  v_sender_pet_coins INTEGER;
  v_receiver_pet_coins INTEGER;
  v_sender_new_balance INTEGER;
  v_receiver_new_balance INTEGER;
  v_updated_rows INTEGER;
BEGIN
  -- Validate inputs
  IF p_sender_id = p_receiver_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot transfer to yourself'
    );
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Transfer amount must be positive'
    );
  END IF;

  -- Lock both profiles in a consistent order (by UUID) to prevent deadlocks
  -- Always lock the smaller UUID first
  IF p_sender_id < p_receiver_id THEN
    -- Lock sender first, then receiver
    SELECT balance, pet_coins INTO v_sender_balance, v_sender_pet_coins
    FROM profiles
    WHERE id = p_sender_id
    FOR UPDATE;

    SELECT balance, pet_coins INTO v_receiver_balance, v_receiver_pet_coins
    FROM profiles
    WHERE id = p_receiver_id
    FOR UPDATE;
  ELSE
    -- Lock receiver first, then sender
    SELECT balance, pet_coins INTO v_receiver_balance, v_receiver_pet_coins
    FROM profiles
    WHERE id = p_receiver_id
    FOR UPDATE;

    SELECT balance, pet_coins INTO v_sender_balance, v_sender_pet_coins
    FROM profiles
    WHERE id = p_sender_id
    FOR UPDATE;
  END IF;

  -- Verify sender exists
  IF v_sender_balance IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sender profile not found'
    );
  END IF;

  -- Verify receiver exists
  IF v_receiver_balance IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Receiver profile not found'
    );
  END IF;

  -- Verify sender has sufficient balance
  IF v_sender_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'current_balance', v_sender_balance,
      'requested_amount', p_amount
    );
  END IF;

  -- Calculate new balances
  v_sender_new_balance := v_sender_balance - p_amount;
  v_receiver_new_balance := v_receiver_balance + p_amount;

  -- Update sender balance and pet_coins atomically
  UPDATE profiles
  SET 
    balance = v_sender_new_balance,
    pet_coins = COALESCE(v_sender_pet_coins, 0) - p_amount,
    updated_at = NOW()
  WHERE 
    id = p_sender_id
    AND balance >= p_amount; -- Double-check balance hasn't changed

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sender balance update failed - concurrent modification detected'
    );
  END IF;

  -- Update receiver balance and pet_coins atomically
  UPDATE profiles
  SET 
    balance = v_receiver_new_balance,
    pet_coins = COALESCE(v_receiver_pet_coins, 0) + p_amount,
    updated_at = NOW()
  WHERE 
    id = p_receiver_id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    -- RAISE EXCEPTION triggers automatic rollback, reverting sender balance change
    RAISE EXCEPTION 'Receiver balance update failed';
  END IF;

  -- Update both transaction records to completed
  UPDATE transactions
  SET 
    status = 'completed',
    updated_at = NOW()
  WHERE 
    id IN (p_sender_tx_id, p_receiver_tx_id)
    AND status = 'pending';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- Verify both transactions were updated
  IF v_updated_rows != 2 THEN
    -- RAISE EXCEPTION triggers automatic rollback, reverting all balance changes
    RAISE EXCEPTION 'Transaction update failed - expected 2 updates, got %', v_updated_rows;
  END IF;

  -- Success - return new balances
  RETURN json_build_object(
    'success', true,
    'sender_new_balance', v_sender_new_balance,
    'receiver_new_balance', v_receiver_new_balance,
    'sender_tx_id', p_sender_tx_id,
    'receiver_tx_id', p_receiver_tx_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Rollback is automatic on exception
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$func$;
