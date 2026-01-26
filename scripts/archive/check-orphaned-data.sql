-- Check for orphaned data patterns

-- 1. Check if the 6 remaining transactions have valid user_ids
SELECT 
  'Orphaned transactions' as check_type,
  t.id,
  t.user_id,
  t.type,
  t.amount,
  t.memo,
  t.created_at,
  CASE 
    WHEN t.user_id IS NULL THEN 'NULL user_id'
    WHEN p.id IS NULL THEN 'user_id does not exist in profiles'
    ELSE 'Valid user_id'
  END as status
FROM transactions t
LEFT JOIN profiles p ON t.user_id = p.id
ORDER BY t.created_at DESC;

-- 2. Check if users with balances have ANY transaction references in activities
SELECT 
  'Users with balance but orphaned transactions' as check_type,
  p.id,
  p.email,
  p.balance,
  COUNT(DISTINCT a.related_id) as referenced_transactions,
  COUNT(DISTINCT CASE WHEN a.related_table = 'transactions' THEN a.related_id END) as activity_transaction_refs
FROM profiles p
LEFT JOIN activities a ON a.user_id = p.id AND a.related_table = 'transactions'
WHERE p.balance > 0
GROUP BY p.id, p.email, p.balance
HAVING COUNT(DISTINCT a.related_id) > 0
ORDER BY p.balance DESC;

-- 3. List ALL 6 transactions with full details
SELECT 
  'All remaining transactions' as check_type,
  id,
  user_id,
  type,
  amount,
  status,
  memo,
  created_at,
  updated_at
FROM transactions
ORDER BY created_at DESC;

-- 4. Check if there are any transaction IDs in activities that don't exist in transactions table
SELECT 
  'Missing transactions referenced in activities' as check_type,
  COUNT(DISTINCT a.related_id) as missing_transaction_count
FROM activities a
WHERE a.related_table = 'transactions'
  AND a.related_id NOT IN (SELECT id FROM transactions);

-- 5. Show examples of missing transactions
SELECT 
  'Sample missing transactions' as check_type,
  a.user_id,
  a.type,
  a.timestamp,
  a.metadata,
  a.related_id
FROM activities a
WHERE a.related_table = 'transactions'
  AND a.related_id NOT IN (SELECT id FROM transactions)
ORDER BY a.timestamp DESC
LIMIT 20;

