-- Migration: Enforce one device per user
-- This adds a unique constraint to ensure each user can only have one device connected at a time
-- Run this after cleaning up any existing multi-device situations

-- First, verify there are no users with multiple devices
DO $$
DECLARE
  multi_device_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO multi_device_count
  FROM (
    SELECT user_id, COUNT(*) as device_count
    FROM devices
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) multi_device_users;
  
  IF multi_device_count > 0 THEN
    RAISE EXCEPTION 'Found % users with multiple devices. Please run cleanup script first: node scripts/clean-brian-devices.js --confirm', multi_device_count;
  END IF;
  
  RAISE NOTICE '✅ No users with multiple devices found. Safe to add constraint.';
END $$;

-- Add unique constraint on user_id
-- This ensures each user can only have one device
ALTER TABLE devices
ADD CONSTRAINT devices_user_id_unique UNIQUE (user_id);

-- Verify the constraint was added
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'devices_user_id_unique';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Unique constraint added successfully!';
  RAISE NOTICE 'Each user can now only have one device connected at a time.';
  RAISE NOTICE 'If a user pairs a new device, the old device will be automatically removed.';
END $$;
