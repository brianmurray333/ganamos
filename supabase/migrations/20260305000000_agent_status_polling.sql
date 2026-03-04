-- L402-based agent status polling
-- Store the L402 payment hash and payout invoice on fix submissions
-- so agents can poll for status using their original L402 token as identity.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS submitted_fix_payment_hash TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS submitted_fix_payout_invoice TEXT;
