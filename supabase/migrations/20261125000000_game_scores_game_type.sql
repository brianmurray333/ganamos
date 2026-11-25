-- Separate leaderboards per Satoshi Pet game.
-- flappy_bird_game keeps its name (existing firmware and the web leaderboard
-- read it); rows gain a game type. Existing rows and any insert without a
-- game are Flappy scores, so devices on older firmware keep working.

ALTER TABLE flappy_bird_game
  ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT 'flappy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'flappy_bird_game_game_check'
  ) THEN
    ALTER TABLE flappy_bird_game
      ADD CONSTRAINT flappy_bird_game_game_check
      CHECK (game IN ('flappy', 'pickleball', 'satcatcher'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_flappy_bird_game_game_score
  ON flappy_bird_game (game, score DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_flappy_bird_game_game_device
  ON flappy_bird_game (game, device_id, score DESC);
