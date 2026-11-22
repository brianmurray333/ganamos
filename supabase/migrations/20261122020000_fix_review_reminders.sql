-- Fixers (or a parent acting for a child fixer) can remind the post's
-- reviewers about a fix waiting for review. The limits are enforced here,
-- atomically, so concurrent requests can't exceed them:
--   * not until the fix has waited 1 hour,
--   * then at most one every 24 hours,
--   * at most 3 per submission.
-- Counters are tied to the submission (submitted_fix_at), so a rejected and
-- resubmitted fix starts fresh. Mirrored for display in lib/review-reminders.ts.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS review_reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_reminder_last_at TIMESTAMPTZ,
  -- The submitted_fix_at the counters refer to
  ADD COLUMN IF NOT EXISTS review_reminder_for TIMESTAMP;

-- Service role only: the server action authenticates the caller and checks
-- they submitted the fix (or are the submitting child's parent) first.
CREATE OR REPLACE FUNCTION public.record_fix_review_reminder(p_post_id UUID, p_sender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_count INTEGER;
  v_now TIMESTAMPTZ := NOW();
  -- submitted_fix_at is stored as UTC without a zone
  v_submitted TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_post FROM posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_post.deleted_at IS NOT NULL OR v_post.fixed
     OR NOT COALESCE(v_post.under_review, FALSE) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_pending');
  END IF;
  IF p_sender_id IS NULL OR v_post.submitted_fix_by_id IS DISTINCT FROM p_sender_id::text THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_submitter');
  END IF;

  v_submitted := COALESCE(v_post.submitted_fix_at AT TIME ZONE 'UTC', v_now);
  -- Clamped: a fixer submits with a direct row update (RLS "Anyone can submit
  -- a fix") and could preset these columns; a negative count must not buy
  -- extra reminders. They can't touch the row again once it's under review.
  v_count := GREATEST(0, CASE WHEN v_post.review_reminder_for IS NOT DISTINCT FROM v_post.submitted_fix_at
                  THEN v_post.review_reminder_count ELSE 0 END);

  IF v_count >= 3 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'limit_reached', 'count', v_count);
  END IF;
  v_next := GREATEST(
    v_submitted + INTERVAL '1 hour',
    CASE WHEN v_count > 0 AND v_post.review_reminder_last_at IS NOT NULL
         THEN v_post.review_reminder_last_at + INTERVAL '24 hours' END
  );
  IF v_next > v_now THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'too_soon', 'next_allowed_at', v_next, 'count', v_count);
  END IF;

  UPDATE posts SET
    review_reminder_count = v_count + 1,
    review_reminder_last_at = v_now,
    review_reminder_for = v_post.submitted_fix_at
  WHERE id = p_post_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'count', v_count + 1,
    'remaining', 3 - (v_count + 1),
    'next_allowed_at', CASE WHEN v_count + 1 < 3 THEN v_now + INTERVAL '24 hours' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_fix_review_reminder(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_fix_review_reminder(UUID, UUID) TO service_role;
