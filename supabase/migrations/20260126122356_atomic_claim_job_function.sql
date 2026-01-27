-- Atomic claim job function with AI parameters
-- Ensures only one user can claim a job at a time, preventing race conditions
CREATE OR REPLACE FUNCTION atomic_claim_job(
  p_job_id UUID,
  p_fixer_id TEXT,
  p_fixer_name TEXT,
  p_fixer_avatar TEXT,
  p_fix_note TEXT DEFAULT NULL,
  p_fix_image_url TEXT DEFAULT NULL,
  p_lightning_address TEXT DEFAULT NULL,
  p_ai_confidence NUMERIC DEFAULT NULL,
  p_ai_analysis TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_rows INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_job_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Job ID is required'
    );
  END IF;

  UPDATE posts
  SET 
    under_review = true,
    submitted_fix_by_id = p_fixer_id,
    submitted_fix_by_name = p_fixer_name,
    submitted_fix_by_avatar = p_fixer_avatar,
    submitted_fix_at = v_now,
    submitted_fix_note = p_fix_note,
    submitted_fix_image_url = p_fix_image_url,
    submitted_fix_lightning_address = p_lightning_address,
    ai_confidence_score = p_ai_confidence,
    ai_analysis = p_ai_analysis,
    fixed = false,
    fixed_by_is_anonymous = false
  WHERE 
    id = p_job_id
    AND under_review = false
    AND claimed = false
    AND fixed = false
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    PERFORM 1 FROM posts WHERE id = p_job_id;
    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Job not found'
      );
    END IF;

    RETURN json_build_object(
      'success', false,
      'error', 'Job is no longer available',
      'reason', 'already_claimed'
    );
  END IF;

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
$$;
