-- Fix balance audit calculation to include post rewards
-- The current audit only looks at transactions, but misses post rewards
-- which deduct balance without creating transactions

-- This shows the corrected calculation that includes post rewards
SELECT 
  p.email,
  p.balance as profile_balance,
  -- Current calculation (from transactions only) - MISSING post rewards
  (
    SELECT COALESCE(SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN amount
        ELSE 0
      END
    ), 0)
    FROM transactions t
    WHERE t.user_id = p.id AND t.status = 'completed'
  ) as calculated_from_transactions_only,
  -- Total rewards posted (these reduce balance)
  (
    SELECT COALESCE(SUM(posts.reward), 0)
    FROM posts
    WHERE posts.user_id = p.id AND posts.reward > 0
  ) as total_rewards_posted,
  -- CORRECTED calculation (transactions - post rewards)
  (
    SELECT COALESCE(SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN amount
        ELSE 0
      END
    ), 0)
    FROM transactions t
    WHERE t.user_id = p.id AND t.status = 'completed'
  ) - (
    SELECT COALESCE(SUM(posts.reward), 0)
    FROM posts
    WHERE posts.user_id = p.id AND posts.reward > 0
  ) as corrected_calculated_balance,
  -- Discrepancy with corrected calculation
  p.balance - (
    (
      SELECT COALESCE(SUM(
        CASE 
          WHEN t.type = 'deposit' THEN t.amount
          WHEN t.type = 'withdrawal' THEN -t.amount
          WHEN t.type = 'internal' THEN amount
          ELSE 0
        END
      ), 0)
      FROM transactions t
      WHERE t.user_id = p.id AND t.status = 'completed'
    ) - (
      SELECT COALESCE(SUM(posts.reward), 0)
      FROM posts
      WHERE posts.user_id = p.id AND posts.reward > 0
    )
  ) as discrepancy_with_correction
FROM profiles p
WHERE p.email = 'paulitoi@gmail.com';

