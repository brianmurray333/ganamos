-- ============================================================================
-- Pre-Migration Check for Non-Custodial Wallet Support
-- Run this BEFORE the migration to verify current database state
-- ============================================================================

-- 1. Check if user_wallets table already exists
SELECT 
  'user_wallets table exists' as check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_wallets'
  ) as result;

-- 2. Check if wallet_connection_audit table already exists
SELECT 
  'wallet_connection_audit table exists' as check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wallet_connection_audit'
  ) as result;

-- 3. Check if wallet_type enum already exists
SELECT 
  'wallet_type enum exists' as check_name,
  EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'wallet_type'
  ) as result;

-- 4. Check current profiles table structure
SELECT 
  'profiles table columns' as info,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 5. Specifically check if wallet_prompt_dismissed column exists in profiles
SELECT 
  'wallet_prompt_dismissed column exists in profiles' as check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'wallet_prompt_dismissed'
  ) as result;

-- 6. Check if wallet_prompt_dismissed_at column exists in profiles
SELECT 
  'wallet_prompt_dismissed_at column exists in profiles' as check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'wallet_prompt_dismissed_at'
  ) as result;

-- 7. Check existing RLS policies on profiles
SELECT 
  'profiles RLS policies' as info,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 8. Check if uuid-ossp extension is enabled (needed for uuid_generate_v4)
SELECT 
  'uuid-ossp extension enabled' as check_name,
  EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
  ) as result;

-- 9. Check for any existing functions we might be creating
SELECT 
  'get_active_user_wallet function exists' as check_name,
  EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_active_user_wallet'
  ) as result;

SELECT 
  'disconnect_user_wallet function exists' as check_name,
  EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'disconnect_user_wallet'
  ) as result;

-- 10. Show all current tables in public schema for reference
SELECT 
  'All public tables' as info,
  table_name
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 11. Check profiles table foreign key to auth.users
SELECT 
  'profiles foreign keys' as info,
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'profiles';
