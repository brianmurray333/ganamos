-- ============================================================================
-- CRITICAL SECURITY FIX: Remove dangerous transaction update policy
-- ============================================================================
-- 
-- VULNERABILITY: The policy "Users can update their own transactions" allowed
-- authenticated users to directly update ANY field on their transactions,
-- including status and amount.
--
-- EXPLOIT: Attackers could:
-- 1. Create a deposit invoice (creates transaction with status='pending')
-- 2. Use Supabase client to update: { status: 'completed', amount: 100000 }
-- 3. Attempt withdrawal of inflated amount
--
-- The reconciliation check caught this because stored_balance != calculated_balance,
-- but the vulnerability still allowed transaction record manipulation.
--
-- FIX: Remove the policy entirely. Transaction updates should ONLY happen
-- server-side through service_role.
-- ============================================================================

-- Drop the dangerous policies (using actual policy names from database)
DROP POLICY IF EXISTS "Users can update their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create their own transactions" ON transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON transactions;

-- Verify: Users should only be able to SELECT their transactions
-- All INSERT/UPDATE/DELETE should go through service_role (server-side)

-- Keep the SELECT policy (don't drop it)
-- transactions_select_policy should remain

-- Note: Service role automatically bypasses RLS, so no explicit policy needed

