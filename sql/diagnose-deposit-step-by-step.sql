-- Step-by-step diagnosis of the 100k deposit fix
-- Run each section one at a time in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Check if transaction exists
-- ============================================================================
SELECT 
    'STEP 1: Transaction Check' as step,
    id,
    user_id,
    type,
    amount,
    status,
    payment_request IS NOT NULL as has_payment_request,
    created_at,
    updated_at
FROM transactions
WHERE payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0';

-- ============================================================================
-- STEP 2: Check current profile balance (BEFORE any updates)
-- ============================================================================
SELECT 
    'STEP 2: Current Profile Balance' as step,
    id,
    email,
    name,
    balance,
    pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- ============================================================================
-- STEP 3: Check all recent deposits for this user (last 7 days)
-- ============================================================================
SELECT 
    'STEP 3: Recent Deposits' as step,
    id,
    type,
    amount,
    status,
    created_at,
    updated_at
FROM transactions
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  AND type = 'deposit'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ============================================================================
-- STEP 4: Check all activities for this user (last 7 days)
-- ============================================================================
SELECT 
    'STEP 4: Recent Activities' as step,
    id,
    type,
    related_id,
    (metadata->>'amount')::integer as amount,
    timestamp
FROM activities
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  AND type = 'deposit'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;

-- ============================================================================
-- STEP 5: Calculate expected balance from transactions
-- ============================================================================
SELECT 
    'STEP 5: Balance Calculation' as step,
    SUM(CASE 
        WHEN type = 'deposit' AND status = 'completed' THEN amount
        WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
        WHEN type = 'internal' AND status = 'completed' THEN amount
        ELSE 0
    END) as calculated_balance_from_transactions,
    (SELECT balance FROM profiles WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb') as actual_balance,
    (SELECT balance FROM profiles WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb') - 
    SUM(CASE 
        WHEN type = 'deposit' AND status = 'completed' THEN amount
        WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
        WHEN type = 'internal' AND status = 'completed' THEN amount
        ELSE 0
    END) as discrepancy
FROM transactions
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  AND status = 'completed';



