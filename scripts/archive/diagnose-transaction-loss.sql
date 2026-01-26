-- Diagnostic queries to understand why transactions were lost
-- Run these in Supabase SQL Editor

-- ============================================
-- 1. Check if there are any transactions at all (including deleted ones)
-- ============================================
SELECT 
  COUNT(*) as total_transactions,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(created_at) as oldest_transaction,
  MAX(created_at) as newest_transaction
FROM transactions;

-- ============================================
-- 2. Check for foreign key constraints that might have cascaded deletes
-- ============================================
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'transactions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule IN ('CASCADE', 'SET NULL', 'SET DEFAULT');

-- ============================================
-- 3. Check if ANY profiles were deleted around that time
-- ============================================
-- This won't show deleted profiles, but we can check for gaps
SELECT 
  'profiles_count' as metric,
  COUNT(*) as count
FROM profiles;

-- ============================================
-- 4. Check recent profile activity
-- ============================================
SELECT 
  COUNT(*) as profiles_with_recent_activity,
  MIN(created_at) as oldest_profile,
  MAX(created_at) as newest_profile,
  MAX(updated_at) as most_recent_update
FROM profiles
WHERE updated_at > '2025-10-26';

-- ============================================
-- 5. Check for triggers on transactions table
-- ============================================
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'transactions';

-- ============================================
-- 6. Check RLS policies on transactions table
-- ============================================
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'transactions';

-- ============================================
-- 7. Check table size and index info
-- ============================================
SELECT 
  pg_size_pretty(pg_total_relation_size('transactions')) as total_size,
  pg_size_pretty(pg_relation_size('transactions')) as table_size,
  pg_size_pretty(pg_total_relation_size('transactions') - pg_relation_size('transactions')) as indexes_size;

-- ============================================
-- 8. Check if there's a soft-delete column we're missing
-- ============================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'transactions'
ORDER BY ordinal_position;

-- ============================================
-- 9. Look for any unusual patterns in user_ids
-- ============================================
SELECT 
  user_id,
  COUNT(*) as transaction_count,
  MIN(created_at) as first_transaction,
  MAX(created_at) as last_transaction
FROM transactions
GROUP BY user_id
ORDER BY transaction_count DESC;

-- ============================================
-- 10. Check if activities table still has references
-- ============================================
SELECT 
  COUNT(*) as total_activities,
  COUNT(CASE WHEN type = 'internal' THEN 1 END) as internal_activities,
  COUNT(CASE WHEN related_table = 'transactions' THEN 1 END) as transaction_activities
FROM activities;

