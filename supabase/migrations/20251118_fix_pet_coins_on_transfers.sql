-- Fix transfer functions to update pet_coins when transferring sats
-- This ensures pet coins stay in sync with balance for all transaction types

-- Update the username transfer function to also update pet_coins
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

-- Update the family transfer function to also update pet_coins
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
BEGIN
  -- Verify the calling user is authorized to make this transfer
  -- Allow if it's their own account OR if they're the primary user of a connected account
  IF auth.uid() != p_from_user_id AND NOT EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = p_from_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer from your own account or connected accounts';
  END IF;

  -- Verify that the recipient is in the same family (connected accounts)
  IF NOT EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE (primary_user_id = p_from_user_id AND connected_user_id = p_to_user_id)
       OR (primary_user_id = p_to_user_id AND connected_user_id = p_from_user_id)
       OR (primary_user_id = (SELECT primary_user_id FROM connected_accounts WHERE connected_user_id = p_from_user_id) 
           AND connected_user_id = p_to_user_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Can only transfer to family members';
  END IF;

  -- Get sender balance and name
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM profiles 
  WHERE id = p_from_user_id;

  -- Get receiver balance and name
  SELECT balance, name INTO v_receiver_balance, v_receiver_name
  FROM profiles 
  WHERE id = p_to_user_id;

  -- Check sufficient balance
  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

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

  -- Create sender activity
  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_sender_activity_id, p_from_user_id, 'internal', v_sender_tx_id, 'transactions', NOW(),
          json_build_object('amount', -p_amount, 'memo', COALESCE(p_memo, 'Transfer to ' || v_receiver_name),
                          'to_user_id', p_to_user_id, 'to_name', v_receiver_name));

  -- Create receiver activity
  INSERT INTO activities (id, user_id, type, related_id, related_table, timestamp, metadata)
  VALUES (v_receiver_activity_id, p_to_user_id, 'internal', v_receiver_tx_id, 'transactions', NOW(),
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
  WHERE id = p_to_user_id;

  RETURN json_build_object(
    'success', true,
    'sender_transaction_id', v_sender_tx_id,
    'receiver_transaction_id', v_receiver_tx_id,
    'sender_activity_id', v_sender_activity_id,
    'receiver_activity_id', v_receiver_activity_id,
    'new_sender_balance', v_sender_balance - p_amount,
    'new_receiver_balance', v_receiver_balance + p_amount,
    'receiver_name', v_receiver_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

