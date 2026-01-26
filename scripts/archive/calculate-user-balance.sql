-- Calculate user balance by summing all completed transactions
-- This script will show the actual balance based on transaction history

-- First, let's see all transactions for your user ID
SELECT 
  id,
  type,
  amount,
  status,
  created_at,
  memo
FROM transactions 
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
ORDER BY created_at DESC;

-- Now calculate the actual balance by summing completed transactions
SELECT 
  'Current Profile Balance' as source,
  balance as amount
FROM profiles 
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb'

UNION ALL

SELECT 
  'Calculated from Transactions' as source,
  COALESCE(
    SUM(
      CASE 
        WHEN type = 'deposit' AND status = 'completed' THEN amount
        WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
        WHEN type = 'internal' AND status = 'completed' THEN amount
        ELSE 0
      END
    ), 0
  ) as amount
FROM transactions 
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Detailed breakdown by transaction type
SELECT 
  type,
  status,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount
FROM transactions 
WHERE user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
GROUP BY type, status
ORDER BY type, status;


