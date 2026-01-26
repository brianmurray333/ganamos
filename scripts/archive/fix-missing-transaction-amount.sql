-- Fix transaction amount and backfill pet_coins for recent deposit
-- This fixes transactions that were completed but amount wasn't updated
-- Based on activities table showing actual amount paid

-- Step 1: Find the transaction that needs fixing
-- Look for completed deposits with 0 amount
SELECT 
  t.id,
  t.user_id,
  t.r_hash_str,
  t.amount,
  t.status,
  t.created_at,
  a.metadata->>'amount' as actual_amount_from_activities
FROM transactions t
LEFT JOIN activities a ON a.related_table = 'transactions' 
  AND a.related_id::text = t.id::text
WHERE t.type = 'deposit'
  AND t.status = 'completed'
  AND t.amount = 0
  AND t.created_at > NOW() - INTERVAL '1 day'
  AND t.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
ORDER BY t.created_at DESC;

-- Step 2: Update the transaction amount based on activities table
-- This will update ALL completed deposits with 0 amount from the last day
-- It matches transactions to activities by finding activities that reference the transaction
WITH transaction_amounts AS (
  SELECT 
    t.id as transaction_id,
    COALESCE(
      (a.metadata->>'amount')::integer,
      -- Fallback: if no activity found, use 0 (won't update)
      0
    ) as actual_amount
  FROM transactions t
  LEFT JOIN activities a ON a.related_table = 'transactions' 
    AND a.related_id::text = t.id::text
  WHERE t.type = 'deposit'
    AND t.status = 'completed'
    AND t.amount = 0
    AND t.created_at > NOW() - INTERVAL '1 day'
    AND t.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
)
UPDATE transactions
SET amount = ta.actual_amount,
    updated_at = NOW()
FROM transaction_amounts ta
WHERE transactions.id = ta.transaction_id
  AND ta.actual_amount > 0;  -- Only update if we found an actual amount

-- Show what was updated
SELECT 
  id,
  amount,
  status,
  updated_at
FROM transactions
WHERE id = '004bad45-069a-42d8-ba8b-5ad04274365e';

-- Step 3: Backfill pet_coins for deposits that weren't credited
-- Sum up all completed deposit amounts that should have added coins
WITH missing_coins AS (
  SELECT 
    t.user_id,
    SUM(t.amount) as total_deposits_not_credited
  FROM transactions t
  WHERE t.type = 'deposit'
    AND t.status = 'completed'
    AND t.amount > 0
    AND t.created_at > NOW() - INTERVAL '1 day'
    AND t.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  GROUP BY t.user_id
)
UPDATE profiles p
SET pet_coins = COALESCE(p.pet_coins, 0) + COALESCE(mc.total_deposits_not_credited, 0)
FROM missing_coins mc
WHERE p.id = mc.user_id
  AND COALESCE(p.pet_coins, 0) < p.balance;  -- Only add if coins are less than balance

-- Verify the fix
SELECT 
  t.id,
  t.user_id,
  t.type,
  t.amount,
  t.status,
  t.created_at,
  a.metadata->>'amount' as activity_amount
FROM transactions t
LEFT JOIN activities a ON a.related_table = 'transactions' 
  AND a.related_id::text = t.id::text
WHERE t.type = 'deposit'
  AND t.status = 'completed'
  AND t.created_at > NOW() - INTERVAL '1 day'
  AND t.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
ORDER BY t.created_at DESC;

-- Verify pet_coins
SELECT 
  id,
  name,
  balance,
  pet_coins
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

