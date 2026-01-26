-- Add rejection tracking columns to devices table
-- Used to notify the Arduino when a submitted fix is rejected

-- Add last_rejection_id column - stores the ID of the last rejected fix
-- This is used by the device to detect new rejections and show a notification
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_rejection_id UUID;

-- Add rejection_message column - stores a short message to display on rejection
ALTER TABLE devices ADD COLUMN IF NOT EXISTS rejection_message VARCHAR(100);

-- Add index for efficient querying (optional, but useful for admin dashboards)
CREATE INDEX IF NOT EXISTS idx_devices_last_rejection_id ON devices(last_rejection_id);

-- Add comments for documentation
COMMENT ON COLUMN devices.last_rejection_id IS 'UUID of the last rejected fix. Device polls this to detect new rejections.';
COMMENT ON COLUMN devices.rejection_message IS 'Short message to display on the device when a fix is rejected (max 100 chars).';
