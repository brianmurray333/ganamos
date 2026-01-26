-- Create a secure database function for family transfers
-- This is the best practice for financial transactions requiring multiple records

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
  v_connection_exists BOOLEAN;
  v_sender_name TEXT;
  v_receiver_name TEXT;
BEGIN
  -- Verify the calling user is authorized to make this transfer
  IF auth.uid() != p_from_user_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer from your own account';
  END IF;

  -- Verify the accounts are connected (family relationship)
  SELECT EXISTS(
    SELECT 1 FROM connected_accounts 
    WHERE (primary_user_id = p_from_user_id AND connected_user_id = p_to_user_id)
       OR (primary_user_id = p_to_user_id AND connected_user_id = p_from_user_id)
  ) INTO v_connection_exists;

  IF NOT v_connection_exists THEN
    RAISE EXCEPTION 'Transfer only allowed between connected family accounts';
  END IF;

  -- Get current balances and names
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM profiles 
  WHERE id = p_from_user_id;

  SELECT balance, name INTO v_receiver_balance, v_receiver_name
  FROM profiles 
  WHERE id = p_to_user_id;

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

  -- Return success with transaction IDs
  RETURN json_build_object(
    'success', true,
    'sender_transaction_id', v_sender_tx_id,
    'receiver_transaction_id', v_receiver_tx_id,
    'new_sender_balance', v_sender_balance - p_amount,
    'new_receiver_balance', v_receiver_balance + p_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION family_transfer_sats TO authenticated;
