-- ============================================================================
-- SECURITY INVESTIGATION: User ID 75c9b493-0608-45bc-bc6d-9c648fbc88da
-- ============================================================================
-- Run these queries to investigate suspicious activity
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER PROFILE INFORMATION
-- ----------------------------------------------------------------------------
SELECT 
  id,
  email,
  name,
  username,
  balance,
  pet_coins,
  fixed_issues_count,
  status,
  created_at,
  updated_at,
  deleted_at,
  deleted_by
FROM profiles
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ----------------------------------------------------------------------------
-- 2. ALL TRANSACTIONS FOR THIS USER
-- ----------------------------------------------------------------------------
SELECT 
  id,
  user_id,
  type,
  amount,
  status,
  payment_request,
  payment_hash,
  memo,
  r_hash_str,
  created_at,
  updated_at,
  -- Calculate running balance if needed
  SUM(CASE 
    WHEN type = 'deposit' AND status = 'completed' THEN amount
    WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
    WHEN type = 'internal' AND status = 'completed' THEN amount
    ELSE 0
  END) OVER (ORDER BY created_at) as running_balance
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY created_at DESC;

-- Summary of transactions by type and status
SELECT 
  type,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount,
  AVG(amount) as avg_amount
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
GROUP BY type, status
ORDER BY type, status;

-- Large transactions (potential red flags)
SELECT 
  id,
  type,
  amount,
  status,
  memo,
  created_at
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND ABS(amount) >= 10000  -- Adjust threshold as needed
ORDER BY ABS(amount) DESC;

-- Failed transactions that were later completed (potential manipulation)
SELECT 
  t1.id,
  t1.type,
  t1.amount,
  t1.status as original_status,
  t1.created_at as original_created,
  t1.updated_at as last_updated,
  t2.status as current_status,
  t2.updated_at as status_changed_at
FROM transactions t1
LEFT JOIN transactions t2 ON t1.id = t2.id
WHERE t1.user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND t1.status = 'failed'
ORDER BY t1.created_at DESC;

-- ----------------------------------------------------------------------------
-- 3. ALL ACTIVITIES FOR THIS USER
-- ----------------------------------------------------------------------------
SELECT 
  id,
  user_id,
  type,
  related_id,
  related_table,
  timestamp,
  metadata,
  created_at
FROM activities
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY timestamp DESC
LIMIT 500;  -- Adjust limit as needed

-- Activity summary by type
SELECT 
  type,
  COUNT(*) as count,
  MIN(timestamp) as first_activity,
  MAX(timestamp) as last_activity
FROM activities
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
GROUP BY type
ORDER BY count DESC;

-- Activities with high-value metadata (rewards, amounts, etc.)
SELECT 
  id,
  type,
  related_id,
  related_table,
  timestamp,
  metadata->>'amount' as amount,
  metadata->>'sats' as sats,
  metadata->>'reward' as reward,
  metadata,
  created_at
FROM activities
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND (
    (metadata->>'amount')::numeric > 1000 OR
    (metadata->>'sats')::numeric > 1000 OR
    (metadata->>'reward')::numeric > 1000
  )
ORDER BY timestamp DESC;

-- ----------------------------------------------------------------------------
-- 4. CONNECTED ACCOUNTS (Parent-Child relationships)
-- ----------------------------------------------------------------------------
-- Accounts where this user is the PRIMARY user
SELECT 
  ca.id,
  ca.primary_user_id,
  ca.connected_user_id,
  ca.created_at,
  p.email as connected_email,
  p.username as connected_username,
  p.balance as connected_balance,
  p.status as connected_status
FROM connected_accounts ca
LEFT JOIN profiles p ON ca.connected_user_id = p.id
WHERE ca.primary_user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Accounts where this user is the CONNECTED user (child account)
SELECT 
  ca.id,
  ca.primary_user_id,
  ca.connected_user_id,
  ca.created_at,
  p.email as primary_email,
  p.username as primary_username,
  p.balance as primary_balance,
  p.status as primary_status
FROM connected_accounts ca
LEFT JOIN profiles p ON ca.primary_user_id = p.id
WHERE ca.connected_user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- All transactions from connected accounts (if this user is primary)
SELECT 
  t.*,
  p.email as connected_account_email,
  p.username as connected_account_username
