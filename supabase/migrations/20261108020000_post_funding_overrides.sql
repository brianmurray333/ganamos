-- Server-only record that a post's reward was funded, for posts whose funding
-- can't be proven from the ledger (e.g. legacy posts reconciled by hand).
-- isPostRewardFunded / post_reward_is_funded() accept a row whose amount
-- covers the post's reward.
--
-- This migration was applied to production before it was committed; it is
-- idempotent and matches the production table exactly.

CREATE TABLE IF NOT EXISTS public.post_funding_overrides (
  post_id UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.post_funding_overrides IS
  'Server-only: posts whose reward funding was verified out of band. Browsers have no access.';

-- RLS on with no policies: only service_role (BYPASSRLS) can read or write.
ALTER TABLE public.post_funding_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_funding_overrides FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.post_funding_overrides TO service_role;
