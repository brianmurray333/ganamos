-- Enable RLS on system_settings table
-- Fixes Supabase Security Advisor warning: "RLS Disabled in Public"

-- ============================================================================
-- SYSTEM_SETTINGS RLS
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read system settings (needed for feature flag checks)
-- This includes both authenticated users and anon users
-- The API routes need to check if withdrawals/signups are enabled
CREATE POLICY "Anyone can read system settings" ON system_settings
  FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policies are created intentionally.
-- System settings should only be modified via direct SQL by admins:
--   UPDATE system_settings SET withdrawals_enabled = false WHERE id = 'main';
--   UPDATE system_settings SET signups_enabled = false WHERE id = 'main';
-- 
-- The admin dashboard or emergency scripts should use service role (which bypasses RLS).
-- This prevents any API-based modification of critical system feature flags.

-- Optional: If you want admins to be able to modify via API, uncomment below:
-- CREATE POLICY "Admin can manage system settings" ON system_settings
--   FOR ALL USING (
--     auth.jwt() ->> 'email' = 'admin@example.com'
--   );

