-- Final fix for recursive RLS policy on group_members
-- The issue: Policy calls is_group_member() which queries group_members, causing infinite recursion
-- Solution: Use the SECURITY DEFINER function but ensure it truly bypasses RLS

-- Step 1: Ensure the function is owned by postgres (superuser) to bypass RLS
-- First, check current owner
SELECT 
    p.proname,
    pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
    AND p.proname = 'is_group_member';

-- Step 2: Recreate function ensuring it's properly configured
DROP FUNCTION IF EXISTS public.is_group_member(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
-- Explicitly set the owner context - function will run as creator (should be postgres/superuser)
AS $$
  -- This query will bypass RLS because SECURITY DEFINER functions run with owner's privileges
  SELECT EXISTS (
    SELECT 1 
    FROM group_members 
    WHERE group_id = check_group_id 
      AND user_id = check_user_id 
      AND status = 'approved'
  );
$$;

-- Ensure function owner is postgres (superuser) - run this as superuser
-- ALTER FUNCTION public.is_group_member(UUID, UUID) OWNER TO postgres;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO anon;

-- Step 3: Verify the policy is using the function (it should be, based on your output)
-- The policy should remain as-is, calling is_group_member()
-- But now the function should properly bypass RLS

-- If the above doesn't work, alternative: Simplify the policy to avoid the recursive check
-- DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;
-- 
-- CREATE POLICY "Users can view group members of their groups" ON group_members
--   FOR SELECT 
--   USING (
--     user_id = auth.uid()
--     OR
--     -- Use the SECURITY DEFINER function which should bypass RLS
--     is_group_member(group_id, auth.uid())
--   );

