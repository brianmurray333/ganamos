-- Add unique constraint to ensure each pairing code can only be used once
-- This enforces that a pet device can only be connected to one user at a time

-- First, check if there are any duplicate pairing codes (there shouldn't be based on our check)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT pairing_code, COUNT(*) as cnt
    FROM devices
    GROUP BY pairing_code
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % devices with duplicate pairing codes. Please clean up before adding constraint.', duplicate_count;
  END IF;
  
  RAISE NOTICE 'No duplicate pairing codes found. Safe to add constraint.';
END $$;

-- Add unique constraint on pairing_code
-- This ensures each physical device can only be registered once
ALTER TABLE devices
ADD CONSTRAINT devices_pairing_code_unique UNIQUE (pairing_code);

-- Verify the constraint was added
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'devices_pairing_code_unique';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Unique constraint added successfully!';
  RAISE NOTICE 'Each pairing code can now only be connected to one user at a time.';
END $$;