FROM transactions t
JOIN connected_accounts ca ON t.user_id = ca.connected_user_id
LEFT JOIN profiles p ON ca.connected_user_id = p.id
WHERE ca.primary_user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY t.created_at DESC;

-- ----------------------------------------------------------------------------
-- 5. POSTS CREATED, CLAIMED, OR FIXED BY THIS USER
-- ----------------------------------------------------------------------------
-- Posts created by this user
SELECT 
  id,
  user_id,
  title,
  description,
  reward,
  original_reward,
  total_boost_amount,
  claimed,
  claimed_by,
  claimed_at,
  fixed,
  fixed_at,
  fixed_by,
  created_at,
  group_id,
  city,
  is_anonymous,
  funding_status
FROM posts
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY created_at DESC;

-- Posts claimed by this user
SELECT 
  id,
  user_id,
  title,
  reward,
  original_reward,
  total_boost_amount,
  claimed,
  claimed_by,
  claimed_at,
  fixed,
  fixed_at,
  created_at
FROM posts
WHERE claimed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY claimed_at DESC;

-- Posts fixed by this user
SELECT 
  id,
  user_id,
  title,
  reward,
  original_reward,
  total_boost_amount,
  claimed,
  claimed_by,
  fixed,
  fixed_at,
  fixed_by,
  fixed_by_is_anonymous,
  anonymous_reward_paid_at,
  anonymous_reward_payment_hash,
  created_at
FROM posts
WHERE fixed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY fixed_at DESC;

-- High-value posts (potential manipulation)
SELECT 
  id,
  user_id,
  title,
  reward,
  original_reward,
  total_boost_amount,
  claimed,
  fixed,
  created_at
FROM posts
WHERE (
  user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da' OR
  claimed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da' OR
  fixed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
)
AND (reward >= 10000 OR total_boost_amount >= 10000)
ORDER BY reward DESC;

-- ----------------------------------------------------------------------------
-- 6. PENDING FIXES SUBMITTED BY THIS USER
-- ----------------------------------------------------------------------------
SELECT 
  pf.id,
  pf.post_id,
  pf.fixer_id,
  pf.fix_image_url,
  pf.fixer_note,
  pf.confidence_score,
  pf.ai_reasoning,
  pf.created_at,
  pf.status,
  p.title as post_title,
  p.reward as post_reward,
  p.user_id as post_owner_id
FROM pending_fixes pf
LEFT JOIN posts p ON pf.post_id = p.id
WHERE pf.fixer_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY pf.created_at DESC;

-- ----------------------------------------------------------------------------
-- 7. DONATIONS MADE BY THIS USER
-- ----------------------------------------------------------------------------
SELECT 
  d.id,
  d.donor_user_id,
  d.donation_pool_id,
  d.amount,
  d.payment_hash,
  d.payment_request,
  d.status,
  d.donor_name,
  d.message,
  d.created_at,
  d.completed_at,
  dp.location_type,
  dp.location_name
FROM donations d
LEFT JOIN donation_pools dp ON d.donation_pool_id = dp.id
WHERE d.donor_user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY d.created_at DESC;

-- ----------------------------------------------------------------------------
-- 8. GROUP MEMBERSHIPS
-- ----------------------------------------------------------------------------
SELECT 
  gm.id,
  gm.group_id,
  gm.user_id,
  gm.role,
  gm.status,
  gm.created_at,
  g.name as group_name,
  g.group_code,
  g.created_by as group_owner_id
FROM group_members gm
LEFT JOIN groups g ON gm.group_id = g.id
WHERE gm.user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Groups created by this user
SELECT 
  id,
  name,
  description,
  created_by,
  invite_code,
  group_code,
  created_at
FROM groups
WHERE created_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 9. INTERNAL TRANSFERS (to/from other users)
-- ----------------------------------------------------------------------------
-- Transfers TO this user
SELECT 
  t.id,
  t.user_id as recipient_id,
  t.type,
  t.amount,
  t.status,
  t.memo,
  t.created_at,
  p.email as recipient_email,
  p.username as recipient_username
FROM transactions t
LEFT JOIN profiles p ON t.user_id = p.id
WHERE t.user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND t.type = 'internal'
ORDER BY t.created_at DESC;

