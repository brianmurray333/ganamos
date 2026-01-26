-- Check RLS policies on activities table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'activities';

-- Check if RLS is enabled on activities table
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'activities';
