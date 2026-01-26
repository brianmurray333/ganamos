-- Migration: Balance non-negative constraint
-- Add constraint to prevent negative balances

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS balance_non_negative;
ALTER TABLE profiles ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
