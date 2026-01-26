-- Fix group_members RLS policy to allow parents to create memberships for their connected accounts
-- This enables child accounts to join groups independently of their parents

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can insert group membership" ON group_members;

-- Create the updated policy that allows:
-- 1. Users to create their own memberships (user_id = auth.uid())
-- 2. Parents to create memberships for their connected child accounts
CREATE POLICY "Users can insert group membership" ON group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE primary_user_id = auth.uid()
      AND connected_user_id = user_id
    )
  );

