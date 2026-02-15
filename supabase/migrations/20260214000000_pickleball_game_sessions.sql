-- Pickleball multiplayer game sessions
-- Used for lobby management and game invite notifications via device config polling
-- Actual gameplay uses ESP-NOW (device-to-device) so no real-time game state is stored here

-- =============================================================================
-- Game Sessions Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS pickleball_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Host device that created the game
  host_device_id UUID NOT NULL REFERENCES devices(id),
  host_user_id UUID NOT NULL REFERENCES profiles(id),
  
  -- Game state: lobby → countdown → playing → completed/cancelled
  status VARCHAR NOT NULL DEFAULT 'lobby' 
    CHECK (status IN ('lobby', 'countdown', 'playing', 'completed', 'cancelled')),
  
  -- Players (JSONB array of player objects)
  -- Each player: { userId, deviceId, petName, petInitial, macAddress, side, position, joinedAt }
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Game results (filled when status = 'completed')
  score_left INTEGER DEFAULT 0,
  score_right INTEGER DEFAULT 0,
  winner_side VARCHAR CHECK (winner_side IN ('left', 'right', NULL)),
  
  -- Lobby expires after 60 seconds if not enough players join
  lobby_expires_at TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pickleball_games_host_device ON pickleball_games(host_device_id);
CREATE INDEX IF NOT EXISTS idx_pickleball_games_host_user ON pickleball_games(host_user_id);
CREATE INDEX IF NOT EXISTS idx_pickleball_games_status ON pickleball_games(status);

-- Partial index for active games (lobby/countdown/playing) - most common query
CREATE INDEX IF NOT EXISTS idx_pickleball_games_active 
  ON pickleball_games(status) WHERE status IN ('lobby', 'countdown', 'playing');

-- =============================================================================
-- Add mac_address column to devices table for ESP-NOW peer discovery
-- =============================================================================
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

COMMENT ON COLUMN devices.mac_address IS 'WiFi MAC address (format: AA:BB:CC:DD:EE:FF) used for ESP-NOW multiplayer game peer discovery';

-- =============================================================================
-- RLS Policies for pickleball_games
-- =============================================================================
ALTER TABLE pickleball_games ENABLE ROW LEVEL SECURITY;

-- Service role (API routes) can do everything
-- For device API calls (no auth), we use the service role client

-- Allow authenticated users to view games they're part of
CREATE POLICY "Users can view their games" ON pickleball_games
  FOR SELECT USING (
    host_user_id = auth.uid()
    OR players::text LIKE '%' || auth.uid()::text || '%'
  );

-- Comments
COMMENT ON TABLE pickleball_games IS 'Multiplayer pickleball game sessions. Lobby/matchmaking managed via server, actual gameplay via ESP-NOW.';
COMMENT ON COLUMN pickleball_games.players IS 'JSONB array of player objects: [{userId, deviceId, petName, petInitial, macAddress, side, position, joinedAt}]';
