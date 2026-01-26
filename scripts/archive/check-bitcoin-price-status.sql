-- Query to check Bitcoin price cache status
-- Run this in Supabase SQL Editor to verify the caching system

-- 1. Get the latest Bitcoin price
SELECT 
  price,
  currency,
  source,
  created_at,
  age_minutes,
  CASE 
    WHEN age_minutes > 60 THEN '⚠️  STALE'
    WHEN age_minutes > 30 THEN '⚡ REFRESH SOON'
    ELSE '✅ FRESH'
  END as status
FROM get_latest_bitcoin_price('USD');

-- 2. View recent price history (last 10 updates)
SELECT 
  id,
  price,
  currency,
  source,
  created_at,
  EXTRACT(EPOCH FROM (now() - created_at))::integer / 60 as age_minutes,
  EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))::integer / 60 as interval_minutes
FROM bitcoin_prices
WHERE currency = 'USD'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Statistics (count, date range, average interval)
SELECT 
  COUNT(*) as total_records,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  MIN(price) as min_price_24h,
  MAX(price) as max_price_24h,
  AVG(price) as avg_price_24h,
  ROUND(AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))::integer / 60), 2) as avg_interval_minutes
FROM bitcoin_prices
WHERE currency = 'USD'
  AND created_at > now() - interval '24 hours';

-- 4. Check for gaps in updates (should be every 30 minutes)
SELECT 
  created_at as update_time,
  LAG(created_at) OVER (ORDER BY created_at) as previous_update,
  EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))::integer / 60 as gap_minutes,
  CASE 
    WHEN EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))::integer / 60 > 45 THEN '⚠️  MISSED UPDATE'
    ELSE '✅ OK'
  END as status
FROM bitcoin_prices
WHERE currency = 'USD'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 5. Check if cleanup is working (should be no records older than 30 days)
SELECT 
  COUNT(*) as old_records_count,
  MIN(created_at) as oldest_date,
  CASE 
    WHEN COUNT(*) > 0 THEN '⚠️  Old records found - run cleanup'
    ELSE '✅ Cleanup working'
  END as cleanup_status
FROM bitcoin_prices
WHERE created_at < now() - interval '30 days';

