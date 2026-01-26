-- Fix RLS policies to allow child account creation
-- This allows parents to create profiles for their children

-- First, let's check what policies currently exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'profiles';

-- Drop the existing insert policy that's too restrictive
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;

-- Create a new insert policy that allows child account creation
CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT WITH CHECK (
    -- Users can create their own profile
    auth.uid() = id
    OR
    -- Users can create child account profiles (where the child's email follows the pattern)
    (id != auth.uid() AND email LIKE 'child-%@ganamos.app')
  );

-- Verify the updated policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'profiles';