-- SECURITY FIX: Critical RLS Policy Vulnerabilities
-- Date: 2025-01-02
-- 
-- Fixes two critical vulnerabilities identified in security audit:
-- 1. connected_accounts: Any authenticated user could connect to any other user
-- 2. posts: Any authenticated user could update any post
--
-- Attack scenario prevented:
-- - Attacker could INSERT into connected_accounts linking themselves to victim
-- - Then access victim's transactions, activities, and transfer funds

-- =============================================================================
-- FIX 1: connected_accounts - Restrict to child accounts only
-- =============================================================================

-- Drop the overly permissive policy that allowed ANY authenticated user full access
DROP POLICY IF EXISTS "allow_connected_accounts_all" ON connected_accounts;

-- SELECT: Users can see connections where they are parent OR child
CREATE POLICY "Users can view own connections" ON connected_accounts
  FOR SELECT USING (
    auth.uid() = primary_user_id OR 
    auth.uid() = connected_user_id
  );

-- INSERT: Only service_role can create connections
-- Child account creation happens server-side via /api/child-account
CREATE POLICY "Only service role can create connections" ON connected_accounts
  FOR INSERT TO service_role
  WITH CHECK (true);

-- UPDATE: Only service_role can update connections (not currently used)
CREATE POLICY "Only service role can update connections" ON connected_accounts
  FOR UPDATE TO service_role
  USING (true);

-- DELETE: Primary user can disconnect their children
CREATE POLICY "Primary user can delete own connections" ON connected_accounts
  FOR DELETE USING (auth.uid() = primary_user_id);


-- =============================================================================
-- FIX 2: posts - Remove overly permissive UPDATE clause
-- =============================================================================

-- Drop the problematic policy that contained (auth.uid() IS NOT NULL)
-- This clause allowed ANY authenticated user to update ANY post
DROP POLICY IF EXISTS "Post creators, connected accounts, group admins, and fix submit" ON posts;

-- Recreate with proper restrictions
-- Allowed updates:
--   1. Post owner (user_id = auth.uid())
--   2. Parent of post owner via connected_accounts
--   3. Group admin for posts in their group
--   4. Anonymous fix submissions (handled by separate policy)
CREATE POLICY "Post owners and authorized users can update posts" ON posts
  FOR UPDATE USING (
    -- Post owner
    (user_id = auth.uid()) 
    OR 
    -- Parent of child account that owns the post
    (EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.primary_user_id = auth.uid()
      AND connected_accounts.connected_user_id = posts.user_id
    ))
    OR
    -- Group admin for posts in their group
    (
      group_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = posts.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.role = 'admin'
        AND group_members.status = 'approved'
      )
    )
  );

-- Note: The "Anyone can submit a fix on an open post" policy already handles
-- anonymous and authenticated users submitting fixes correctly:
--   USING: (fixed = false) AND (under_review = false)
--   WITH CHECK: (under_review = true) AND (submitted_fix_by_id matches caller)


-- =============================================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- =============================================================================

-- Check connected_accounts policies:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'connected_accounts';

-- Check posts UPDATE policies:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'posts' AND cmd = 'UPDATE';

-- Test: Attempt to insert a connected_account as regular user (should fail):
-- INSERT INTO connected_accounts (primary_user_id, connected_user_id) 
-- VALUES ('attacker-id', 'victim-id');

