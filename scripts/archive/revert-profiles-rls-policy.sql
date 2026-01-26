-- Temporarily revert profiles RLS policies to restore connected accounts functionality

-- Drop the restrictive policies we just created
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;

-- Create more permissive policies that allow connected accounts to work
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true); -- Temporarily allow all reads

CREATE POLICY "Users can update their own profile and connected accounts" ON profiles
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
  );

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
  );

-- Keep RLS enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
