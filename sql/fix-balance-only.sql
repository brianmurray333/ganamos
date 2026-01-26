-- Fix balance - Add 100k sats to current balance
-- This is the missing piece - the transaction exists but balance wasn't updated

-- First, let's see what we're working with
SELECT 
    'BEFORE UPDATE' as status,
    balance as current_balance,
    pet_coins as current_pet_coins,
    balance + 100000 as expected_new_balance,
    COALESCE(pet_coins, 0) + 100000 as expected_new_pet_coins
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Now update the balance
UPDATE profiles
SET 
    balance = balance + 100000,
    pet_coins = COALESCE(pet_coins, 0) + 100000,
    updated_at = NOW()
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Verify the update worked
SELECT 
    'AFTER UPDATE' as status,
    balance as new_balance,
    pet_coins as new_pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';