-- Find the sender of internal transfers (check related transactions)
-- Note: This requires checking if there's a pattern in memo or related_id
SELECT 
  t1.id as recipient_tx_id,
  t1.user_id as recipient_id,
  t1.amount as recipient_amount,
  t1.memo,
  t1.created_at,
  t2.id as sender_tx_id,
  t2.user_id as sender_id,
  t2.amount as sender_amount,
  p.email as sender_email,
  p.username as sender_username
FROM transactions t1
LEFT JOIN transactions t2 ON (
  t2.type = 'internal' 
  AND t2.amount = -t1.amount 
  AND ABS(EXTRACT(EPOCH FROM (t2.created_at - t1.created_at))) < 60  -- Within 60 seconds
)
LEFT JOIN profiles p ON t2.user_id = p.id
WHERE t1.user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND t1.type = 'internal'
ORDER BY t1.created_at DESC;

-- ----------------------------------------------------------------------------
-- 10. SUSPICIOUS PATTERNS
-- ----------------------------------------------------------------------------
-- Rapid balance changes (multiple transactions in short time)
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as deposits,
  SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN amount ELSE 0 END) as withdrawals,
  SUM(CASE WHEN type = 'internal' AND status = 'completed' THEN amount ELSE 0 END) as internal
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
GROUP BY DATE_TRUNC('hour', created_at)
HAVING COUNT(*) > 5  -- More than 5 transactions in an hour
ORDER BY hour DESC;

-- Transactions with same payment hash (potential duplicate)
SELECT 
  payment_hash,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  array_agg(id) as transaction_ids,
  array_agg(created_at) as created_dates
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND payment_hash IS NOT NULL
GROUP BY payment_hash
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Posts with unusual reward patterns
SELECT 
  id,
  title,
  reward,
  original_reward,
  total_boost_amount,
  (total_boost_amount::numeric / NULLIF(original_reward, 0)) * 100 as boost_percentage,
  created_at,
  fixed_at
FROM posts
WHERE (
  user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da' OR
  fixed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
)
AND total_boost_amount > 0
AND (total_boost_amount::numeric / NULLIF(original_reward, 0)) > 5  -- More than 500% boost
ORDER BY boost_percentage DESC;

-- ----------------------------------------------------------------------------
-- 11. AUTH USERS TABLE (if accessible)
-- ----------------------------------------------------------------------------
-- Check auth.users for account creation and last sign in
SELECT 
  id,
  email,
  created_at,
  last_sign_in_at,
  email_confirmed_at,
  phone_confirmed_at,
  confirmed_at,
  banned_until
FROM auth.users
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ----------------------------------------------------------------------------
-- 12. DEVICES ASSOCIATED WITH THIS USER
-- ----------------------------------------------------------------------------
SELECT 
  id,
  user_id,
  pairing_code,
  pet_name,
  pet_type,
  status,
  last_seen_at,
  created_at,
  updated_at
FROM devices
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ----------------------------------------------------------------------------
-- 13. COMPREHENSIVE TIMELINE (All activities combined)
-- ----------------------------------------------------------------------------
SELECT 
  'transaction' as source,
  id::text,
  user_id,
  type as activity_type,
  created_at as timestamp,
  jsonb_build_object(
    'type', type,
    'amount', amount,
    'status', status,
    'memo', memo
  ) as details
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'

UNION ALL

SELECT 
  'activity' as source,
  id::text,
  user_id,
  type as activity_type,
  timestamp,
  metadata as details
FROM activities
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'

UNION ALL

SELECT 
  'post_created' as source,
  id::text,
  user_id,
  'post_created' as activity_type,
  created_at as timestamp,
  jsonb_build_object(
    'title', title,
    'reward', reward,
    'claimed', claimed,
    'fixed', fixed
  ) as details
FROM posts
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'

UNION ALL

SELECT 
  'post_fixed' as source,
  id::text,
  fixed_by as user_id,
  'post_fixed' as activity_type,
  fixed_at as timestamp,
  jsonb_build_object(
    'title', title,
    'reward', reward,
    'post_id', id
  ) as details
FROM posts
WHERE fixed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND fixed_at IS NOT NULL

ORDER BY timestamp DESC
LIMIT 1000;

