-- Check current RLS policies on activities table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'activities';

-- Create RLS policy to allow users to read their own activities
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view their own activities" ON activities;
DROP POLICY IF EXISTS "activities_select_policy" ON activities;

-- Create new policy that allows users to view their own activities
CREATE POLICY "Users can view their own activities" ON activities
  FOR SELECT USING (
    auth.uid() = user_id
  );

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'activities';
