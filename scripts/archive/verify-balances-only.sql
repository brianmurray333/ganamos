-- Balance Reconciliation Query
-- Run this query first to check if user balances match their transaction sums

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

