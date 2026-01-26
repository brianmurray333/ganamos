-- Add coins column to devices table for per-device coin tracking
-- This fixes the bug where coinsEarnedSinceLastSync was being added to local balance
-- but then the reconciliation logic was resetting it to 0 because coins (from profiles.pet_coins)
-- didn't reflect the per-device coin state.

-- Each device now tracks its own coin balance independently.
-- When a device earns coins (via coinsEarnedSinceLastSync), the server increments devices.coins
-- When a device spends coins, the server decrements devices.coins
-- The coins value returned to the device matches the expected local balance

ALTER TABLE devices ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN devices.coins IS 'Per-device coin balance. Incremented when user earns sats (after device paired), decremented when device spends coins. Used by firmware for balance reconciliation.';
