-- Allow service role to mark posts as fixed for high-confidence AI fixes
-- This is needed because createFixRewardAction uses adminSupabase to update posts
-- when the fixer is not the post owner (RLS would block it)
--
-- SECURITY: Service role can ONLY mark posts as fixed and update fix-related fields,
-- not content fields. This is enforced by the trigger function.

-- =============================================================================
-- TRIGGER FUNCTION: Allow service role fix approvals
-- =============================================================================
CREATE OR REPLACE FUNCTION check_group_admin_post_update()
RETURNS TRIGGER AS $$
DECLARE
  is_post_owner BOOLEAN;
  is_connected_account BOOLEAN;
  is_group_admin BOOLEAN;
  is_fix_submission BOOLEAN;
  is_service_role_fix_approval BOOLEAN;
BEGIN
  -- Allow postgres role (used during seeding and migrations) to bypass all checks
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

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
  
  -- Check if this is a service role fix approval (auth.uid() IS NULL when using service role)
  -- Service role can mark posts as fixed for high-confidence AI fixes
  is_service_role_fix_approval := (
    auth.uid() IS NULL  -- Service role (adminSupabase)
    AND NEW.fixed = true  -- Marking as fixed
    AND (OLD.fixed = false OR OLD.fixed IS NULL)  -- Was not already fixed
    -- Only fix-related fields are being changed
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
    -- At least one fix-related field is being set
    AND (
      NEW.fixed IS DISTINCT FROM OLD.fixed
      OR NEW.fixed_at IS DISTINCT FROM OLD.fixed_at
      OR NEW.fixed_by IS DISTINCT FROM OLD.fixed_by
      OR NEW.fixed_image_url IS DISTINCT FROM OLD.fixed_image_url
      OR NEW.fixer_note IS DISTINCT FROM OLD.fixer_note
      OR NEW.fixed_by_is_anonymous IS DISTINCT FROM OLD.fixed_by_is_anonymous
      OR NEW.under_review IS DISTINCT FROM OLD.under_review
      OR NEW.ai_confidence_score IS DISTINCT FROM OLD.ai_confidence_score
      OR NEW.ai_analysis IS DISTINCT FROM OLD.ai_analysis
    )
  );
  
  IF is_service_role_fix_approval THEN
    -- Allow service role to mark post as fixed (for high-confidence AI fixes)
    RETURN NEW;
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
    -- Cannot mark as fixed (only post owner/admin/service role can do that)
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
  -- connected account, group admin, service role, nor submitting a fix. Deny the update.
  RAISE EXCEPTION 'Unauthorized post update';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_group_admin_post_update() IS 
  'Enforces post update permissions: owners/connected accounts can update all fields, group admins can update fix fields only, service role can mark posts as fixed, and authenticated/anonymous users can submit fixes for review.';
