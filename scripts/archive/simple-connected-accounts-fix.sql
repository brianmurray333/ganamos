-- Simple fix for connected_accounts RLS - allow all authenticated users to manage connections

-- Disable RLS temporarily to clear any conflicting policies
ALTER TABLE connected_accounts DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start completely fresh
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'connected_accounts'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON connected_accounts';
    END LOOP;
END $$;

-- Create simple, permissive policies
CREATE POLICY "allow_connected_accounts_all" ON connected_accounts
  FOR ALL USING (
    auth.role() = 'authenticated'
  ) WITH CHECK (
    auth.role() = 'authenticated'
  );

-- Re-enable RLS
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'connected_accounts';
