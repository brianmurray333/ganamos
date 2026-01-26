-- Allow group admins to update posts in their groups
-- This enables any group admin to approve/reject fixes for posts in that group,
-- not just the original post creator.
--
-- Use case: In a family group, if Mom posts a job but isn't available,
-- Dad (as a group admin) can approve the fix when a child completes it.
--
-- SECURITY: Group admins can ONLY update fix-related fields, not content fields.
-- This is enforced by the trigger function below.

-- =============================================================================
-- TRIGGER FUNCTION: Restrict group admin updates to fix-related fields only
-- =============================================================================
CREATE OR REPLACE FUNCTION check_group_admin_post_update()
RETURNS TRIGGER AS $$
DECLARE
  is_post_owner BOOLEAN;
  is_connected_account BOOLEAN;
  is_group_admin BOOLEAN;
BEGIN
  -- Check if the current user is the post owner
  is_post_owner := (OLD.user_id = auth.uid());
  
  -- Check if the current user is a connected account (parent) of the post owner
  SELECT EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE primary_user_id = auth.uid()
    AND connected_user_id = OLD.user_id
  ) INTO is_connected_account;
  
  -- If post owner or connected account, allow all updates
  IF is_post_owner OR is_connected_account THEN
    RETURN NEW;
  END IF;
  
  -- Check if the current user is a group admin for this post's group
  IF OLD.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = OLD.group_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
    ) INTO is_group_admin;
    
    IF is_group_admin THEN
      -- Group admins can ONLY update fix-related fields
      -- Ensure content/metadata fields haven't changed
      IF NEW.title IS DISTINCT FROM OLD.title THEN
        RAISE EXCEPTION 'Group admins cannot modify post title';
      END IF;
      IF NEW.description IS DISTINCT FROM OLD.description THEN
        RAISE EXCEPTION 'Group admins cannot modify post description';
      END IF;
      IF NEW.reward IS DISTINCT FROM OLD.reward THEN
        RAISE EXCEPTION 'Group admins cannot modify post reward';
      END IF;
      IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
        RAISE EXCEPTION 'Group admins cannot modify post image';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Group admins cannot modify post owner';
      END IF;
      IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
        RAISE EXCEPTION 'Group admins cannot modify post group';
      END IF;
      IF NEW.location IS DISTINCT FROM OLD.location THEN
        RAISE EXCEPTION 'Group admins cannot modify post location';
      END IF;
      IF NEW.latitude IS DISTINCT FROM OLD.latitude THEN
        RAISE EXCEPTION 'Group admins cannot modify post latitude';
      END IF;
      IF NEW.longitude IS DISTINCT FROM OLD.longitude THEN
        RAISE EXCEPTION 'Group admins cannot modify post longitude';
      END IF;
      IF NEW.city IS DISTINCT FROM OLD.city THEN
        RAISE EXCEPTION 'Group admins cannot modify post city';
      END IF;
      
      -- All content fields are unchanged, allow the fix-related update
      RETURN NEW;
    END IF;
  END IF;
  
  -- If we get here, the update was allowed by RLS but user is neither owner,
  -- connected account, nor group admin. This shouldn't happen, but deny just in case.
  RAISE EXCEPTION 'Unauthorized post update';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS enforce_group_admin_post_update ON posts;

CREATE TRIGGER enforce_group_admin_post_update
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION check_group_admin_post_update();

-- =============================================================================
-- RLS POLICY: Allow group admins to update posts in their groups
-- =============================================================================
-- Drop the existing UPDATE policy and recreate with group admin support
DROP POLICY IF EXISTS "Post creators and connected accounts can update posts" ON posts;

CREATE POLICY "Post creators, connected accounts, and group admins can update posts" ON posts
  FOR UPDATE USING (
    -- Original poster can update their own posts
    user_id = auth.uid()
    OR
    -- Connected accounts (parents) can update posts for their children
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.primary_user_id = auth.uid()
      AND connected_accounts.connected_user_id = user_id
    )
    OR
    -- Group admins can update posts in their groups (trigger restricts to fix fields only)
    (
      group_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = posts.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.role = 'admin'
        AND group_members.status = 'approved'
      )
    )
  );

COMMENT ON POLICY "Post creators, connected accounts, and group admins can update posts" ON posts IS 
  'Allows users to update their own posts, posts for connected child accounts, or posts in groups where they are an admin. Group admins are restricted by trigger to only modify fix-related fields.';
