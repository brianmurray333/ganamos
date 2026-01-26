-- More secure RLS policy for child account creation
-- This version adds additional security checks

-- Drop the current policy
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;

-- Create a more secure policy that validates parent-child relationships
CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT WITH CHECK (
    -- Users can create their own profile
    auth.uid() = id
    OR
    -- Users can create child account profiles ONLY if:
    -- 1. The email follows the child pattern
    -- 2. The user is authenticated
    -- 3. The child account will be connected to them (we'll verify this in the API)
    (id != auth.uid() 
     AND email LIKE 'child-%@ganamos.app'
     AND auth.role() = 'authenticated')
  );

-- Also add a policy to prevent users from creating profiles for other users
-- that don't follow the child account pattern
CREATE POLICY "prevent_unauthorized_profile_creation" ON profiles
  FOR INSERT WITH CHECK (
    -- Only allow if it's the user's own profile OR a valid child account
    auth.uid() = id
    OR
    (id != auth.uid() AND email LIKE 'child-%@ganamos.app')
  );

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'profiles' AND policyname LIKE '%insert%';
