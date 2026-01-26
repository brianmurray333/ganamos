-- Fix posts RLS policy to allow connected accounts (parents) to create posts for their children
-- This follows the same pattern as activities and group_members RLS fixes

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create posts" ON posts;

-- Create a new INSERT policy that allows:
-- 1. Users to create posts for themselves (user_id = auth.uid())
-- 2. Connected accounts (parents) to create posts for their connected users (children)
CREATE POLICY "Users and connected accounts can create posts" ON posts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- User is creating a post for themselves
      user_id = auth.uid()
      OR
      -- User is a parent creating a post for a connected child account
      EXISTS (
        SELECT 1 FROM connected_accounts
        WHERE connected_accounts.primary_user_id = auth.uid()
        AND connected_accounts.connected_user_id = user_id
      )
    )
  );

-- Also fix the UPDATE policy to allow parents to update posts for their children
DROP POLICY IF EXISTS "Post creators can update their posts" ON posts;

CREATE POLICY "Post creators and connected accounts can update posts" ON posts
  FOR UPDATE USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.primary_user_id = auth.uid()
      AND connected_accounts.connected_user_id = user_id
    )
  );

COMMENT ON POLICY "Users and connected accounts can create posts" ON posts IS 
  'Allows authenticated users to create posts for themselves or their connected child accounts';

COMMENT ON POLICY "Post creators and connected accounts can update posts" ON posts IS 
  'Allows users to update their own posts or posts created for their connected child accounts';

