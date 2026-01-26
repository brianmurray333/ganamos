-- Migration: Add fraud detection infrastructure
-- Created: 2026-01-20
-- Description: Adds fraud detection columns to posts table and creates supporting tables for image verification

-- Add fraud detection columns to posts table
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS fraud_check_flags JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exif_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exif_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_forensics_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS image_hash_before TEXT,
  ADD COLUMN IF NOT EXISTS image_hash_after TEXT,
  ADD COLUMN IF NOT EXISTS requires_manual_review BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fraud_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS fraud_review_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS random_sampled BOOLEAN DEFAULT FALSE;

-- Create image_hashes table for duplicate detection
CREATE TABLE IF NOT EXISTS image_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_hash TEXT NOT NULL,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL CHECK (image_type IN ('before', 'after', 'submitted_fix')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on image_hash for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_image_hashes_hash ON image_hashes(image_hash);
CREATE INDEX IF NOT EXISTS idx_image_hashes_post_id ON image_hashes(post_id);

-- Create fraud_queue table for async fraud checking
CREATE TABLE IF NOT EXISTS fraud_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('before', 'after', 'submitted_fix')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Create indexes for fraud_queue
CREATE INDEX IF NOT EXISTS idx_fraud_queue_status ON fraud_queue(status);
CREATE INDEX IF NOT EXISTS idx_fraud_queue_post_id ON fraud_queue(post_id);
CREATE INDEX IF NOT EXISTS idx_fraud_queue_created_at ON fraud_queue(created_at);

-- Create submission_rate_limits table for rate limiting and abuse prevention
CREATE TABLE IF NOT EXISTS submission_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  submission_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flagged BOOLEAN DEFAULT FALSE,
  flagged_at TIMESTAMPTZ
);

-- Create indexes for submission_rate_limits
CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_user_id ON submission_rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_ip_address ON submission_rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_window_start ON submission_rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_flagged ON submission_rate_limits(flagged) WHERE flagged = TRUE;

-- Add comment for fraud_review_status values
COMMENT ON COLUMN posts.fraud_review_status IS 'Status of fraud review: pending, approved, rejected, flagged';
COMMENT ON COLUMN posts.fraud_check_flags IS 'JSON object containing various fraud check flags and metadata';
COMMENT ON COLUMN posts.exif_data IS 'EXIF metadata extracted from uploaded images';
COMMENT ON COLUMN posts.ai_forensics_score IS 'AI-based image forensics score (0.0-1.0, higher = more likely manipulated)';

-- Enable RLS on new tables
ALTER TABLE image_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for image_hashes
-- Admin can view all
CREATE POLICY "Admins can view all image hashes"
  ON image_hashes FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'admin@example.com'
    )
  );

-- Service role can manage all
CREATE POLICY "Service role can manage image hashes"
  ON image_hashes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for fraud_queue
-- Admin can view all
CREATE POLICY "Admins can view all fraud queue items"
  ON fraud_queue FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'admin@example.com'
    )
  );

-- Service role can manage all
CREATE POLICY "Service role can manage fraud queue"
  ON fraud_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for submission_rate_limits
-- Admin can view all
CREATE POLICY "Admins can view all rate limits"
  ON submission_rate_limits FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'admin@example.com'
    )
  );

-- Users can view their own rate limit records
CREATE POLICY "Users can view own rate limits"
  ON submission_rate_limits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can manage all
CREATE POLICY "Service role can manage rate limits"
  ON submission_rate_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
