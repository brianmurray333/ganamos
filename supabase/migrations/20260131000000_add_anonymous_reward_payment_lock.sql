-- Migration: Add payment lock column to prevent race conditions in anonymous reward payouts
-- This fixes a TOCTOU vulnerability where concurrent requests could pay the same reward multiple times

-- Add the payment lock column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS anonymous_reward_payment_lock TEXT;

-- Add an index for efficient queries on unclaimed anonymous rewards
-- This helps the atomic UPDATE find eligible rows quickly
CREATE INDEX IF NOT EXISTS idx_posts_anonymous_reward_lock 
ON posts (id) 
WHERE fixed_by_is_anonymous = TRUE 
  AND anonymous_reward_paid_at IS NULL 
  AND anonymous_reward_payment_lock IS NULL;

-- Add a comment explaining the column's purpose
COMMENT ON COLUMN posts.anonymous_reward_payment_lock IS 
  'UUID lock to prevent race conditions during anonymous reward payment. Set atomically before payment, cleared if payment fails.';
