-- Balance Breakdown Analysis
-- Run this in Supabase SQL Editor to see the new breakdown

-- 1. User Balances (sum of all profile balances)
SELECT 
  '👤 User Balances' as category,
  COALESCE(SUM(balance), 0) as amount_sats
FROM profiles
WHERE status != 'deleted' OR status IS NULL;

-- 2. Open Issues Balance (sum of rewards on unfixed, non-deleted posts)
SELECT 
  '📋 Open Issues' as category,
  COALESCE(SUM(reward), 0) as amount_sats
FROM posts
WHERE fixed = false
  AND deleted_at IS NULL
  AND reward > 0;

-- 3. Paid Orders Balance (sum of paid pet orders)
SELECT 
  '🛒 Paid Orders' as category,
  COALESCE(SUM(total_price_sats), 0) as amount_sats
FROM pet_orders
WHERE payment_status = 'paid';

-- FULL BREAKDOWN (combined query)
SELECT 
  category,
  amount_sats,
  CASE 
    WHEN category = '📊 TOTAL APP BALANCE' THEN '━━━━━━━━━'
    ELSE ''
  END as separator
FROM (
  SELECT '👤 User Balances' as category, COALESCE(SUM(balance), 0) as amount_sats, 1 as sort_order
  FROM profiles WHERE status != 'deleted' OR status IS NULL
  UNION ALL
  SELECT '📋 Open Issues' as category, COALESCE(SUM(reward), 0) as amount_sats, 2 as sort_order
  FROM posts WHERE fixed = false AND deleted_at IS NULL AND reward > 0
  UNION ALL
  SELECT '🛒 Paid Orders' as category, COALESCE(SUM(total_price_sats), 0) as amount_sats, 3 as sort_order
  FROM pet_orders WHERE payment_status = 'paid'
  UNION ALL
  SELECT '📊 TOTAL APP BALANCE' as category, 
    (SELECT COALESCE(SUM(balance), 0) FROM profiles WHERE status != 'deleted' OR status IS NULL) +
    (SELECT COALESCE(SUM(reward), 0) FROM posts WHERE fixed = false AND deleted_at IS NULL AND reward > 0) +
    (SELECT COALESCE(SUM(total_price_sats), 0) FROM pet_orders WHERE payment_status = 'paid'),
    4 as sort_order
) breakdown
ORDER BY sort_order;

-- AUDIT: Compare with your node balance (292,840 sats)
-- The difference should now be much smaller!
SELECT 
  'Audit Check' as analysis,
  292840 as node_balance,
  (
    (SELECT COALESCE(SUM(balance), 0) FROM profiles WHERE status != 'deleted' OR status IS NULL) +
    (SELECT COALESCE(SUM(reward), 0) FROM posts WHERE fixed = false AND deleted_at IS NULL AND reward > 0) +
    (SELECT COALESCE(SUM(total_price_sats), 0) FROM pet_orders WHERE payment_status = 'paid')
  ) as total_app_balance,
  292840 - (
    (SELECT COALESCE(SUM(balance), 0) FROM profiles WHERE status != 'deleted' OR status IS NULL) +
    (SELECT COALESCE(SUM(reward), 0) FROM posts WHERE fixed = false AND deleted_at IS NULL AND reward > 0) +
    (SELECT COALESCE(SUM(total_price_sats), 0) FROM pet_orders WHERE payment_status = 'paid')
  ) as difference;

