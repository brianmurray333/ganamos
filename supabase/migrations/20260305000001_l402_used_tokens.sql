CREATE TABLE IF NOT EXISTS l402_used_tokens (
  payment_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
