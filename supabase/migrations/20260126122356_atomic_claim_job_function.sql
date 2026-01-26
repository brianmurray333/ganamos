-- Migration: Atomic claim job function
-- Create atomic function to claim/complete a job
-- This ensures only one user can claim a job at a time, preventing race conditions
-- The conditional UPDATE itself is atomic - no FOR UPDATE lock needed

CREATE OR REPLACE FUNCTION atomic_claim_job(
  p_job_id UUID,
  p_fixer_id TEXT,
  p_fixer_name TEXT,
  p_fixer_avatar TEXT,
  p_fix_note TEXT DEFAULT NULL,
  p_fix_image_url TEXT DEFAULT NULL,
  p_lightning_address TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_updated_rows INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate inputs
  IF p_job_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Job ID is required'
    );
  END IF;

  -- Atomic UPDATE: Only succeeds if job is still open
  -- The WHERE clause ensures only one concurrent request can win
  UPDATE posts
  SET 
    under_review = true,
    submitted_fix_by_id = p_fixer_id,
    submitted_fix_by_name = p_fixer_name,
    submitted_fix_by_avatar = p_fixer_avatar,
    submitted_fix_at = v_now,
    submitted_fix_note = p_fix_note,
    submitted_fix_image_url = p_fix_image_url,
    submitted_fix_lightning_address = p_lightning_address
  WHERE 
    id = p_job_id
    AND under_review = false
    AND claimed = false
    AND fixed = false
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- Check if update succeeded
  IF v_updated_rows = 0 THEN
    -- Job wasn't updated - check why
    PERFORM 1 FROM posts WHERE id = p_job_id;
    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Job not found'
      );
    END IF;

    -- Job exists but wasn't eligible - it's already claimed/fixed/under_review/deleted
    RETURN json_build_object(
      'success', false,
      'error', 'Job is no longer available',
      'reason', 'already_claimed'
    );
  END IF;

  -- Success
  RETURN json_build_object(
    'success', true,
    'job_id', p_job_id,
    'submitted_at', v_now
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$func$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION atomic_claim_job IS 
  'Atomically claims a job for a fixer. Returns success=false if job is already claimed, under review, fixed, or deleted. The conditional UPDATE ensures only one user wins in a race condition.';
