-- Migration: Add payment lock column to prevent race conditions in anonymous reward payouts
-- This fixes a TOCTOU vulnerability where concurrent requests could pay the same reward multiple times

-- Add the payment lock column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS anonymous_reward_payment_lock TEXT;

