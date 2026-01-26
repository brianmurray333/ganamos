-- Update transfer functions to create activities for the activity feed

-- Update the username transfer function to create activities
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

  -- Create outgoing transaction record for sender
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    status,
    memo
  ) VALUES (
    p_from_user_id,
    'internal',
    -p_amount, -- Negative for outgoing
    'completed',
    COALESCE('Transfer to @' || p_to_username || COALESCE(': ' || p_memo, ''), 'Username transfer')
  ) RETURNING id INTO v_sender_tx_id;
  
  RAISE NOTICE 'Created sender transaction: id=%, user_id=%, amount=%', v_sender_tx_id, p_from_user_id, -p_amount;

  -- Create incoming transaction record for receiver
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    status,
    memo
  ) VALUES (
    v_receiver_id,
    'internal',
    p_amount, -- Positive for incoming
    'completed',
    COALESCE('Transfer from @' || COALESCE(SPLIT_PART(v_sender_name, ' ', 1), 'user') || COALESCE(': ' || p_memo, ''), 'Username transfer')
  ) RETURNING id INTO v_receiver_tx_id;

  -- Create activity for sender (send transaction)
  INSERT INTO activities (
    user_id,
    type,
    related_id,
    related_table,
    timestamp,
    metadata
  ) VALUES (
    p_from_user_id,
    'internal',
    v_sender_tx_id,
    'transactions',
    NOW(),
    jsonb_build_object(
      'amount', -p_amount,
      'memo', COALESCE('Transfer to @' || p_to_username || COALESCE(': ' || p_memo, ''), 'Username transfer')
    )
  ) RETURNING id INTO v_sender_activity_id;

  -- Create activity for receiver (receive transaction)
  INSERT INTO activities (
    user_id,
    type,
    related_id,
    related_table,
    timestamp,
    metadata
  ) VALUES (
    v_receiver_id,
    'internal',
    v_receiver_tx_id,
    'transactions',
    NOW(),
    jsonb_build_object(
      'amount', p_amount,
      'memo', COALESCE('Transfer from @' || COALESCE(SPLIT_PART(v_sender_name, ' ', 1), 'user') || COALESCE(': ' || p_memo, ''), 'Username transfer')
    )
  ) RETURNING id INTO v_receiver_activity_id;

  -- Update sender balance
  UPDATE profiles 
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE id = p_from_user_id;

  -- Update receiver balance
  UPDATE profiles 
  SET balance = balance + p_amount,
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
    'receiver_name', v_receiver_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the family transfer function to create activities
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
  -- Debug logging
  RAISE NOTICE 'family_transfer_sats called with: auth.uid()=%, p_from_user_id=%, p_to_user_id=%', auth.uid(), p_from_user_id, p_to_user_id;
  
  -- Verify the calling user is authorized to make this transfer
  -- Allow if it's their own account OR if they're the primary user of a connected account
  IF auth.uid() != p_from_user_id AND NOT EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = p_from_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer from your own account or connected accounts';
  END IF;

  -- Verify family connection exists
  IF NOT EXISTS (
    SELECT 1 FROM connected_accounts 
    WHERE (primary_user_id = p_from_user_id AND connected_user_id = p_to_user_id)
    OR (primary_user_id = p_to_user_id AND connected_user_id = p_from_user_id)
  ) THEN
    RAISE EXCEPTION 'Family connection not found: Users must be connected family accounts';
  END IF;

  -- Prevent self-transfers
  IF p_to_user_id = p_from_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to yourself';
  END IF;

  -- Get sender and receiver details
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM profiles WHERE id = p_from_user_id;
  
  SELECT balance, name INTO v_receiver_balance, v_receiver_name
  FROM profiles WHERE id = p_to_user_id;

  -- Check sufficient balance
  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Create outgoing transaction record for sender
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    status,
    memo
  ) VALUES (
    p_from_user_id,
    'internal',
    -p_amount, -- Negative for outgoing
    'completed',
    COALESCE('Transfer to ' || SPLIT_PART(v_receiver_name, ' ', 1) || COALESCE(': ' || p_memo, ''), 'Family transfer')
  ) RETURNING id INTO v_sender_tx_id;

  -- Create incoming transaction record for receiver
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    status,
    memo
  ) VALUES (
    p_to_user_id,
    'internal',
    p_amount, -- Positive for incoming
    'completed',
    COALESCE('Transfer from ' || SPLIT_PART(v_sender_name, ' ', 1) || COALESCE(': ' || p_memo, ''), 'Family transfer')
  ) RETURNING id INTO v_receiver_tx_id;

  -- Create activity for sender (send transaction)
  INSERT INTO activities (
    user_id,
    type,
    related_id,
    related_table,
    timestamp,
    metadata
  ) VALUES (
    p_from_user_id,
    'internal',
    v_sender_tx_id,
    'transactions',
    NOW(),
    jsonb_build_object(
      'amount', -p_amount,
      'memo', COALESCE('Transfer to ' || SPLIT_PART(v_receiver_name, ' ', 1) || COALESCE(': ' || p_memo, ''), 'Family transfer')
    )
  ) RETURNING id INTO v_sender_activity_id;

  -- Create activity for receiver (receive transaction)
  INSERT INTO activities (
    user_id,
    type,
    related_id,
    related_table,
    timestamp,
    metadata
  ) VALUES (
    p_to_user_id,
    'internal',
    v_receiver_tx_id,
    'transactions',
    NOW(),
    jsonb_build_object(
      'amount', p_amount,
      'memo', COALESCE('Transfer from ' || SPLIT_PART(v_sender_name, ' ', 1) || COALESCE(': ' || p_memo, ''), 'Family transfer')
    )
  ) RETURNING id INTO v_receiver_activity_id;

  -- Update sender balance
  UPDATE profiles 
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE id = p_from_user_id;

  -- Update receiver balance
  UPDATE profiles 
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE id = p_to_user_id;

  RETURN json_build_object(
    'success', true,
    'sender_transaction_id', v_sender_tx_id,
    'receiver_transaction_id', v_receiver_tx_id,
    'sender_activity_id', v_sender_activity_id,
    'receiver_activity_id', v_receiver_activity_id,
    'new_sender_balance', v_sender_balance - p_amount,
    'new_receiver_balance', v_receiver_balance + p_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION transfer_sats_to_username TO authenticated;
GRANT EXECUTE ON FUNCTION family_transfer_sats TO authenticated;
