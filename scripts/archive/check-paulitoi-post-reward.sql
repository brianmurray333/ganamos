-- Check if paulitoi posted an issue with a 1k reward
-- This would explain why balance is 9k (10k - 1k) but calculated is 10k

-- Step 1: Find posts created by paulitoi with reward > 0
SELECT 
  id,
  title,
  description,
  reward,
  created_at,
  fixed,
  user_id
FROM posts
WHERE user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND reward > 0
ORDER BY created_at DESC;

-- Step 2: Check if any transactions were created for these posts
-- (There shouldn't be any - post rewards don't create transactions)
SELECT 
  t.id,
  t.type,
  t.amount,
  t.status,
  t.memo,
  t.created_at
FROM transactions t
WHERE t.user_id = (SELECT id FROM profiles WHERE email = 'paulitoi@gmail.com')
  AND t.memo LIKE '%post%' OR t.memo LIKE '%reward%'
ORDER BY t.created_at DESC;

-- Step 3: Check if there's a database trigger or function that updates balance on post creation
-- Look for triggers on posts table
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'posts'
  AND trigger_name LIKE '%balance%';

-- Step 4: Verify the actual balance update happened (check posts table for reward amount)
SELECT 
  p.email,
  pr.balance as current_profile_balance,
  (SELECT COALESCE(SUM(posts.reward), 0) 
   FROM posts 
   WHERE posts.user_id = pr.id 
     AND posts.reward > 0
  ) as total_rewards_posted,
  (SELECT COALESCE(SUM(posts.reward), 0) 
   FROM posts 
   WHERE posts.user_id = pr.id 
     AND posts.reward > 0
  ) + pr.balance as what_balance_should_be_if_no_rewards,
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
    WHERE t.user_id = pr.id AND t.status = 'completed'
  ) as calculated_balance_from_transactions,
  pr.balance - (
    SELECT COALESCE(SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN amount
        ELSE 0
      END
    ), 0)
    FROM transactions t
    WHERE t.user_id = pr.id AND t.status = 'completed'
  ) as discrepancy
FROM profiles pr
LEFT JOIN profiles p ON p.id = pr.id
WHERE pr.email = 'paulitoi@gmail.com';

