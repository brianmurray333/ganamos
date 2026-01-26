-- Manual fix for 100k deposit - Run each step separately
-- User ID: dce58449-faa0-413e-8b7a-6e607d280beb
-- Amount: 100000 sats
-- Invoice: lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0

-- ============================================================================
-- STEP 1: Check current state
-- ============================================================================
-- Run this first to see current balance
SELECT 
    balance as current_balance,
    pet_coins as current_pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- ============================================================================
-- STEP 2: Check if transaction exists
-- ============================================================================
SELECT 
    id,
    amount,
    status,
    created_at
FROM transactions
WHERE payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0';

-- ============================================================================
-- STEP 3: Create transaction (if it doesn't exist)
-- ============================================================================
-- Only run this if STEP 2 shows no transaction
INSERT INTO transactions (
    id,
    user_id,
    type,
    amount,
    status,
    payment_request,
    memo,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    'dce58449-faa0-413e-8b7a-6e607d280beb',
    'deposit',
    100000,
    'completed',
    'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0',
    'Recovered deposit of 100000 sats from River.com',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM transactions 
    WHERE payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
)
RETURNING id, amount, status;

-- ============================================================================
-- STEP 4: Update balance (add 100k sats)
-- ============================================================================
-- Run this to add 100k to balance
UPDATE profiles
SET 
    balance = balance + 100000,
    pet_coins = COALESCE(pet_coins, 0) + 100000,
    updated_at = NOW()
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
RETURNING 
    balance as new_balance,
    pet_coins as new_pet_coins,
    updated_at;

-- ============================================================================
-- STEP 5: Verify balance was updated
-- ============================================================================
-- Run this after STEP 4 to confirm
SELECT 
    balance,
    pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- ============================================================================
-- STEP 6: Create activity (optional - for activity feed)
-- ============================================================================
-- Get the transaction ID from STEP 2 or STEP 3, then run this
-- Replace 'TRANSACTION_ID_HERE' with the actual transaction ID
/*
INSERT INTO activities (
    id,
    user_id,
    type,
    related_id,
    related_table,
    timestamp,
    metadata
)
SELECT 
    gen_random_uuid(),
    'dce58449-faa0-413e-8b7a-6e607d280beb',
    'deposit',
    t.id,
    'transactions',
    NOW(),
    jsonb_build_object(
        'amount', 100000,
        'status', 'completed',
        'recovered', true
    )
FROM transactions t
WHERE t.payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
  AND NOT EXISTS (
      SELECT 1 FROM activities a 
      WHERE a.related_id = t.id 
        AND a.type = 'deposit'
        AND a.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  )
RETURNING id, type, timestamp;
*/



