-- Fix the 2 deposits that have amount = 0
-- These happened before we fixed the race condition

-- Step 1: Verify which deposits need fixing
SELECT 
  t.id,
  t.amount as current_amount,
  t.status,
  t.created_at,
  a.metadata->>'amount' as actual_amount_from_activity
FROM transactions t
LEFT JOIN activities a ON a.related_table = 'transactions' 
  AND a.related_id::text = t.id::text
  AND a.type = 'deposit'
WHERE t.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  AND t.type = 'deposit'
  AND t.amount = 0
  AND t.status = 'completed'
ORDER BY t.created_at DESC;

-- Step 2: Update the 2 recent transactions with correct amounts from activities
-- Transaction 1: 30470ace (1871 from activity)
UPDATE transactions
SET amount = 1871,
    updated_at = NOW()
WHERE id = '30470ace-407b-45bf-b954-a3d02b0ff2e4'
  AND amount = 0;

-- Transaction 2: 022aaaf9 (4676 from activity)  
UPDATE transactions
SET amount = 4676,
    updated_at = NOW()
WHERE id = '022aaaf9-c52e-48ef-a4c8-d3d5db5a3232'
  AND amount = 0;

-- Step 3: Update pet_coins to reflect the 2 missing deposits
-- Current: 104632
-- Missing from first deposit (022aaaf9...): +4676
-- Missing from second deposit (30470ace...): +1871
-- Total missing: 4676 + 1871 = 6547
-- New pet_coins: 104632 + 6547 = 111179
UPDATE profiles
SET pet_coins = 111179,
    updated_at = NOW()
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  AND pet_coins = 104632;

-- Step 4: Verify the fix
SELECT 
  id,
  amount,
  status,
  memo,
  created_at
FROM transactions
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
  AND type = 'deposit'
ORDER BY created_at DESC
LIMIT 5;

-- Step 5: Verify pet_coins
SELECT 
  balance,
  pet_coins,
  updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Step 6: Run balance audit for this user
SELECT 
  balance as profile_balance,
  (SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END
  ), 0)
  FROM transactions
  WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
    AND status = 'completed'
  ) as calculated_from_transactions,
  balance - (SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END
  ), 0)
  FROM transactions
  WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
    AND status = 'completed'
  ) as discrepancy
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

