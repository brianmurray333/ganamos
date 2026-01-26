-- ============================================================================
-- Flappy Bird Game Scores Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS flappy_bird_game (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flappy_bird_game_device_id ON flappy_bird_game(device_id);
CREATE INDEX IF NOT EXISTS idx_flappy_bird_game_score ON flappy_bird_game(score DESC, created_at ASC);

ALTER TABLE flappy_bird_game ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone (leaderboard is public)
CREATE POLICY flappy_bird_game_select ON flappy_bird_game
  FOR SELECT
  USING (true);

-- Allow inserts from trusted service role / backend
CREATE POLICY flappy_bird_game_insert ON flappy_bird_game
  FOR INSERT
  WITH CHECK (true);

