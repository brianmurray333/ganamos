-- Admin-approved funding for legacy posts.
--
-- Posts created before funding links existed (posts.funding_transaction_id)
-- and with no matching ledger deduction can't be paid out or refunded,
-- because the server can't prove the reward was ever reserved. An admin can
-- vouch for such a post by adding a row here; isPostRewardFunded treats the
-- post as funded for the amount recorded.
--
-- Server-only: RLS on with no policies, and no grants to browser roles.

CREATE TABLE IF NOT EXISTS post_funding_overrides (
  post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE post_funding_overrides IS 'Admin-approved funding for legacy posts with no ledger record. Server-only.';

ALTER TABLE post_funding_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON post_funding_overrides FROM anon, authenticated;
