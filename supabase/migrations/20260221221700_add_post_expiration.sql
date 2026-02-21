-- Add expiration columns to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ NULL;

-- Index for efficient cron scanning
CREATE INDEX IF NOT EXISTS idx_posts_expires_at ON posts(expires_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN posts.expires_at IS 'Optional timestamp after which the post is automatically taken down and sats refunded. NULL means the post persists indefinitely.';
COMMENT ON COLUMN posts.expiry_warning_sent_at IS 'Set when a 6-hour warning email has been sent to the poster to prevent duplicate emails.';
