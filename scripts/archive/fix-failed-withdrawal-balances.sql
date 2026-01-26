-- Fix balance discrepancies caused by failed withdrawals
-- This script identifies users who lost balance due to failed withdrawals
-- and restores their balance to match calculated balance from transactions

-- Step 1: Identify users with balance discrepancies
-- This finds users where profile.balance != calculated balance from transactions
WITH user_balances AS (
  SELECT 
    p.id,
    p.email,
    p.balance as profile_balance,
    COALESCE(
      SUM(
        CASE 
          WHEN t.type = 'deposit' THEN t.amount
          WHEN t.type = 'withdrawal' THEN -t.amount
          WHEN t.type = 'internal' THEN t.amount
          ELSE 0
        END
      ), 0
    ) as calculated_balance
  FROM profiles p
  LEFT JOIN transactions t ON t.user_id = p.id AND t.status = 'completed'
  WHERE p.status != 'deleted'
  GROUP BY p.id, p.email, p.balance
)
SELECT 
  id,
  email,
  profile_balance,
  calculated_balance,
  calculated_balance - profile_balance as discrepancy
FROM user_balances
WHERE calculated_balance != profile_balance
ORDER BY ABS(calculated_balance - profile_balance) DESC;

-- Step 2: For each user with discrepancy, check for failed withdrawals
-- that might have incorrectly deducted balance
WITH failed_withdrawals AS (
  SELECT 
    t.user_id,
    t.id as transaction_id,
    t.amount,
    t.created_at,
    t.status,
    p.email,
    p.balance as current_balance
  FROM transactions t
  JOIN profiles p ON p.id = t.user_id
  WHERE t.type = 'withdrawal'
    AND t.status = 'failed'
    AND t.amount > 0
  ORDER BY t.created_at DESC
)
SELECT 
  fw.user_id,
  fw.email,
  fw.transaction_id,
  fw.amount as failed_withdrawal_amount,
  fw.created_at,
  fw.current_balance,
  -- Calculate if this withdrawal could explain the discrepancy
  (SELECT calculated_balance - profile_balance 
   FROM (
     SELECT 
       p.balance as profile_balance,
       COALESCE(
         SUM(
           CASE 
             WHEN t.type = 'deposit' THEN t.amount
             WHEN t.type = 'withdrawal' THEN -t.amount
             WHEN t.type = 'internal' THEN t.amount
             ELSE 0
           END
         ), 0
       ) as calculated_balance
     FROM profiles p
     LEFT JOIN transactions t ON t.user_id = p.id AND t.status = 'completed'
     WHERE p.id = fw.user_id
     GROUP BY p.balance
   ) calc
  ) as discrepancy
FROM failed_withdrawals fw
WHERE EXISTS (
  -- Only show if user has a discrepancy
  SELECT 1 
  FROM (
    SELECT 
      p.id,
      p.balance as profile_balance,
      COALESCE(
        SUM(
          CASE 
            WHEN t.type = 'deposit' THEN t.amount
            WHEN t.type = 'withdrawal' THEN -t.amount
            WHEN t.type = 'internal' THEN t.amount
            ELSE 0
          END
        ), 0
      ) as calculated_balance
    FROM profiles p
    LEFT JOIN transactions t ON t.user_id = p.id AND t.status = 'completed'
    WHERE p.id = fw.user_id
    GROUP BY p.id, p.balance
  ) calc
  WHERE calculated_balance != profile_balance
);

-- Step 3: Fix balance for paulitoi@gmail.com specifically
-- First, verify the discrepancy
SELECT 
  p.id,
  p.email,
  p.balance as profile_balance,
  COALESCE(
    SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN t.amount
        ELSE 0
      END
    ), 0
  ) as calculated_balance,
  COALESCE(
    SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN t.amount
        ELSE 0
      END
    ), 0
  ) - p.balance as discrepancy
FROM profiles p
LEFT JOIN transactions t ON t.user_id = p.id AND t.status = 'completed'
WHERE p.email = 'paulitoi@gmail.com'
GROUP BY p.id, p.email, p.balance;

-- Step 4: Update balance to match calculated balance (ONLY if discrepancy matches a failed withdrawal)
-- IMPORTANT: Review the output of Step 3 before running this!
-- This will fix paulitoi@gmail.com's balance if the discrepancy is 1,000
UPDATE profiles
SET balance = (
  SELECT COALESCE(
    SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN t.amount
        ELSE 0
      END
    ), 0
  )
  FROM transactions t
  WHERE t.user_id = profiles.id AND t.status = 'completed'
),
updated_at = NOW()
WHERE email = 'paulitoi@gmail.com'
  AND balance != (
    SELECT COALESCE(
      SUM(
        CASE 
          WHEN t.type = 'deposit' THEN t.amount
          WHEN t.type = 'withdrawal' THEN -t.amount
          WHEN t.type = 'internal' THEN t.amount
          ELSE 0
        END
      ), 0
    )
    FROM transactions t
    WHERE t.user_id = profiles.id AND t.status = 'completed'
  );

-- Step 5: Verify the fix
SELECT 
  p.id,
  p.email,
  p.balance as profile_balance,
  COALESCE(
    SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN t.amount
        ELSE 0
      END
    ), 0
  ) as calculated_balance,
  p.balance - COALESCE(
    SUM(
      CASE 
        WHEN t.type = 'deposit' THEN t.amount
        WHEN t.type = 'withdrawal' THEN -t.amount
        WHEN t.type = 'internal' THEN t.amount
        ELSE 0
      END
    ), 0
  ) as discrepancy
FROM profiles p
LEFT JOIN transactions t ON t.user_id = p.id AND t.status = 'completed'
WHERE p.email = 'paulitoi@gmail.com'
GROUP BY p.id, p.email, p.balance;

