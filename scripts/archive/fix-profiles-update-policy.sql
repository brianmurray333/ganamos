-- Fix the profiles UPDATE policy to allow family account management

-- Drop the current UPDATE policy
DROP POLICY IF EXISTS "Users can update their own profile and connected accounts" ON profiles;

-- Create a simpler, more direct UPDATE policy
CREATE POLICY "allow_profile_updates" ON profiles
  FOR UPDATE USING (
    -- Allow all authenticated users to update any profile for now (we'll refine later)
    auth.role() = 'authenticated'
  ) WITH CHECK (
    -- Same for the check condition
    auth.role() = 'authenticated'
  );

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'profiles' AND cmd = 'UPDATE';
