-- ============================================================================
-- MARK FAKE DEPOSIT ATTEMPTS (Keep for Audit Trail)
-- User ID: 75c9b493-0608-45bc-bc6d-9c648fbc88da
-- ============================================================================
-- These are fake deposit attempts - they're all "pending" (not actually paid)
-- We'll MARK them as failed rather than delete to preserve audit trail
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VIEW ALL PENDING DEPOSITS (Evidence of Attack Attempts)
-- ----------------------------------------------------------------------------
SELECT 
  'ATTACK EVIDENCE - PENDING DEPOSITS' as action,
  id,
  amount,
  status,
  payment_request,
  memo,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
  AND status = 'pending'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 2. MARK FAKE DEPOSITS AS FAILED (Preserve for Audit Trail)
-- ----------------------------------------------------------------------------
-- Mark them as "failed" with a memo indicating they're attack attempts
-- This preserves the evidence while making it clear they didn't succeed
UPDATE transactions
SET 
  status = 'failed',
  memo = COALESCE(memo, '') || ' [BLOCKED: Fake deposit attempt - account suspended]',
  updated_at = NOW()
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
  AND status = 'pending';

-- Verify update
SELECT 
  'VERIFICATION' as action,
  status,
  COUNT(*) as count,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
GROUP BY status
ORDER BY status;

-- ----------------------------------------------------------------------------
-- 3. SUMMARY OF ALL DEPOSIT ATTEMPTS (For Documentation)
-- ----------------------------------------------------------------------------
SELECT 
  'ATTACK SUMMARY' as action,
  status,
  COUNT(*) as attempt_count,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_amount_attempted,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'deposit'
GROUP BY status
ORDER BY status;

-- ============================================================================
-- NOTES
-- ============================================================================
-- These deposits are fake because:
-- 1. They're all "pending" - no actual Lightning payment was made
-- 2. They're created in rapid succession (testing pattern)
-- 3. Some have 0 amount (obviously fake)
-- 4. The hacker is trying to inflate their balance with fake transactions
--
-- Why we're NOT deleting them:
-- 1. They're evidence of the attack attempt
-- 2. They're part of the audit trail
-- 3. They show the attacker's methods and patterns
-- 4. They can be used for security analysis
--
-- Why we're marking them as "failed":
-- 1. Makes it clear they didn't succeed
-- 2. Preserves the evidence
-- 3. Keeps audit trail intact
-- 4. Shows the system blocked them
--
-- The reconciliation check correctly excludes pending/failed transactions,
-- so these don't affect the calculated balance.
-- ============================================================================

