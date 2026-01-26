-- Investigate balance discrepancy for paulitoi@gmail.com
-- Profile shows 9,000 but calculated is 10,000 (difference: -1,000)

-- Step 1: Get user info and current balance
SELECT 
  id,
  email,
  name,
  balance,
  created_at
FROM profiles
WHERE email = 'paulitoi@gmail.com';

-- Step 2: Get ALL transactions for this user
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

-- Step 3: Calculate balance from transactions (should match audit calculation)
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
  ) as calculated_balance
FROM user_transactions;

-- Step 4: Check for transactions with status != 'completed' that might affect balance
SELECT 
  id,
  type,
  amount,
  status,
  memo,
  created_at
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND status != 'completed'
ORDER BY created_at DESC;

-- Step 5: Check for transactions that might have been double-counted or missed
-- Look for duplicate r_hash_str (if deposits)
SELECT 
  r_hash_str,
  COUNT(*) as count,
  STRING_AGG(id::text, ', ') as transaction_ids,
  STRING_AGG(amount::text, ', ') as amounts,
  STRING_AGG(status, ', ') as statuses
FROM transactions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND r_hash_str IS NOT NULL
GROUP BY r_hash_str
HAVING COUNT(*) > 1;

-- Step 6: Check if there's a withdrawal that wasn't recorded as completed
-- or a deposit that was recorded twice
SELECT 
  'Possible Issues:' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM transactions 
      WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
        AND type = 'withdrawal'
        AND status = 'pending'
    ) THEN 'Has pending withdrawals'
    ELSE 'No pending withdrawals'
  END as pending_withdrawals,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM transactions 
      WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
        AND type = 'deposit'
        AND status = 'failed'
        AND amount > 0
    ) THEN 'Has failed deposits (should not count)'
    ELSE 'No failed deposits'
  END as failed_deposits;

