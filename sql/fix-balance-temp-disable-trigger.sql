-- Fix balance by temporarily disabling the security trigger
-- This is a one-time fix for the missing 100k sats deposit

BEGIN;

-- Step 1: Disable the trigger
ALTER TABLE profiles DISABLE TRIGGER prevent_protected_field_updates;

-- Step 2: Show current balance
SELECT 
    'BEFORE UPDATE' as status,
    balance,
    pet_coins
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Step 3: Update the balance
UPDATE profiles
SET 
    balance = balance + 100000,
    pet_coins = COALESCE(pet_coins, 0) + 100000,
    updated_at = NOW()
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Step 4: Re-enable the trigger immediately
ALTER TABLE profiles ENABLE TRIGGER prevent_protected_field_updates;

-- Step 5: Verify the update
SELECT 
    'AFTER UPDATE' as status,
    balance,
    pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

COMMIT;

