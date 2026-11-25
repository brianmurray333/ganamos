-- Satoshi Pet orders: per-order access token, invoice expiry, rate-limit key.
-- Additive and idempotent. Required by the order code in app/actions/pet-order-actions.ts,
-- lib/pet-orders.ts and app/api/cron/reconcile-pet-orders (apply before deploying it).
--
-- 1. access_token: secret for the order page link (/order/SP-XXXXXX?t=<token>).
--    Without it the page shows only order number, status, amount, date, city/state
--    and a masked email. 64 hex chars (two gen_random_uuid() values with dashes
--    removed; gen_random_uuid() uses the server's strong random source). Existing
--    rows are backfilled; new rows get one from the app (and from the default).
-- 2. invoice_expires_at: when the current Lightning invoice expires (1 hour after
--    creation; renewed invoices move it). Existing rows: created_at + 1 hour.
--    The reconcile cron and the payment screen use it.
-- 3. client_ip_hash: keyed hash of the buyer's IP (never the raw IP), used to rate
--    limit order creation per network across server instances.
-- payment_status already allows 'expired' (20251216_add_pet_orders.sql), so no
-- constraint change is needed.

ALTER TABLE pet_orders ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE pet_orders ADD COLUMN IF NOT EXISTS invoice_expires_at TIMESTAMPTZ;
ALTER TABLE pet_orders ADD COLUMN IF NOT EXISTS client_ip_hash TEXT;

UPDATE pet_orders
SET access_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE access_token IS NULL;

ALTER TABLE pet_orders
  ALTER COLUMN access_token SET DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
ALTER TABLE pet_orders ALTER COLUMN access_token SET NOT NULL;

UPDATE pet_orders
SET invoice_expires_at = created_at + interval '1 hour'
WHERE invoice_expires_at IS NULL;

-- Reconcile cron: pending orders by invoice expiry
CREATE INDEX IF NOT EXISTS idx_pet_orders_pending_invoice_expiry
  ON pet_orders (invoice_expires_at)
  WHERE payment_status = 'pending';

-- Order-creation rate limits
CREATE INDEX IF NOT EXISTS idx_pet_orders_email_created_at ON pet_orders (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_orders_client_ip_hash_created_at ON pet_orders (client_ip_hash, created_at DESC);

COMMENT ON COLUMN pet_orders.access_token IS 'Secret for the buyer''s order page link (?t=). Service role only.';
COMMENT ON COLUMN pet_orders.invoice_expires_at IS 'Expiry of the current Lightning invoice (payment_request/payment_hash).';
COMMENT ON COLUMN pet_orders.client_ip_hash IS 'HMAC of the buyer IP for order rate limiting; not the raw IP.';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pet_orders' AND column_name = 'status') THEN
    COMMENT ON COLUMN pet_orders.status IS 'Unused legacy column (20251217_admin_dashboard.sql). The app uses order_status.';
  END IF;
END $$;
