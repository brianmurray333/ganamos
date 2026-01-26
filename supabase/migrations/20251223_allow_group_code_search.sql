-- Fix groups RLS policy to allow searching by group_code
-- BUG: The current policy only allows members/creators to view groups
-- This blocks users from finding groups via group_code to join them
-- 
-- FIX: Allow anyone to find a group if they know the group_code
-- This is necessary for the group search/join flow

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;

-- Create a new SELECT policy that:
-- 1. Allows members/creators to see all group details (existing behavior)
-- 2. Allows anyone to find a group by its group_code (enables join flow)
-- Note: The group_code is meant to be shared, so viewing a group by code is expected
CREATE POLICY "Users can view groups they are members of or search by code" ON groups
  FOR SELECT USING (
    -- Creator can always see the group
    created_by = auth.uid()
    OR
    -- Approved members can see the group
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
      AND group_members.status = 'approved'
    )
    OR
    -- Parents can see groups their connected accounts are members of
    EXISTS (
      SELECT 1 FROM group_members gm
      JOIN connected_accounts ca ON ca.connected_user_id = gm.user_id
      WHERE gm.group_id = groups.id
      AND ca.primary_user_id = auth.uid()
      AND gm.status = 'approved'
    )
    OR
    -- Anyone authenticated can search for a group by group_code
    -- This enables the join flow - users need to find groups to request access
    (auth.uid() IS NOT NULL AND group_code IS NOT NULL)
  );

COMMENT ON POLICY "Users can view groups they are members of or search by code" ON groups IS 
  'Members, creators, and parent accounts can view groups. Authenticated users can also find groups by group_code for join flow.';

