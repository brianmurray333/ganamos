-- post_reward_is_funded: accept post_funding_overrides only for legacy posts
-- (owned, created before funding links, with no funding link), matching
-- isPostRewardFunded in lib/payouts.ts. Overrides are an admin's vouching
-- for old posts, not a way to fund new ones.

CREATE OR REPLACE FUNCTION public.post_reward_is_funded(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_created TIMESTAMPTZ;
BEGIN
  SELECT id, user_id, reward, original_reward, created_at, funding_transaction_id, funding_status, funding_r_hash
    INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_post.reward IS NULL OR v_post.reward <= 0 THEN RETURN TRUE; END IF;

  IF v_post.user_id IS NULL THEN
    RETURN v_post.funding_status = 'paid' AND v_post.funding_r_hash IS NOT NULL;
  END IF;

  IF v_post.funding_transaction_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = v_post.funding_transaction_id AND t.user_id = v_post.user_id
        AND t.type = 'internal' AND t.status = 'completed' AND t.amount < 0
    );
  END IF;

  -- Legacy posts (before funding links): an unlinked deduction of the reward
  -- by the owner within 2 minutes of creation.
  v_created := v_post.created_at;
  IF v_created IS NULL OR v_created >= TIMESTAMPTZ '2026-11-08 00:00:00+00' THEN RETURN FALSE; END IF;

  -- Admin-approved funding for legacy posts (post_funding_overrides, server-only)
  IF EXISTS (SELECT 1 FROM post_funding_overrides o WHERE o.post_id = p_post_id AND o.amount >= v_post.reward) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.user_id = v_post.user_id AND t.type = 'internal' AND t.status = 'completed'
      AND t.amount IN (-v_post.reward, -COALESCE(NULLIF(v_post.original_reward, 0), v_post.reward))
      AND t.created_at BETWEEN v_created - INTERVAL '2 minutes' AND v_created + INTERVAL '2 minutes'
      AND NOT EXISTS (SELECT 1 FROM posts p2 WHERE p2.funding_transaction_id = t.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_reward_is_funded(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_reward_is_funded(UUID) TO service_role;
