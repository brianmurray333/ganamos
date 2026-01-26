-- Allow any authenticated user to submit fixes for review
-- This enables users to submit fixes for posts they don't own
--
-- SECURITY: Users can ONLY update fix-submission fields when submitting a fix,
-- not content fields. This is enforced by the trigger function below.

-- =============================================================================
-- TRIGGER FUNCTION: Allow fix submissions from any authenticated user
-- =============================================================================
CREATE OR REPLACE FUNCTION check_group_admin_post_update()
RETURNS TRIGGER AS $$
DECLARE
  is_post_owner BOOLEAN;
  is_connected_account BOOLEAN;
  is_group_admin BOOLEAN;
  is_fix_submission BOOLEAN;
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
  
  -- Check if this is a fix submission (authenticated or anonymous user submitting a fix for review)
  -- A fix submission only updates fix-submission fields and doesn't change content fields
  is_fix_submission := (
    -- Security: For authenticated users, submitted_fix_by_id must match auth.uid()
    -- For anonymous users, submitted_fix_by_id must be NULL
    (
      (auth.uid() IS NOT NULL AND (NEW.submitted_fix_by_id IS NULL OR NEW.submitted_fix_by_id = auth.uid()::text))
      OR
      (auth.uid() IS NULL AND NEW.submitted_fix_by_id IS NULL)
    )
    -- Only fix-submission fields are being changed (or set to false/unchanged)
    AND (NEW.title IS NOT DISTINCT FROM OLD.title)
    AND (NEW.description IS NOT DISTINCT FROM OLD.description)
    AND (NEW.reward IS NOT DISTINCT FROM OLD.reward)
    AND (NEW.image_url IS NOT DISTINCT FROM OLD.image_url)
    AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
    AND (NEW.group_id IS NOT DISTINCT FROM OLD.group_id)
    AND (NEW.location IS NOT DISTINCT FROM OLD.location)
    AND (NEW.latitude IS NOT DISTINCT FROM OLD.latitude)
    AND (NEW.longitude IS NOT DISTINCT FROM OLD.longitude)
    AND (NEW.city IS NOT DISTINCT FROM OLD.city)
    -- Cannot mark as fixed (only post owner/admin can do that)
    AND (NEW.fixed IS NOT DISTINCT FROM OLD.fixed OR NEW.fixed = false)
    -- Cannot change fixed_by unless it's being cleared or set to false
    AND (NEW.fixed_by IS NOT DISTINCT FROM OLD.fixed_by OR NEW.fixed_by IS NULL)
    -- Cannot change fixed_at unless it's being cleared
    AND (NEW.fixed_at IS NOT DISTINCT FROM OLD.fixed_at OR NEW.fixed_at IS NULL)
    -- Cannot change fixed_image_url unless it's being cleared
    AND (NEW.fixed_image_url IS NOT DISTINCT FROM OLD.fixed_image_url OR NEW.fixed_image_url IS NULL)
    -- Cannot change fixer_note unless it's being cleared
    AND (NEW.fixer_note IS NOT DISTINCT FROM OLD.fixer_note OR NEW.fixer_note IS NULL)
    -- At least one fix-submission field is being set
    AND (
      NEW.under_review IS DISTINCT FROM OLD.under_review
      OR NEW.submitted_fix_by_id IS DISTINCT FROM OLD.submitted_fix_by_id
      OR NEW.submitted_fix_by_name IS DISTINCT FROM OLD.submitted_fix_by_name
      OR NEW.submitted_fix_by_avatar IS DISTINCT FROM OLD.submitted_fix_by_avatar
      OR NEW.submitted_fix_at IS DISTINCT FROM OLD.submitted_fix_at
      OR NEW.submitted_fix_image_url IS DISTINCT FROM OLD.submitted_fix_image_url
      OR NEW.submitted_fix_note IS DISTINCT FROM OLD.submitted_fix_note
      OR NEW.submitted_fix_lightning_address IS DISTINCT FROM OLD.submitted_fix_lightning_address
      OR NEW.ai_confidence_score IS DISTINCT FROM OLD.ai_confidence_score
      OR NEW.ai_analysis IS DISTINCT FROM OLD.ai_analysis
    )
  );
  
  IF is_fix_submission THEN
    -- Allow the fix submission
    RETURN NEW;
  END IF;
  
  -- If we get here, the update was allowed by RLS but user is neither owner,
  -- connected account, group admin, nor submitting a fix. Deny the update.
  RAISE EXCEPTION 'Unauthorized post update';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- RLS POLICY: Allow authenticated and anonymous users to submit fixes
-- =============================================================================
-- Drop the existing UPDATE policy and recreate to allow fix submissions
-- Policy name in production is truncated: "Post creators, connected accounts, and group admins can update "
DROP POLICY IF EXISTS "Post creators, connected accounts, and group admins can update " ON posts;

CREATE POLICY "Post creators, connected accounts, group admins, and fix submitters can update posts" ON posts
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
    OR
    -- Any authenticated user can update posts (trigger restricts to fix submissions only)
    auth.uid() IS NOT NULL
    OR
    -- Anonymous users can submit fixes (trigger restricts to fix submissions with submitted_fix_by_id = NULL)
    -- This allows truly unauthenticated users to submit fixes
    (auth.uid() IS NULL AND fixed = false AND under_review = false)
  );

COMMENT ON POLICY "Post creators, connected accounts, group admins, and fix submitters can update posts" ON posts IS 
  'Allows users to update their own posts, posts for connected child accounts, posts in groups where they are an admin, or submit fixes for any post. The trigger enforces that non-owners can only update fix-submission fields.';

-- =============================================================================
-- Update existing "Anyone can submit a fix on an open post" policy to allow anonymous users
-- =============================================================================
-- Update the existing policy to allow anonymous users (auth.uid() IS NULL) to submit fixes
DROP POLICY IF EXISTS "Anyone can submit a fix on an open post" ON posts;

CREATE POLICY "Anyone can submit a fix on an open post" ON posts
  FOR UPDATE USING (
    -- Post must be open (not fixed, not under review)
    fixed = false 
    AND under_review = false
  )
  WITH CHECK (
    -- When submitting, must set under_review to true
    under_review = true
    -- Authenticated users must submit as themselves
    -- Anonymous users must have submitted_fix_by_id = NULL
    AND (
      (auth.uid() IS NOT NULL AND submitted_fix_by_id = auth.uid()::text)
      OR
      (auth.uid() IS NULL AND submitted_fix_by_id IS NULL)
    )
  );

COMMENT ON POLICY "Anyone can submit a fix on an open post" ON posts IS 
  'Allows authenticated and anonymous users to submit fixes for open posts. Authenticated users must submit as themselves. Anonymous users must have submitted_fix_by_id = NULL.';

-- =============================================================================
-- Update trigger to allow anonymous users to set Lightning address
-- =============================================================================
-- The trigger already allows fix submissions, which includes setting submitted_fix_lightning_address
-- We just need to ensure the field is included in the fix-submission check
-- (It's already covered since we check that only fix-submission fields are changed)

