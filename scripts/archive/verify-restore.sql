-- Verify transaction restore
-- Check balance reconciliation for users with transactions

SELECT 
  p.email,
  p.balance as profile_balance,
  (
    SELECT COALESCE(SUM(CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END), 0)
    FROM transactions t
    WHERE t.user_id = p.id AND t.status = 'completed'
  ) as calculated_balance,
  p.balance - (
    SELECT COALESCE(SUM(CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END), 0)
    FROM transactions t
    WHERE t.user_id = p.id AND t.status = 'completed'
  ) as discrepancy
FROM profiles p
WHERE p.id IN (SELECT DISTINCT user_id FROM transactions)
ORDER BY ABS(p.balance - (
  SELECT COALESCE(SUM(CASE 
    WHEN type = 'deposit' THEN amount
    WHEN type = 'withdrawal' THEN -amount
    WHEN type = 'internal' THEN amount
    ELSE 0
  END), 0)
  FROM transactions t
  WHERE t.user_id = p.id AND t.status = 'completed'
)) DESC;

-- Show transaction summary
SELECT 
  type,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM transactions
GROUP BY type, status
ORDER BY type, status;

-- Show date range
SELECT 
  'Transactions by date range' as summary,
  MIN(created_at) as earliest,
  MAX(created_at) as latest,
  COUNT(*) as total
FROM transactions;

