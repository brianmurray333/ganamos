-- Verify the 100k deposit was fixed correctly
-- Run this in Supabase SQL Editor

-- 1. Check the transaction
SELECT 
    'Transaction' as check_type,
    id,
    user_id,
    type,
    amount,
    status,
    payment_request,
    created_at,
    updated_at
FROM transactions
WHERE payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
ORDER BY created_at DESC
LIMIT 1;

-- 2. Check the profile balance
SELECT 
    'Profile Balance' as check_type,
    id,
    email,
    name,
    balance,
    pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- 3. Check all activities for this deposit (should only be 1, but you have 2)
SELECT 
    'Activity' as check_type,
    id,
    user_id,
    type,
    related_id,
    (metadata->>'amount')::integer as amount,
    (metadata->>'status') as status,
    timestamp as created_at
FROM activities
WHERE related_id IN (
    SELECT id FROM transactions 
    WHERE payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
)
ORDER BY timestamp DESC;



