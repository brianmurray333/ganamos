-- Add system_settings table for emergency feature toggles
-- This allows instant disable/enable of withdrawals via SQL command (no deployment needed)

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  withdrawals_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Insert default row (withdrawals enabled by default)
INSERT INTO system_settings (id, withdrawals_enabled)
VALUES ('main', true)
ON CONFLICT (id) DO NOTHING;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_id ON system_settings(id);

-- Add comment for documentation
COMMENT ON TABLE system_settings IS 'System-wide feature flags. Use for emergency toggles that need instant effect.';
COMMENT ON COLUMN system_settings.withdrawals_enabled IS 'When false, all withdrawal requests return 503. Can be toggled instantly via SQL: UPDATE system_settings SET withdrawals_enabled = false WHERE id = ''main'';';

