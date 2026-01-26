-- Create pending_spends table for tracking offline coin spends
CREATE TABLE IF NOT EXISTS pending_spends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_id VARCHAR(36) NOT NULL UNIQUE, -- UUID from device
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  action VARCHAR(64) NOT NULL, -- "game", "food_lettuce", "food_eggs", "food_steak"
  timestamp TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast spend_id lookups (idempotency check)
CREATE INDEX IF NOT EXISTS idx_pending_spends_spend_id ON pending_spends(spend_id);

-- Index for device lookups
CREATE INDEX IF NOT EXISTS idx_pending_spends_device_id ON pending_spends(device_id);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_pending_spends_user_id ON pending_spends(user_id);

-- Enable RLS
ALTER TABLE pending_spends ENABLE ROW LEVEL SECURITY;

-- Policy: Allow backend to insert spends (uses service role)
CREATE POLICY pending_spends_insert ON pending_spends
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow users to view their own spends
CREATE POLICY pending_spends_select ON pending_spends
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE pending_spends IS 'Tracks coin spends from devices for offline-first economy system';

