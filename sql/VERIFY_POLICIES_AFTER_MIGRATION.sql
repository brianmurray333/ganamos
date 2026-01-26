-- Verify the new policy was created after migration
-- Check all UPDATE policies on posts table

SELECT 
  policyname,
  LENGTH(policyname) as name_length,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'posts' 
  AND cmd = 'UPDATE'
ORDER BY policyname;

-- Specifically check if the new policy exists (might be truncated)
SELECT 
  policyname,
  CASE 
    WHEN policyname LIKE '%fix submitters%' THEN '✅ NEW POLICY FOUND'
    WHEN policyname LIKE '%fix%' THEN '⚠️  Contains "fix" but not exact match'
    ELSE '❌ Not the new policy'
  END as status
FROM pg_policies 
WHERE tablename = 'posts' 
  AND cmd = 'UPDATE'
ORDER BY policyname;


