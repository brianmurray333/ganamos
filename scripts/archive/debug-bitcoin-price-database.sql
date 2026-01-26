-- Debug script to check Bitcoin price database setup

-- 1. Check if table exists and has data
SELECT 
  'Table Data' as check_type,
  COUNT(*) as record_count,
  MAX(created_at) as latest_record,
  MAX(price) as latest_price
FROM bitcoin_prices;

-- 2. Check if function exists
SELECT 
  'Function Check' as check_type,
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name = 'get_latest_bitcoin_price';

-- 3. Try calling the function directly
SELECT 
  'Function Call' as check_type,
  *
FROM get_latest_bitcoin_price('USD');

-- 4. Check RLS policies
SELECT 
  'RLS Policies' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'bitcoin_prices';

-- 5. Check if anon role can read
SET ROLE anon;
SELECT 
  'Anon Access Test' as check_type,
  COUNT(*) as visible_records
FROM bitcoin_prices;
RESET ROLE;



