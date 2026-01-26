-- Fix RLS policies for connected_accounts table to allow family connections

-- Check current policies on connected_accounts table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'connected_accounts';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their connections" ON connected_accounts;
DROP POLICY IF EXISTS "Users can create connections" ON connected_accounts;
DROP POLICY IF EXISTS "Users can update their connections" ON connected_accounts;
DROP POLICY IF EXISTS "Users can delete their connections" ON connected_accounts;

-- Create policies that allow family account connections
CREATE POLICY "connected_accounts_select_policy" ON connected_accounts
  FOR SELECT USING (
    -- Users can view connections where they are the primary user
    auth.uid() = primary_user_id
    OR
    -- Users can view connections where they are the connected user
    auth.uid() = connected_user_id
  );

CREATE POLICY "connected_accounts_insert_policy" ON connected_accounts
  FOR INSERT WITH CHECK (
    -- Users can create connections where they are the primary user
    auth.uid() = primary_user_id
  );

CREATE POLICY "connected_accounts_update_policy" ON connected_accounts
  FOR UPDATE USING (
    -- Users can update connections where they are the primary user
    auth.uid() = primary_user_id
  );

CREATE POLICY "connected_accounts_delete_policy" ON connected_accounts
  FOR DELETE USING (
    -- Users can delete connections where they are the primary user
    auth.uid() = primary_user_id
  );

-- Enable RLS on connected_accounts table
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'connected_accounts';
