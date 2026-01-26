-- Reconstruct missing transactions from activities table
-- This script recreates transactions that were deleted but still referenced in activities

-- ============================================
-- STEP 1: Backup current transactions
-- ============================================
CREATE TABLE IF NOT EXISTS transactions_backup_20251030 AS 
SELECT * FROM transactions;

-- ============================================
-- STEP 2: Find ALL missing transactions from activities
-- ============================================
CREATE TEMP TABLE missing_transactions AS
SELECT DISTINCT
  a.related_id as id,
  a.user_id,
  'internal' as type,  -- Most will be internal based on sample
  COALESCE((a.metadata->>'amount')::integer, 0) as amount,
  COALESCE(a.metadata->>'status', 'completed') as status,
  COALESCE(a.metadata->>'memo', '') as memo,
  a.timestamp as created_at,
  a.timestamp as updated_at,
  NULL::text as r_hash_str,
  NULL::text as payment_request,
  NULL::text as payment_hash
FROM activities a
WHERE a.related_table = 'transactions'
  AND a.related_id NOT IN (SELECT id FROM transactions)
  AND a.related_id IS NOT NULL;

-- Show what we found
SELECT 
  'Missing transactions to restore' as info,
  COUNT(*) as total_missing,
  COUNT(DISTINCT user_id) as affected_users,
  SUM(amount) as total_amount
FROM missing_transactions;

-- ============================================
-- STEP 3: Insert the missing transactions
-- ============================================
INSERT INTO transactions (
  id,
  user_id,
  type,
  amount,
  status,
  memo,
  created_at,
  updated_at,
  r_hash_str,
  payment_request,
  payment_hash
)
SELECT 
  id,
  user_id,
  type,
  amount,
  status,
  memo,
  created_at,
  updated_at,
  r_hash_str,
  payment_request,
  payment_hash
FROM missing_transactions
ON CONFLICT (id) DO NOTHING;  -- Don't duplicate if somehow exists

-- ============================================
-- STEP 4: Verify the restore
-- ============================================
SELECT 
  'Transaction restore complete' as status,
  (SELECT COUNT(*) FROM transactions) as total_transactions,
  (SELECT COUNT(DISTINCT user_id) FROM transactions) as unique_users,
  (SELECT COUNT(*) FROM activities WHERE related_table = 'transactions' AND related_id IN (SELECT id FROM transactions)) as matching_activities;

-- ============================================
-- STEP 5: Check balance reconciliation
-- ============================================
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
WHERE p.balance > 0
ORDER BY ABS(discrepancy) DESC
LIMIT 10;

-- ============================================
-- STEP 6: Show restored transactions summary
-- ============================================
SELECT 
  'Restored transactions by type' as summary,
  type,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM transactions
WHERE id IN (SELECT id FROM missing_transactions)
GROUP BY type;

-- Clean up temp table
DROP TABLE IF EXISTS missing_transactions;

