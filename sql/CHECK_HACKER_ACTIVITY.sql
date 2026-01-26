-- ============================================================================
-- CHECK HACKER ACTIVITY - User ID: 75c9b493-0608-45bc-bc6d-9c648fbc88da
-- ============================================================================
-- This shows all recent attempts and activity
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECENT WITHDRAWAL ATTEMPTS (Last 24 hours)
-- ----------------------------------------------------------------------------
SELECT 
  'WITHDRAWAL ATTEMPTS' as activity_type,
  id,
  amount,
  status,
  payment_request,
  payment_hash,
  ip_address,
  user_agent,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'withdrawal'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 2. ALL WITHDRAWAL ATTEMPTS (Ever)
-- ----------------------------------------------------------------------------
SELECT 
  'ALL WITHDRAWALS' as activity_type,
  id,
  amount,
  status,
  payment_hash,
  created_at,
  updated_at,
  CASE 
    WHEN status = 'completed' THEN '✅ SUCCEEDED'
    WHEN status = 'failed' THEN '❌ FAILED'
    WHEN status = 'pending' THEN '⏳ PENDING'
    WHEN status = 'pending_approval' THEN '⏳ PENDING APPROVAL'
    ELSE status
  END as result
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'withdrawal'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 3. RECENT AUDIT LOGS (Last 24 hours)
-- ----------------------------------------------------------------------------
SELECT 
  'AUDIT LOGS' as activity_type,
  id,
  transaction_id,
  action,
  details,
  ip_address,
  user_agent,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM withdrawal_audit_logs
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 4. ALL AUDIT LOGS (Ever)
-- ----------------------------------------------------------------------------
SELECT 
  'ALL AUDIT LOGS' as activity_type,
  action,
  details,
  ip_address,
  user_agent,
  created_at
FROM withdrawal_audit_logs
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
ORDER BY created_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 5. SUMMARY: Count of attempts by status
-- ----------------------------------------------------------------------------
SELECT 
  'SUMMARY' as activity_type,
  status,
  COUNT(*) as attempt_count,
  SUM(amount) as total_amount_attempted,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'withdrawal'
GROUP BY status
ORDER BY attempt_count DESC;

-- ----------------------------------------------------------------------------
-- 6. RECENT ACTIVITY TIMELINE (Last 7 days)
-- ----------------------------------------------------------------------------
SELECT 
  'TIMELINE' as activity_type,
  'transaction' as source,
  type,
  amount,
  status,
  created_at
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND created_at > NOW() - INTERVAL '7 days'
UNION ALL
SELECT 
  'TIMELINE' as activity_type,
  'audit_log' as source,
  action as type,
  NULL as amount,
  NULL as status,
  created_at
FROM withdrawal_audit_logs
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 7. RECENT DEPOSIT ATTEMPTS (Today - Suspicious!)
-- ----------------------------------------------------------------------------
SELECT 
  'SUSPICIOUS DEPOSITS' as activity_type,
  id,
  amount,
  status,
  payment_request,
  payment_hash,
  memo,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 8. CURRENT BALANCE RECONCILIATION STATUS
-- ----------------------------------------------------------------------------
SELECT 
  'RECONCILIATION STATUS' as activity_type,
  reconciles,
  stored_balance,
  calculated_balance,
  discrepancy,
  CASE 
    WHEN reconciles THEN '✅ OK'
    WHEN ABS(discrepancy) > 100000 THEN '🔴 CRITICAL'
    WHEN ABS(discrepancy) > 10000 THEN '🟠 HIGH'
    ELSE '🟡 MEDIUM'
  END as risk_level
FROM check_balance_reconciliation('75c9b493-0608-45bc-bc6d-9c648fbc88da');

-- ----------------------------------------------------------------------------
-- 9. CHECK IF WITHDRAWALS WERE ATTEMPTED TODAY (via reconciliation check)
-- ----------------------------------------------------------------------------
-- Note: If reconciliation fails, no transaction is created, so we can't see it here
-- But we can check the current reconciliation status to see if it would fail
-- The alert you received means they tried to withdraw and reconciliation failed
SELECT 
  'ALERT EXPLANATION' as activity_type,
  'The reconciliation check happens BEFORE transaction creation' as note_1,
  'If it fails, no transaction record is created' as note_2,
  'Check Vercel logs for console.error entries' as note_3,
  'The alert email timestamp shows when they tried' as note_4;

