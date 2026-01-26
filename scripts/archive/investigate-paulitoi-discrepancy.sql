-- Investigate balance discrepancy for paulitoi@gmail.com
-- Profile shows 9,000 but calculated is 10,000 (difference: -1,000)

-- Step 1: Get user info and current balance
SELECT 
  id,
  email,
  name,
  balance,
  pet_coins,
  created_at
FROM profiles
WHERE email = 'paulitoi@gmail.com';

-- Step 2: Get ALL transactions for this user with detailed info
SELECT 
  id,
  type,
  amount,
  status,
  memo,
  created_at,
  updated_at,
  CASE 
    WHEN type = 'deposit' THEN amount
    WHEN type = 'withdrawal' THEN -amount
    WHEN type = 'internal' THEN amount
    ELSE 0
  END as balance_impact
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
ORDER BY created_at ASC;

-- Step 3: Calculate balance from COMPLETED transactions (matches audit calculation)
WITH user_transactions AS (
  SELECT 
    type,
    amount,
    status
  FROM transactions
  WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
    AND status = 'completed'
)
SELECT 
  SUM(
    CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END
  ) as calculated_balance_from_completed,
  COUNT(*) as completed_transaction_count
FROM user_transactions;

-- Step 4: Compare completed vs all transactions
SELECT 
  'All transactions' as category,
  COUNT(*) as count,
  SUM(
    CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END
  ) as balance_sum
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
UNION ALL
SELECT 
  'Completed only' as category,
  COUNT(*) as count,
  SUM(
    CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END
  ) as balance_sum
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND status = 'completed';

-- Step 5: Check for transactions with status != 'completed' that might affect balance
SELECT 
  id,
  type,
  amount,
  status,
  memo,
  created_at,
  CASE 
    WHEN type = 'deposit' THEN amount
    WHEN type = 'withdrawal' THEN -amount
    WHEN type = 'internal' THEN amount
    ELSE 0
  END as would_affect_balance_by
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND status != 'completed'
ORDER BY created_at DESC;

-- Step 6: Check for specific amount patterns (look for 1,000 sats transactions)
SELECT 
  id,
  type,
  amount,
  status,
  memo,
  created_at,
  ABS(amount) as absolute_amount
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND ABS(amount) = 1000
ORDER BY created_at DESC;

-- Step 7: Detailed breakdown by transaction type
SELECT 
  type,
  status,
  COUNT(*) as count,
  SUM(
    CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END
  ) as total_balance_impact
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
GROUP BY type, status
ORDER BY type, status;

-- Step 8: Final reconciliation
SELECT 
  (SELECT balance FROM profiles WHERE email = 'paulitoi@gmail.com') as profile_balance,
  (
    SELECT COALESCE(SUM(
      CASE 
        WHEN type = 'deposit' THEN amount
        WHEN type = 'withdrawal' THEN -amount
        WHEN type = 'internal' THEN amount
        ELSE 0
      END
    ), 0)
    FROM transactions
    WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
      AND status = 'completed'
  ) as calculated_balance,
  (SELECT balance FROM profiles WHERE email = 'paulitoi@gmail.com') - (
    SELECT COALESCE(SUM(
      CASE 
        WHEN type = 'deposit' THEN amount
        WHEN type = 'withdrawal' THEN -amount
        WHEN type = 'internal' THEN amount
        ELSE 0
      END
    ), 0)
    FROM transactions
    WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
      AND status = 'completed'
  ) as discrepancy;

