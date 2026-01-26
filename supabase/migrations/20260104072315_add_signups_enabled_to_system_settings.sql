-- Add signups_enabled column to system_settings table for emergency signup toggle
-- This allows instant disable/enable of user signups via SQL command (no deployment needed)

-- Add signups_enabled column (default: true - enabled by default)
ALTER TABLE system_settings
ADD COLUMN IF NOT EXISTS signups_enabled BOOLEAN NOT NULL DEFAULT true;

-- Update existing row to ensure signups are enabled by default
UPDATE system_settings
SET signups_enabled = true
WHERE id = 'main' AND signups_enabled IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN system_settings.signups_enabled IS 'When false, all signup requests are blocked. Can be toggled instantly via SQL: UPDATE system_settings SET signups_enabled = false WHERE id = ''main'';';

