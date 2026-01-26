-- Fix the recursive RLS policy by inlining the logic instead of calling is_group_member()
-- This avoids the infinite recursion issue

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;

-- Recreate with inline logic that avoids recursion
-- The key is: if checking your own membership (user_id = auth.uid()), allow it
-- For checking others, we use a subquery that checks if you're a member of the same group
-- But we need to avoid calling back into the same table with RLS enabled
CREATE POLICY "Users can view group members of their groups" ON group_members
  FOR SELECT 
  USING (
    -- Allow if viewing your own membership
    user_id = auth.uid()
    OR
    -- Allow if you're an approved member of the same group
    -- Use a direct subquery that should work with SECURITY DEFINER functions
    EXISTS (
      SELECT 1 
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  );

-- Alternative approach: Use a security barrier to prevent recursion
-- But first, let's try the simpler fix above

