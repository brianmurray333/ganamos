-- Add last_jobs_seen_at column to devices table
-- Used to track when device last checked for jobs, enabling "new job" notifications

ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_jobs_seen_at TIMESTAMPTZ;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_devices_last_jobs_seen_at ON devices(last_jobs_seen_at);

COMMENT ON COLUMN devices.last_jobs_seen_at IS 'Timestamp when device last fetched jobs list, used for new job notifications';

