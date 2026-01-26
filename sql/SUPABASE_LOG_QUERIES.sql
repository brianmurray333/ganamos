-- Supabase Logs & Analytics Queries
-- Run these in the Query Editor to investigate transaction deletions

-- ============================================
-- QUERY 1: Basic Search for DELETE Operations
-- ============================================
-- This is the simplest query to start with
select
  cast(timestamp as datetime) as timestamp,
  event_message
from postgres_logs
where event_message like '%DELETE%transactions%'
  and timestamp >= '2025-10-26'
order by timestamp desc
limit 100;

-- ============================================
-- QUERY 2: More Comprehensive DELETE Search
-- ============================================
-- Searches for any DELETE operations on transactions table
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from postgres_logs
where (
  event_message like '%DELETE%FROM%transactions%'
  or event_message like '%TRUNCATE%transactions%'
  or event_message like '%DELETE FROM transactions%'
  or event_message like '%TRUNCATE TABLE transactions%'
)
  and timestamp >= '2025-10-26'
order by timestamp desc
limit 100;

-- ============================================
-- QUERY 3: Search All Log Sources (Most Comprehensive)
-- ============================================
-- Check multiple log sources in case the deletion came from different source
select
  'postgres_logs' as source,
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from postgres_logs
where event_message like '%DELETE%transactions%'
  and timestamp >= '2025-10-26'

union all

select
  'postgrest_logs' as source,
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from postgrest_logs
where event_message like '%DELETE%transactions%'
  and timestamp >= '2025-10-26'

union all

select
  'api_logs' as source,
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from api_logs
where event_message like '%DELETE%transactions%'
  and timestamp >= '2025-10-26'

order by timestamp desc
limit 200;

-- ============================================
-- QUERY 4: Look for Specific Error Patterns
-- ============================================
-- Sometimes deletions happen due to cascades or constraints
select
  cast(timestamp as datetime) as timestamp,
  event_message
from postgres_logs
where (
  event_message like '%cascade%transaction%'
  or event_message like '%foreign key%transaction%'
  or event_message like '%constraint%transaction%'
)
  and timestamp >= '2025-10-26'
order by timestamp desc
limit 50;

-- ============================================
-- QUERY 5: Search for Transaction-Related Errors
-- ============================================
-- Look for any errors related to transactions around that time
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from postgres_logs
where event_message like '%transaction%'
  and timestamp >= '2025-10-26'
  and timestamp <= '2025-10-31'
order by timestamp desc
limit 200;

-- ============================================
-- HOW TO USE:
-- ============================================
-- 1. Start with Query 1 (simplest)
-- 2. If no results, try Query 3 (most comprehensive)
-- 3. Copy and paste ONE query at a time into the Query Editor
-- 4. Click "Run" button
-- 5. Look through the results for DELETE/TRUNCATE operations
-- 
-- WHAT TO LOOK FOR:
-- - Any DELETE FROM transactions statements
-- - Any TRUNCATE transactions statements  
-- - ERROR messages that might indicate a problem
-- - Timestamps between Oct 26-30, 2025
--
-- If you find deletions, note:
-- - Exact timestamp
-- - The SQL statement
-- - Any error messages
-- - The metadata field (may contain user info)

