-- Operator credits/debits that reconcile the app's ledger with the Lightning node.
--
-- The node balance is the source of truth. Sats that reached the node without
-- belonging to any user or post (the operator topping up the node, house fees,
-- routing-fee losses) have no row anywhere else, so the daily summary's app
-- balance can't match the node. Each row here records one such amount
-- (positive = node holds more than the app owes, e.g. operator overfunding),
-- and the daily summary adds the sum to the app balance.
--
-- Server-only: RLS on with no policies, and no grants to browser roles.

CREATE TABLE IF NOT EXISTS node_balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount BIGINT NOT NULL CHECK (amount <> 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE node_balance_adjustments IS
  'Operator credits (+) / debits (-) reconciling app balance with the node balance. Server-only.';

ALTER TABLE node_balance_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON node_balance_adjustments FROM PUBLIC, anon, authenticated;
GRANT ALL ON node_balance_adjustments TO service_role;