-- ----------------------------------------------------------------------------
-- 14. CRITICAL: FIND SOURCE OF BALANCE (Missing Transactions)
-- ----------------------------------------------------------------------------
-- Calculate what balance SHOULD be based on all transactions
SELECT 
  'Expected Balance' as calculation,
  COALESCE(SUM(CASE 
    WHEN type = 'deposit' AND status = 'completed' THEN amount
    WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
    WHEN type = 'internal' AND status = 'completed' THEN amount
    ELSE 0
  END), 0) as calculated_balance,
  (SELECT balance FROM profiles WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da') as actual_balance,
  (SELECT balance FROM profiles WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da') - 
  COALESCE(SUM(CASE 
    WHEN type = 'deposit' AND status = 'completed' THEN amount
    WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
    WHEN type = 'internal' AND status = 'completed' THEN amount
    ELSE 0
  END), 0) as discrepancy
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Check for internal transfers TO this user (from other users)
SELECT 
  t.id,
  t.user_id as recipient_id,
  t.type,
  t.amount,
  t.status,
  t.memo,
  t.created_at,
  p.email as sender_email,
  p.username as sender_username,
  p.balance as sender_balance
FROM transactions t
JOIN transactions t2 ON (
  t2.type = 'internal' 
  AND t2.amount = -t.amount
  AND ABS(EXTRACT(EPOCH FROM (t2.created_at - t.created_at))) < 60
  AND t2.user_id != t.user_id
)
LEFT JOIN profiles p ON t2.user_id = p.id
WHERE t.user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND t.type = 'internal'
  AND t.amount > 0
ORDER BY t.created_at DESC;

-- Check ALL internal transactions for this user (both directions)
SELECT 
  id,
  user_id,
  type,
  amount,
  status,
  memo,
  created_at,
  CASE 
    WHEN amount > 0 THEN 'RECEIVED'
    WHEN amount < 0 THEN 'SENT'
    ELSE 'ZERO'
  END as direction
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'internal'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 15. CHECK FOR POSTS/FIXES THAT MIGHT HAVE GENERATED REWARDS
-- ----------------------------------------------------------------------------
-- Posts created by this user (should deduct balance)
SELECT 
  id,
  user_id,
  title,
  reward,
  original_reward,
  total_boost_amount,
  claimed,
  fixed,
  created_at,
  'POST CREATED - Should deduct balance' as note
FROM posts
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY created_at DESC;

-- Posts fixed by this user (should add balance)
SELECT 
  id,
  user_id,
  title,
  reward,
  original_reward,
  total_boost_amount,
  fixed,
  fixed_at,
  fixed_by,
  'POST FIXED - Should add balance' as note
FROM posts
WHERE fixed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY fixed_at DESC;

-- Check for missing internal transactions from posts/fixes
-- Compare posts with transactions to find missing records
SELECT 
  p.id as post_id,
  p.title,
  p.reward,
  p.created_at as post_created,
  p.user_id,
  'MISSING TRANSACTION FOR POST CREATION' as issue,
  t.id as transaction_id
FROM posts p
LEFT JOIN transactions t ON (
  t.user_id = p.user_id
  AND t.type = 'internal'
  AND t.amount = -p.reward
  AND ABS(EXTRACT(EPOCH FROM (t.created_at - p.created_at))) < 300  -- Within 5 minutes
)
WHERE p.user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND t.id IS NULL
ORDER BY p.created_at DESC;

SELECT 
  p.id as post_id,
  p.title,
  p.reward,
  p.fixed_at,
  p.fixed_by,
  'MISSING TRANSACTION FOR POST FIX' as issue,
  t.id as transaction_id
FROM posts p
LEFT JOIN transactions t ON (
  t.user_id = p.fixed_by
  AND t.type = 'internal'
  AND t.amount = p.reward
  AND ABS(EXTRACT(EPOCH FROM (t.created_at - p.fixed_at))::INTEGER) < 300  -- Within 5 minutes
)
WHERE p.fixed_by = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND t.id IS NULL
  AND p.fixed = true
ORDER BY p.fixed_at DESC;

-- ----------------------------------------------------------------------------
-- 16. CHECK FOR DATABASE FUNCTION/TRIGGER EXPLOITS
-- ----------------------------------------------------------------------------
-- Check if balance was updated directly (without transaction)
-- This would show if someone bypassed the normal flow
SELECT 
  id,
  balance,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 as minutes_since_creation
FROM profiles
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Check for any balance updates that don't match transaction pattern
-- Look for large balance jumps
WITH balance_changes AS (
  SELECT 
    p.id,
    p.balance,
    p.updated_at,
    COALESCE(SUM(CASE 
      WHEN t.type = 'deposit' AND t.status = 'completed' THEN t.amount
      WHEN t.type = 'withdrawal' AND t.status = 'completed' THEN -t.amount
      WHEN t.type = 'internal' AND t.status = 'completed' THEN t.amount
      ELSE 0
    END), 0) as calculated_balance
  FROM profiles p
  LEFT JOIN transactions t ON t.user_id = p.id
  WHERE p.id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  GROUP BY p.id, p.balance, p.updated_at
)
SELECT 
  *,
  balance - calculated_balance as unexplained_balance
FROM balance_changes;

-- ----------------------------------------------------------------------------
-- 17. CHECK FOR SUSPICIOUS DEPOSIT PATTERNS
-- ----------------------------------------------------------------------------
-- All deposits (including pending)
SELECT 
  id,
  type,
  amount,
  status,
  payment_request,
  payment_hash,
  r_hash_str,
  created_at,
  updated_at,
  CASE 
    WHEN status = 'pending' AND amount = 0 THEN 'SUSPICIOUS: Pending deposit with 0 amount'
    WHEN status = 'completed' AND amount = 0 THEN 'SUSPICIOUS: Completed deposit with 0 amount'
    WHEN payment_hash IS NULL AND status = 'completed' THEN 'SUSPICIOUS: Completed without payment hash'
    ELSE 'OK'
  END as flag
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
ORDER BY created_at DESC;

-- Check if any deposits were completed but missing from our list
SELECT 
  COUNT(*) as completed_deposits_count,
  SUM(amount) as total_deposited
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
  AND status = 'completed';

-- ----------------------------------------------------------------------------
-- 18. TIMELINE ANALYSIS - When did balance appear?
-- ----------------------------------------------------------------------------
-- Create a timeline showing balance changes
WITH transaction_timeline AS (
  SELECT 
    created_at,
    type,
    amount,
    status,
    CASE 
      WHEN type = 'deposit' AND status = 'completed' THEN amount
      WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
      WHEN type = 'internal' AND status = 'completed' THEN amount
      ELSE 0
    END as balance_change,
    SUM(CASE 
      WHEN type = 'deposit' AND status = 'completed' THEN amount
      WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
      WHEN type = 'internal' AND status = 'completed' THEN amount
      ELSE 0
    END) OVER (ORDER BY created_at) as running_calculated_balance
  FROM transactions
  WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
)
SELECT 
  t.*,
  p.balance as actual_balance_at_time,
  p.balance - t.running_calculated_balance as discrepancy_at_time
FROM transaction_timeline t
CROSS JOIN LATERAL (
  SELECT balance, updated_at 
  FROM profiles 
  WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  ORDER BY ABS(EXTRACT(EPOCH FROM (updated_at - t.created_at)))
  LIMIT 1
) p
ORDER BY t.created_at;

-- ----------------------------------------------------------------------------
-- 19. CHECK FOR ADMIN/SUPERUSER ACTIONS
-- ----------------------------------------------------------------------------
-- Check if there are any admin tables or logs
SELECT 
  'Check for admin action logs' as note,
  'Look for any admin dashboard actions or service role operations' as instruction;

-- Check auth.users for suspicious flags
SELECT 
  id,
  email,
  created_at,
  last_sign_in_at,
  email_confirmed_at,
  phone_confirmed_at,
  confirmed_at,
  banned_until,
  raw_app_meta_data,
  raw_user_meta_data
FROM auth.users
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ----------------------------------------------------------------------------
-- 20. CRITICAL: FIND ALL ACCOUNTS WITH BALANCE DISCREPANCIES
-- ----------------------------------------------------------------------------
-- This will find ALL accounts where balance doesn't match transactions
-- This is the most important query - run this immediately!
WITH balance_calculations AS (
  SELECT 
    p.id,
    p.email,
    p.username,
    p.balance as actual_balance,
    p.created_at,
    p.updated_at,
    COALESCE(SUM(CASE 
      WHEN t.type = 'deposit' AND t.status = 'completed' THEN t.amount
      WHEN t.type = 'withdrawal' AND t.status = 'completed' THEN -t.amount
      WHEN t.type = 'internal' AND t.status = 'completed' THEN t.amount
      ELSE 0
    END), 0) as calculated_balance
  FROM profiles p
  LEFT JOIN transactions t ON t.user_id = p.id
  WHERE p.status != 'deleted'
  GROUP BY p.id, p.email, p.username, p.balance, p.created_at, p.updated_at
)
SELECT 
  id,
  email,
  username,
  actual_balance,
  calculated_balance,
  actual_balance - calculated_balance as discrepancy,
  CASE 
    WHEN ABS(actual_balance - calculated_balance) > 10000000 THEN 'CRITICAL: >10M discrepancy'
    WHEN ABS(actual_balance - calculated_balance) > 1000000 THEN 'HIGH: >1M discrepancy'
    WHEN ABS(actual_balance - calculated_balance) > 100000 THEN 'MEDIUM: >100k discrepancy'
    WHEN ABS(actual_balance - calculated_balance) > 1000 THEN 'LOW: >1k discrepancy'
    ELSE 'OK'
  END as risk_level,
  created_at,
  updated_at
FROM balance_calculations
WHERE ABS(actual_balance - calculated_balance) > 100  -- More than 100 sats discrepancy
ORDER BY ABS(discrepancy) DESC
LIMIT 100;

-- ----------------------------------------------------------------------------
-- 21. CHECK POSTGRES LOGS (if available)
-- ----------------------------------------------------------------------------
-- Note: This requires superuser access and log_statement = 'all' or 'mod'
-- May not be available in Supabase managed instances
SELECT 
  'PostgreSQL logs check' as note,
  'If you have access to PostgreSQL logs, search for:' as instruction,
  'UPDATE profiles SET balance = ... WHERE id = ''75c9b493-0608-45bc-bc6d-9c648fbc88da''' as search_query;

-- Alternative: Check if there's a way to see when balance was last updated
-- Compare updated_at with transaction timestamps
SELECT 
  p.id,
  p.balance,
  p.updated_at as balance_last_updated,
  MAX(t.created_at) as last_transaction_time,
  EXTRACT(EPOCH FROM (p.updated_at - MAX(t.created_at))) / 60 as minutes_between_update_and_last_tx
FROM profiles p
LEFT JOIN transactions t ON t.user_id = p.id
WHERE p.id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
GROUP BY p.id, p.balance, p.updated_at;

-- ----------------------------------------------------------------------------
-- 22. CHECK FOR SUSPICIOUS ACCOUNT CREATION PATTERNS
-- ----------------------------------------------------------------------------
-- Find accounts created around the same time with high balances
SELECT 
  id,
  email,
  username,
  balance,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 as minutes_to_first_update,
  CASE 
    WHEN balance > 1000000 AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 < 60 THEN 'SUSPICIOUS: High balance within 1 hour of creation'
    WHEN balance > 100000 AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 < 10 THEN 'SUSPICIOUS: High balance within 10 minutes of creation'
    ELSE 'OK'
  END as flag
FROM profiles
WHERE created_at BETWEEN 
  (SELECT created_at - INTERVAL '1 hour' FROM profiles WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da')
  AND 
  (SELECT created_at + INTERVAL '1 hour' FROM profiles WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da')
  AND status = 'active'
ORDER BY balance DESC;

-- ----------------------------------------------------------------------------
-- 23. ESTIMATE WHEN BALANCE WAS SET
-- ----------------------------------------------------------------------------
-- Based on the timeline, estimate when the balance appeared
-- The account was created at 05:44:54, first withdrawal attempt at 05:55:41
-- So balance was likely set between 05:44:54 and 05:55:41 (about 11 minutes)
SELECT 
  'Timeline Analysis' as analysis,
  'Account created' as event,
  '2025-12-29 05:44:54' as timestamp,
  '0 sats (default)' as balance
UNION ALL
SELECT 
  'Timeline Analysis',
  'Balance likely set (estimated)',
  '2025-12-29 05:45:00 - 05:55:00',
  '~10,100,000 sats (estimated)'
UNION ALL
SELECT 
  'Timeline Analysis',
  'First withdrawal attempt',
  '2025-12-29 05:55:41',
  '9,725,000 sats (after 375k withdrawn)'
UNION ALL
SELECT 
  'Timeline Analysis',
  'Account last updated',
  '2025-12-29 06:00:09',
  '9,725,000 sats (current)';

-- ============================================================================
-- END OF INVESTIGATION QUERIES
-- ============================================================================

