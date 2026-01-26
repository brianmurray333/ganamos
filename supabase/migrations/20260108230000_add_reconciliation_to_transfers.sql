-- ============================================================================
-- CRITICAL SECURITY FIX: Add reconciliation check to transfer functions
-- ============================================================================
-- 
-- VULNERABILITY: The transfer_sats_to_username function only checked if 
-- balance >= amount, but didn't verify that the balance was legitimate.
-- 
-- EXPLOIT: Attackers could:
-- 1. Create a child account
-- 2. Directly UPDATE profiles SET balance = 500000 (via RLS policy for connected accounts)
-- 3. Transfer the fake money to another account (bypassing withdrawal reconciliation)
-- 4. Withdraw from the recipient account
--
-- FIX: Add reconciliation check to transfer function - verify stored balance
-- matches calculated balance from transaction history before allowing transfer.
-- ============================================================================

CREATE OR REPLACE FUNCTION transfer_sats_to_username(
  p_from_user_id UUID,
  p_to_username TEXT,
  p_amount INTEGER,
  p_memo TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_sender_balance INTEGER;
  v_receiver_balance INTEGER;
  v_receiver_id UUID;
  v_sender_tx_id UUID;
  v_receiver_tx_id UUID;
  v_sender_name TEXT;
  v_receiver_name TEXT;
  v_sender_activity_id UUID;
  v_receiver_activity_id UUID;
  v_calculated_balance BIGINT;
BEGIN
  -- Debug logging
  RAISE NOTICE 'transfer_sats_to_username called with: auth.uid()=%, p_from_user_id=%, p_to_username=%', auth.uid(), p_from_user_id, p_to_username;
  
  -- Verify the calling user is authorized to make this transfer
  -- Allow if it's their own account OR if they're the primary user of a connected account
  IF auth.uid() != p_from_user_id AND NOT EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = p_from_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer from your own account or connected accounts';
  END IF;

  -- Find the receiver by username
  SELECT id, balance, name INTO v_receiver_id, v_receiver_balance, v_receiver_name
  FROM profiles 
  WHERE username = p_to_username;

  IF v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'User not found: No user with username "%"', p_to_username;
  END IF;

  -- Prevent self-transfers
  IF v_receiver_id = p_from_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to yourself';
  END IF;

  -- Get sender balance and name
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM profiles 
  WHERE id = p_from_user_id;

  -- Check sufficient balance
  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- ==========================================================================
  -- SECURITY: Reconciliation check - verify stored balance matches transactions
  -- ==========================================================================
  SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'deposit' AND status = 'completed' THEN amount
      WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
      WHEN type = 'internal' AND status = 'completed' THEN amount
      ELSE 0
    END
  ), 0)
  INTO v_calculated_balance
  FROM transactions
  WHERE user_id = p_from_user_id;

  IF v_sender_balance != v_calculated_balance THEN
    RAISE EXCEPTION 'SECURITY: Balance reconciliation failed. Stored: %, Calculated: %, Discrepancy: %', 
      v_sender_balance, v_calculated_balance, (v_sender_balance - v_calculated_balance);
  END IF;
  -- ==========================================================================

  -- Create transaction IDs
  v_sender_tx_id := gen_random_uuid();
  v_receiver_tx_id := gen_random_uuid();
  v_sender_activity_id := gen_random_uuid();
  v_receiver_activity_id := gen_random_uuid();

  -- Create sender transaction (negative amount)
  INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at)
  VALUES (v_sender_tx_id, p_from_user_id, 'internal', -p_amount, 'completed', 
          COALESCE(p_memo, 'Transfer to ' || v_receiver_name), NOW(), NOW());

  -- Create receiver transaction (positive amount)
  INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at)
  VALUES (v_receiver_tx_id, v_receiver_id, 'internal', p_amount, 'completed',
          COALESCE(p_memo, 'Transfer from ' || v_sender_name), NOW(), NOW());

  -- Create sender activity
  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_sender_activity_id, p_from_user_id, 'internal', v_sender_tx_id, 'transactions', NOW(),
          json_build_object('amount', -p_amount, 'memo', COALESCE(p_memo, 'Transfer to ' || v_receiver_name), 
                          'to_user_id', v_receiver_id, 'to_name', v_receiver_name));

  -- Create receiver activity
  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_receiver_activity_id, v_receiver_id, 'internal', v_receiver_tx_id, 'transactions', NOW(),
          json_build_object('amount', p_amount, 'memo', COALESCE(p_memo, 'Transfer from ' || v_sender_name),
                          'from_user_id', p_from_user_id, 'from_name', v_sender_name));

  -- Update sender balance AND pet_coins (subtract from both)
  UPDATE profiles 
  SET balance = balance - p_amount,
      pet_coins = pet_coins - p_amount,
      updated_at = NOW()
  WHERE id = p_from_user_id;

  -- Update receiver balance AND pet_coins (add to both)
  UPDATE profiles 
  SET balance = balance + p_amount,
      pet_coins = pet_coins + p_amount,
      updated_at = NOW()
  WHERE id = v_receiver_id;

  RETURN json_build_object(
    'success', true,
    'sender_transaction_id', v_sender_tx_id,
    'receiver_transaction_id', v_receiver_tx_id,
    'sender_activity_id', v_sender_activity_id,
    'receiver_activity_id', v_receiver_activity_id,
    'new_sender_balance', v_sender_balance - p_amount,
    'new_receiver_balance', v_receiver_balance + p_amount,
    'receiver_name', v_receiver_name,
    'receiver_id', v_receiver_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Also update family_transfer_sats if it exists
-- ============================================================================
CREATE OR REPLACE FUNCTION family_transfer_sats(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount INTEGER,
  p_memo TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_sender_balance INTEGER;
  v_receiver_balance INTEGER;
  v_sender_tx_id UUID;
  v_receiver_tx_id UUID;
  v_sender_name TEXT;
  v_receiver_name TEXT;
  v_sender_activity_id UUID;
  v_receiver_activity_id UUID;
  v_calculated_balance BIGINT;
BEGIN
  -- Verify the calling user is authorized (either their own account or connected)
  IF auth.uid() != p_from_user_id AND NOT EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = p_from_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer from your own account or connected accounts';
  END IF;

  -- Verify receiver exists
  SELECT balance, name INTO v_receiver_balance, v_receiver_name
  FROM profiles 
  WHERE id = p_to_user_id;

  IF v_receiver_name IS NULL THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  -- Prevent self-transfers
  IF p_to_user_id = p_from_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to yourself';
  END IF;

  -- Get sender balance and name
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM profiles 
  WHERE id = p_from_user_id;

  -- Check sufficient balance
  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- ==========================================================================
  -- SECURITY: Reconciliation check
  -- ==========================================================================
  SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'deposit' AND status = 'completed' THEN amount
      WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
      WHEN type = 'internal' AND status = 'completed' THEN amount
      ELSE 0
    END
  ), 0)
  INTO v_calculated_balance
  FROM transactions
  WHERE user_id = p_from_user_id;

  IF v_sender_balance != v_calculated_balance THEN
    RAISE EXCEPTION 'SECURITY: Balance reconciliation failed. Stored: %, Calculated: %, Discrepancy: %', 
      v_sender_balance, v_calculated_balance, (v_sender_balance - v_calculated_balance);
  END IF;
  -- ==========================================================================

  -- Create transaction IDs
  v_sender_tx_id := gen_random_uuid();
  v_receiver_tx_id := gen_random_uuid();
  v_sender_activity_id := gen_random_uuid();
  v_receiver_activity_id := gen_random_uuid();

  -- Create sender transaction (negative amount)
  INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at)
  VALUES (v_sender_tx_id, p_from_user_id, 'internal', -p_amount, 'completed', 
          COALESCE(p_memo, 'Transfer to ' || v_receiver_name), NOW(), NOW());

  -- Create receiver transaction (positive amount)
  INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at)
  VALUES (v_receiver_tx_id, p_to_user_id, 'internal', p_amount, 'completed',
          COALESCE(p_memo, 'Transfer from ' || v_sender_name), NOW(), NOW());

  -- Create activities
  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_sender_activity_id, p_from_user_id, 'internal', v_sender_tx_id, 'transactions', NOW(),
          json_build_object('amount', -p_amount, 'memo', COALESCE(p_memo, 'Transfer to ' || v_receiver_name)));

  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_receiver_activity_id, p_to_user_id, 'internal', v_receiver_tx_id, 'transactions', NOW(),
          json_build_object('amount', p_amount, 'memo', COALESCE(p_memo, 'Transfer from ' || v_sender_name)));

  -- Update sender balance
  UPDATE profiles 
  SET balance = balance - p_amount,
      pet_coins = pet_coins - p_amount,
      updated_at = NOW()
  WHERE id = p_from_user_id;

  -- Update receiver balance
  UPDATE profiles 
  SET balance = balance + p_amount,
      pet_coins = pet_coins + p_amount,
      updated_at = NOW()
  WHERE id = p_to_user_id;

  RETURN json_build_object(
    'success', true,
    'sender_transaction_id', v_sender_tx_id,
    'receiver_transaction_id', v_receiver_tx_id,
    'new_sender_balance', v_sender_balance - p_amount,
    'new_receiver_balance', v_receiver_balance + p_amount,
    'receiver_name', v_receiver_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Add comment for documentation
-- ============================================================================
COMMENT ON FUNCTION transfer_sats_to_username IS 
  'Secure transfer function with balance reconciliation. Blocks transfers if stored balance does not match calculated balance from transaction history.';

COMMENT ON FUNCTION family_transfer_sats IS 
  'Secure family transfer function with balance reconciliation. Blocks transfers if stored balance does not match calculated balance from transaction history.';

