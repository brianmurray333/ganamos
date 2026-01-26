-- Ensure pending_spends table exists (in case earlier migration wasn't run)
CREATE TABLE IF NOT EXISTS pending_spends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_id VARCHAR(36) NOT NULL,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  action VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_pending_spends_spend_id ON pending_spends(spend_id);
CREATE INDEX IF NOT EXISTS idx_pending_spends_device_id ON pending_spends(device_id);
CREATE INDEX IF NOT EXISTS idx_pending_spends_user_id ON pending_spends(user_id);

-- Enable RLS (idempotent)
ALTER TABLE pending_spends ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist (use DO block for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_spends' AND policyname = 'pending_spends_insert') THEN
    CREATE POLICY pending_spends_insert ON pending_spends FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_spends' AND policyname = 'pending_spends_select') THEN
    CREATE POLICY pending_spends_select ON pending_spends FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Fix the pending_spends constraint to allow same spend_id from different devices
-- The idempotency should be per-device, not global
ALTER TABLE pending_spends DROP CONSTRAINT IF EXISTS pending_spends_spend_id_key;

-- Add composite unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'pending_spends_spend_id_device_id_key'
  ) THEN
    ALTER TABLE pending_spends ADD CONSTRAINT pending_spends_spend_id_device_id_key UNIQUE (spend_id, device_id);
  END IF;
END $$;

-- Atomic function for spending coins
-- Prevents race conditions by using INSERT ... ON CONFLICT and atomic UPDATE
-- Returns: new_balance, already_processed, success

CREATE OR REPLACE FUNCTION spend_coins(
  p_spend_id VARCHAR(36),
  p_device_id UUID,
  p_user_id UUID,
  p_amount INTEGER,
  p_action VARCHAR(64),
  p_timestamp TIMESTAMPTZ
)
RETURNS TABLE (
  new_balance INTEGER,
  already_processed BOOLEAN,
  success BOOLEAN
) AS $$
DECLARE
  v_row_count INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate amount
  IF p_amount < 0 OR p_amount > 10000 THEN
    RETURN QUERY SELECT 0::INTEGER, FALSE, FALSE;
    RETURN;
  END IF;

  -- Try to insert the spend record (idempotency check via UNIQUE constraint on spend_id + device_id)
  INSERT INTO pending_spends (spend_id, device_id, user_id, amount, action, timestamp)
  VALUES (p_spend_id, p_device_id, p_user_id, p_amount, p_action, p_timestamp)
  ON CONFLICT (spend_id, device_id) DO NOTHING;

  -- Check if we actually inserted (or if it was a duplicate)
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    -- Already processed - return current balance
    SELECT COALESCE(pet_coins, 0) INTO v_new_balance
    FROM profiles
    WHERE id = p_user_id;

    RETURN QUERY SELECT COALESCE(v_new_balance, 0), TRUE, TRUE;
    RETURN;
  END IF;

  -- Atomically deduct coins (never go below 0)
  UPDATE profiles
  SET pet_coins = GREATEST(0, COALESCE(pet_coins, 0) - p_amount)
  WHERE id = p_user_id
  RETURNING pet_coins INTO v_new_balance;

  RETURN QUERY SELECT COALESCE(v_new_balance, 0), FALSE, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to all roles that might call this function
GRANT EXECUTE ON FUNCTION spend_coins(VARCHAR(36), UUID, UUID, INTEGER, VARCHAR(64), TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION spend_coins(VARCHAR(36), UUID, UUID, INTEGER, VARCHAR(64), TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION spend_coins(VARCHAR(36), UUID, UUID, INTEGER, VARCHAR(64), TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION spend_coins(VARCHAR(36), UUID, UUID, INTEGER, VARCHAR(64), TIMESTAMPTZ) TO postgres;

COMMENT ON FUNCTION spend_coins IS 'Atomically spend coins with idempotency. Prevents race conditions in concurrent requests.';

