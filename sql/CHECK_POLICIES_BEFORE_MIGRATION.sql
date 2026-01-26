-- Check existing UPDATE policies on posts table before running migrations
-- Run this in production first to see what policies actually exist

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
WHERE tablename = 'posts' 
  AND cmd = 'UPDATE'
ORDER BY policyname;

-- Also check if there are any policies with similar names that might be truncated
SELECT 
  policyname,
  LENGTH(policyname) as name_length,
  LEFT(policyname, 50) as first_50_chars
FROM pg_policies 
WHERE tablename = 'posts' 
  AND cmd = 'UPDATE'
  AND policyname LIKE '%update%'
ORDER BY policyname;


