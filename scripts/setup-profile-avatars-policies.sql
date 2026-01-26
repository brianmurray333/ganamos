-- Set up RLS policies for profile-avatars bucket
-- Run this in your Supabase SQL editor

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can view profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile avatars" ON storage.objects;

-- Create policies for profile avatars
CREATE POLICY "Anyone can view profile avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-avatars');

CREATE POLICY "Authenticated users can upload profile avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-avatars' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can update their own profile avatars" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-avatars' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete their own profile avatars" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-avatars' AND
    auth.uid() IS NOT NULL
  );

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects' 
  AND policyname LIKE '%profile avatars%'
ORDER BY policyname;

