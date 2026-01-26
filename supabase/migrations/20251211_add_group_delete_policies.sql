-- Add DELETE policies for groups and group_members tables
-- These are needed to allow group admins to delete groups and remove members

-- =============================================================================
-- Group Members DELETE Policy
-- =============================================================================
-- Allow group admins to remove members from their groups
-- Also allow users to leave groups themselves (delete their own membership)

DROP POLICY IF EXISTS "Group admins can delete memberships" ON group_members;

CREATE POLICY "Group admins can delete memberships" ON group_members
  FOR DELETE USING (
    -- Users can delete their own membership (leave a group)
    user_id = auth.uid() OR
    -- Group admins can delete any membership in their group
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = group_members.group_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'admin'
          AND gm.status = 'approved'
        )
      )
    ) OR
    -- Parents can manage connected child account memberships
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE primary_user_id = auth.uid()
      AND connected_user_id = group_members.user_id
    )
  );

-- =============================================================================
-- Groups DELETE Policy
-- =============================================================================
-- Only the group creator or admins can delete the group

DROP POLICY IF EXISTS "Group admins can delete groups" ON groups;

CREATE POLICY "Group admins can delete groups" ON groups
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'admin'
      AND group_members.status = 'approved'
    )
  );

-- =============================================================================
-- Posts UPDATE Policy for Group Admins
-- =============================================================================
-- Allow group admins to update posts in their groups (e.g., to set group_id to null when deleting a group)
-- This extends the existing policy without replacing it
-- Note: The USING clause checks the OLD row, WITH CHECK validates the NEW row

DROP POLICY IF EXISTS "Group admins can disassociate posts" ON posts;

CREATE POLICY "Group admins can disassociate posts" ON posts
  FOR UPDATE USING (
    -- Only allow if the post belongs to a group where the user is admin
    group_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = posts.group_id
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'admin'
      AND group_members.status = 'approved'
    )
  )
  WITH CHECK (
    -- Allow the update - group_id can be set to null or remain the same
    -- This prevents admins from reassigning posts to different groups they don't admin
    group_id IS NULL OR (
      group_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = posts.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.role = 'admin'
        AND group_members.status = 'approved'
      )
    )
  );

