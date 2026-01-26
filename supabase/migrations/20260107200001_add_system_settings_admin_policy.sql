-- Add admin UPDATE policy to system_settings table
-- This allows admin to toggle withdrawals/signups without disabling RLS

-- ============================================================================
-- SYSTEM_SETTINGS ADMIN POLICIES
-- ============================================================================

-- Allow admin (admin@example.com) to update system settings
-- This enables the kill switch to work from Supabase dashboard without disabling RLS
CREATE POLICY "Admin can update system settings" ON system_settings
  FOR UPDATE USING (
    -- Allow if user is authenticated as admin
    auth.jwt() ->> 'email' = 'admin@example.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'admin@example.com'
  );

-- Also allow service_role full access (for API routes)
CREATE POLICY "Service role can manage system settings" ON system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- QUICK REFERENCE
-- ============================================================================
-- These commands now work without disabling RLS (when logged in as admin):
--
-- Disable withdrawals:
--   UPDATE system_settings SET withdrawals_enabled = false, updated_by = 'emergency' WHERE id = 'main';
--
-- Enable withdrawals:
--   UPDATE system_settings SET withdrawals_enabled = true, updated_by = 'resumed' WHERE id = 'main';
--
-- Disable signups:
--   UPDATE system_settings SET signups_enabled = false WHERE id = 'main';
--
-- Enable signups:
--   UPDATE system_settings SET signups_enabled = true WHERE id = 'main';

