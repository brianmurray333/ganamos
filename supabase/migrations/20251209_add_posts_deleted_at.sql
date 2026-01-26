-- Add deleted_at column to posts table for soft deletes
-- This allows posters to delete/close their posts while preserving data for audit

ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for filtering out deleted posts in queries
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);

-- Add comment for documentation
COMMENT ON COLUMN posts.deleted_at IS 'Timestamp when the post was soft-deleted by the poster. NULL means the post is active.';

