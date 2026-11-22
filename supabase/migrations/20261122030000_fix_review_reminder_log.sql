-- Review reminder limits counted from a server-only log (Codex P1 on #162).
--
-- 20261122020000 kept the counters on posts and reset them when
-- submitted_fix_at changed. Group admins can edit any column of posts in
-- their group, so an admin who submitted a fix could rewrite submitted_fix_at
-- or the counters and send unlimited reminders. Count from an append-only log
-- no user can write instead:
--   * not until 1 hour after the fix was submitted,
--   * at most one per 24 hours per post and submitter,
--   * at most 3 per post and submitter in any 30 days.
-- The posts columns stay as a display copy (written only by this function).

CREATE TABLE IF NOT EXISTS public.fix_review_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  -- The submitter the reminder was for (the parent may have sent it)
  submitter_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fix_review_reminders_post_submitter_idx
  ON public.fix_review_reminders (post_id, submitter_id, created_at DESC);

-- No policies: RLS on with none means user sessions can't read or write it.
ALTER TABLE public.fix_review_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fix_review_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fix_review_reminders TO service_role;

-- Not used any more (the log identifies reminders by time, not submission)
ALTER TABLE posts DROP COLUMN IF EXISTS review_reminder_for;

CREATE OR REPLACE FUNCTION public.record_fix_review_reminder(p_post_id UUID, p_sender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_submitted TIMESTAMPTZ;
  v_recent INTEGER;
  v_last TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  -- Row lock serializes concurrent requests for the same post
  SELECT * INTO v_post FROM posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_post.deleted_at IS NOT NULL OR v_post.fixed
     OR NOT COALESCE(v_post.under_review, FALSE) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_pending');
  END IF;
  IF p_sender_id IS NULL OR v_post.submitted_fix_by_id IS DISTINCT FROM p_sender_id::text THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_submitter');
  END IF;

  SELECT COUNT(*), MAX(created_at) INTO v_recent, v_last
  FROM fix_review_reminders
  WHERE post_id = p_post_id AND submitter_id = p_sender_id
    AND created_at > v_now - INTERVAL '30 days';

  IF v_recent >= 3 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'limit_reached', 'count', v_recent);
  END IF;

  -- submitted_fix_at is stored as UTC without a zone. It only ever delays
  -- the first reminder, so a rewritten (earlier) value gains nothing beyond
  -- the 24h / 3-per-30-days limits above.
  v_submitted := COALESCE(v_post.submitted_fix_at AT TIME ZONE 'UTC', v_now);
  v_next := GREATEST(v_submitted + INTERVAL '1 hour', v_last + INTERVAL '24 hours');
  IF v_next > v_now THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'too_soon', 'next_allowed_at', v_next, 'count', v_recent);
  END IF;

  INSERT INTO fix_review_reminders (post_id, submitter_id, created_at) VALUES (p_post_id, p_sender_id, v_now);

  -- Display copy for the app (reviewer toasts, the fixer's Remind button)
  UPDATE posts SET review_reminder_count = v_recent + 1, review_reminder_last_at = v_now WHERE id = p_post_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'count', v_recent + 1,
    'remaining', 3 - (v_recent + 1),
    'next_allowed_at', CASE WHEN v_recent + 1 < 3 THEN v_now + INTERVAL '24 hours' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_fix_review_reminder(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_fix_review_reminder(UUID, UUID) TO service_role;
