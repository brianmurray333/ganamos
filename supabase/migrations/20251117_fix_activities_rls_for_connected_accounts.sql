-- Fix RLS policies for activities table to support connected accounts
-- This allows child accounts to create and view their own activities

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own activities" ON activities;
DROP POLICY IF EXISTS "Users can create their own activities" ON activities;

-- Recreate SELECT policy: Users can view their own activities
-- OR activities of their connected accounts (if they're the primary user)
CREATE POLICY "Users can view their own activities" ON activities
  FOR SELECT USING (
    user_id = auth.uid()
    OR 
    -- Allow primary users to see connected account activities
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.primary_user_id = auth.uid()
      AND connected_accounts.connected_user_id = user_id
    )
  );

-- Recreate INSERT policy: Users can create their own activities
-- OR create activities for their connected accounts (if they're the primary user)
CREATE POLICY "Users can create their own activities" ON activities
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR
    -- Allow primary users to create activities for connected accounts
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.primary_user_id = auth.uid()
      AND connected_accounts.connected_user_id = user_id
    )
  );

