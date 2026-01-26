-- Verify the corrected balance calculation for paulitoi
-- Accounting for post rewards in the audit

SELECT 
  p.email,
  p.balance as profile_balance,
  
  -- Transactions total
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
  ) as total_from_transactions,
  
  -- Total rewards posted (these DEDUCT from balance)
  (
    SELECT COALESCE(SUM(posts.reward), 0)
    FROM posts
    WHERE posts.user_id = p.id AND posts.reward > 0
  ) as total_rewards_posted,
  
  -- CORRECTED calculation: transactions - rewards
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

