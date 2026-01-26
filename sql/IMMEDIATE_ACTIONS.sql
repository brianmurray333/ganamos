-- ============================================================================
-- IMMEDIATE SECURITY ACTIONS
-- User ID: 75c9b493-0608-45bc-bc6d-9c648fbc88da
-- ============================================================================
-- ⚠️  WARNING: Execute these queries immediately to stop the exploit
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FREEZE THE ACCOUNT (Prevent further withdrawals)
-- ----------------------------------------------------------------------------
UPDATE profiles 
SET 
  status = 'suspended',
  updated_at = NOW()
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Verify the account is frozen
SELECT id, email, username, balance, status, updated_at
FROM profiles
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ----------------------------------------------------------------------------
-- 2. RESET BALANCE TO ZERO (Remove fraudulent balance)
-- ----------------------------------------------------------------------------
-- ⚠️  CAUTION: This will set balance to 0. Make sure you've documented everything first!
-- 
-- Before running this, you may want to:
-- 1. Document the current balance
-- 2. Check if there are any legitimate transactions we missed
-- 3. Run the balance calculation query to confirm discrepancy

-- Uncomment the line below to reset balance:
UPDATE profiles 
SET 
  balance = 0,
  updated_at = NOW()
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ----------------------------------------------------------------------------
-- 3. DOCUMENT CURRENT STATE (Before making changes)
-- ----------------------------------------------------------------------------
-- Run this to document the current state before making changes
SELECT 
  'BEFORE FREEZE' as action,
  id,
  email,
  username,
  balance,
  pet_coins,
  status,
  created_at,
  updated_at
FROM profiles
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Document all completed withdrawals (these may need to be reversed)
SELECT 
  'COMPLETED WITHDRAWALS' as type,
  id,
  amount,
  payment_hash,
  payment_request,
  created_at,
  updated_at
FROM transactions
WHERE user_id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
  AND type = 'withdrawal'
  AND status = 'completed'
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 4. 🔴 CRITICAL: CHECK FOR OTHER COMPROMISED ACCOUNTS
-- ----------------------------------------------------------------------------
-- This is the MOST IMPORTANT query - finds ALL accounts with balance discrepancies
-- Run this immediately to see if this attack is widespread!
WITH balance_calculations AS (
  SELECT 
    p.id,
    p.email,
    p.username,
    p.balance as actual_balance,
    p.created_at,
    p.updated_at,
    p.status,
    COALESCE(SUM(CASE 
      WHEN t.type = 'deposit' AND t.status = 'completed' THEN t.amount
      WHEN t.type = 'withdrawal' AND t.status = 'completed' THEN -t.amount
      WHEN t.type = 'internal' AND t.status = 'completed' THEN t.amount
      ELSE 0
    END), 0) as calculated_balance
  FROM profiles p
  LEFT JOIN transactions t ON t.user_id = p.id
  WHERE p.status != 'deleted'
  GROUP BY p.id, p.email, p.username, p.balance, p.created_at, p.updated_at, p.status
)
SELECT 
  id,
  email,
  username,
  actual_balance,
  calculated_balance,
  actual_balance - calculated_balance as discrepancy,
  CASE 
    WHEN ABS(actual_balance - calculated_balance) > 10000000 THEN '🔴 CRITICAL: >10M discrepancy'
    WHEN ABS(actual_balance - calculated_balance) > 1000000 THEN '🟠 HIGH: >1M discrepancy'
    WHEN ABS(actual_balance - calculated_balance) > 100000 THEN '🟡 MEDIUM: >100k discrepancy'
    WHEN ABS(actual_balance - calculated_balance) > 1000 THEN '🟢 LOW: >1k discrepancy'
    ELSE 'OK'
  END as risk_level,
  status,
  created_at,
  updated_at
FROM balance_calculations
WHERE ABS(actual_balance - calculated_balance) > 100  -- More than 100 sats discrepancy
ORDER BY ABS(actual_balance - calculated_balance) DESC
LIMIT 100;

-- Also check for accounts with suspiciously high balances (simpler check)
SELECT 
  id,
  email,
  username,
  balance,
  status,
  created_at,
  updated_at,
  CASE 
    WHEN balance > 10000000 THEN '🔴 CRITICAL: >10M sats'
    WHEN balance > 1000000 THEN '🟠 HIGH: >1M sats'
    WHEN balance > 100000 THEN '🟡 MEDIUM: >100k sats'
    ELSE 'OK'
  END as risk_level
FROM profiles
WHERE balance > 100000  -- More than 100k sats
  AND status = 'active'
  AND id != '75c9b493-0608-45bc-bc6d-9c648fbc88da'  -- Exclude the known bad account
ORDER BY balance DESC
LIMIT 50;

-- Find accounts created recently with high balances
SELECT 
  id,
  email,
  username,
  balance,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 as hours_to_balance
FROM profiles
WHERE created_at > NOW() - INTERVAL '7 days'
  AND balance > 10000
  AND status = 'active'
ORDER BY balance DESC;

-- ----------------------------------------------------------------------------
-- 5. CHECK FOR PATTERNS IN BALANCE CHANGES
-- ----------------------------------------------------------------------------
-- Find accounts with large balance increases in last 7 days
SELECT 
  id,
  email,
  balance,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 as hours_ago
FROM profiles
WHERE updated_at > NOW() - INTERVAL '7 days'
  AND balance > 100000
  AND status = 'active'
ORDER BY balance DESC;

-- ----------------------------------------------------------------------------
-- 6. VERIFY ACCOUNT IS FROZEN
-- ----------------------------------------------------------------------------
-- After running the freeze query, verify it worked:
SELECT 
  CASE 
    WHEN status = 'suspended' THEN '✅ Account is frozen'
    WHEN status = 'active' THEN '❌ Account is still active - FREEZE FAILED'
    ELSE '⚠️  Unknown status'
  END as freeze_status,
  id,
  email,
  status,
  balance
FROM profiles
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- ============================================================================
-- POST-ACTION VERIFICATION
-- ============================================================================
-- After freezing, verify:
-- 1. Account status is 'suspended'
-- 2. No new withdrawals can be processed (test if possible)
-- 3. Balance is documented
-- 4. All withdrawal payment hashes are saved
-- 5. Other suspicious accounts are identified

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- COMPLETED WITHDRAWALS (375,000 sats total):
-- 1. 100,000 sats - Payment hash: uIbRRLd35I8bhqwybPmyHW5vLlndMIngAAzCb0oAMAw=
-- 2. 100,000 sats - Payment hash: b5H+772h63/w4U3NQYe4RzvzP8Q6Qm+T+gcYrjzb15U=
-- 3. 100,000 sats - Payment hash: UlYEQES+hYN9hZgDSvyQCaNcawj+MtTUweqxGL5U4QI=
-- 4. 50,000 sats  - Payment hash: uPPs1Wod+VvNTHLAJrAOdFQrm+oqfxgGIxtmJuBHK6c=
-- 5. 25,000 sats  - Payment hash: PFOZ3EIC3W/bbJh/vaKt9Nx+NCcua9VCsuNzGXR85oE=
--
-- These payments may need to be investigated with your Lightning node
-- to see if they can be traced or reversed.
--
-- ============================================================================

