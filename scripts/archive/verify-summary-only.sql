-- Transaction Summary Query
-- Run this to see breakdown by type and status

SELECT 
  type,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM transactions
GROUP BY type, status
ORDER BY type, status;

