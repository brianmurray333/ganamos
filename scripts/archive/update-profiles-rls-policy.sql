-- Update RLS policies for profiles table to allow family account management

-- First, let's check what policies currently exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'profiles';

-- Drop ALL existing policies to start fresh
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON profiles';
    END LOOP;
END $$;

-- Create comprehensive policies that allow family account management
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (
    -- Users can view their own profile
    auth.uid() = id
    OR
    -- Primary users can view their connected accounts
    EXISTS (
      SELECT 1 FROM connected_accounts 
      WHERE primary_user_id = auth.uid() 
      AND connected_user_id = id
    )
  );

CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE USING (
    -- Users can update their own profile
    auth.uid() = id
    OR
    -- Primary users can update their connected accounts
    EXISTS (
      SELECT 1 FROM connected_accounts 
      WHERE primary_user_id = auth.uid() 
      AND connected_user_id = id
    )
  ) WITH CHECK (
    -- Same conditions for the updated data
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM connected_accounts 
      WHERE primary_user_id = auth.uid() 
      AND connected_user_id = id
    )
  );

CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
  );

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'profiles';
