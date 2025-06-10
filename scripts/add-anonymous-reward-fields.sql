-- Add anonymous reward tracking fields to posts table if they don't exist
-- These fields track when anonymous rewards are paid out

DO $$ 
BEGIN
    -- Check if fixed_by_is_anonymous column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'posts' AND column_name = 'fixed_by_is_anonymous') THEN
        ALTER TABLE posts ADD COLUMN fixed_by_is_anonymous BOOLEAN DEFAULT FALSE;
    END IF;

    -- Check if anonymous_reward_paid_at column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'posts' AND column_name = 'anonymous_reward_paid_at') THEN
        ALTER TABLE posts ADD COLUMN anonymous_reward_paid_at TIMESTAMPTZ NULL;
    END IF;

    -- Check if anonymous_reward_payment_hash column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'posts' AND column_name = 'anonymous_reward_payment_hash') THEN
        ALTER TABLE posts ADD COLUMN anonymous_reward_payment_hash TEXT NULL;
    END IF;
END $$;

-- Add index for efficient querying of unclaimed anonymous rewards
CREATE INDEX IF NOT EXISTS idx_posts_anonymous_rewards 
ON posts (fixed_by_is_anonymous, anonymous_reward_paid_at) 
WHERE fixed_by_is_anonymous = TRUE AND anonymous_reward_paid_at IS NULL;

-- Add index for payment hash lookups
CREATE INDEX IF NOT EXISTS idx_posts_payment_hash 
ON posts (anonymous_reward_payment_hash) 
WHERE anonymous_reward_payment_hash IS NOT NULL;
