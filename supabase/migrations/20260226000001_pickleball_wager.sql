-- Add wagering support to pickleball games
ALTER TABLE pickleball_games
  ADD COLUMN IF NOT EXISTS wager_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wager_status VARCHAR NOT NULL DEFAULT 'none';

-- Constrain wager_status values
ALTER TABLE pickleball_games
  ADD CONSTRAINT pickleball_wager_status_check
  CHECK (wager_status IN ('none', 'active', 'declined', 'settled'));
