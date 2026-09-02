-- Bootstrap the feature on environments whose historical migration ledger was
-- repaired without the original pickleball table, then apply protocol hardening.
CREATE TABLE IF NOT EXISTS pickleball_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_device_id UUID NOT NULL REFERENCES devices(id),
  host_user_id UUID NOT NULL REFERENCES profiles(id),
  status VARCHAR NOT NULL DEFAULT 'lobby',
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_left INTEGER DEFAULT 0,
  score_right INTEGER DEFAULT 0,
  winner_side VARCHAR,
  lobby_expires_at TIMESTAMPTZ NOT NULL,
  wager_amount INTEGER NOT NULL DEFAULT 0,
  wager_status VARCHAR NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE pickleball_games
  ADD COLUMN IF NOT EXISTS wager_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wager_status VARCHAR NOT NULL DEFAULT 'none';

ALTER TABLE pickleball_games DROP CONSTRAINT IF EXISTS pickleball_games_status_check;
ALTER TABLE pickleball_games ADD CONSTRAINT pickleball_games_status_check
  CHECK (status IN ('setup', 'lobby', 'countdown', 'playing', 'completed', 'cancelled'));
ALTER TABLE pickleball_games DROP CONSTRAINT IF EXISTS pickleball_games_winner_side_check;
ALTER TABLE pickleball_games ADD CONSTRAINT pickleball_games_winner_side_check
  CHECK (winner_side IS NULL OR winner_side IN ('left', 'right'));
ALTER TABLE pickleball_games DROP CONSTRAINT IF EXISTS pickleball_games_wager_amount_check;
ALTER TABLE pickleball_games ADD CONSTRAINT pickleball_games_wager_amount_check
  CHECK (wager_amount IN (0, 100, 500, 1000));
ALTER TABLE pickleball_games DROP CONSTRAINT IF EXISTS pickleball_games_wager_status_check;
ALTER TABLE pickleball_games ADD CONSTRAINT pickleball_games_wager_status_check
  CHECK (wager_status IN ('none', 'active', 'settled', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_pickleball_games_host_device ON pickleball_games(host_device_id);
CREATE INDEX IF NOT EXISTS idx_pickleball_games_status ON pickleball_games(status);
ALTER TABLE pickleball_games ENABLE ROW LEVEL SECURITY;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

-- Serialize lobby membership and add a generation nonce for ESP-NOW sessions.
ALTER TABLE pickleball_games
  ADD COLUMN IF NOT EXISTS match_generation BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matchmaking_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_code VARCHAR(6);

CREATE INDEX IF NOT EXISTS idx_pickleball_games_group_lobby
  ON pickleball_games(matchmaking_group_id, created_at DESC)
  WHERE status = 'lobby';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pickleball_games_active_room_code
  ON pickleball_games(room_code)
  WHERE status IN ('lobby', 'countdown') AND room_code IS NOT NULL;

ALTER TABLE pickleball_games
  DROP CONSTRAINT IF EXISTS pickleball_games_room_code_format;
ALTER TABLE pickleball_games
  ADD CONSTRAINT pickleball_games_room_code_format
  CHECK (room_code IS NULL OR room_code ~ '^[2-9A-HJ-NP-Z]{4,6}$');
