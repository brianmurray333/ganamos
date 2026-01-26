-- Enable RLS on admin tables that were missing it
-- Fixes Supabase Security Advisor warnings about RLS disabled in public

-- ============================================================================
-- ADMIN_PR_LOG RLS
-- ============================================================================

-- Enable RLS on admin_pr_log
ALTER TABLE admin_pr_log ENABLE ROW LEVEL SECURITY;

-- Allow admin email to read all PR logs
CREATE POLICY "Admin can view PR logs" ON admin_pr_log
  FOR SELECT USING (
    auth.jwt() ->> 'email' = 'admin@example.com'
  );

-- Allow admin email to insert/update PR logs (backup for direct access)
-- Note: The GitHub webhook uses service role which bypasses RLS
CREATE POLICY "Admin can manage PR logs" ON admin_pr_log
  FOR ALL USING (
    auth.jwt() ->> 'email' = 'admin@example.com'
  );

-- ============================================================================
-- ADMIN_AUDIT_LOG RLS
-- ============================================================================

-- Enable RLS on admin_audit_log
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow admin email to read all audit logs
CREATE POLICY "Admin can view audit logs" ON admin_audit_log
  FOR SELECT USING (
    auth.jwt() ->> 'email' = 'admin@example.com'
  );

-- Allow admin email to insert audit logs
CREATE POLICY "Admin can insert audit logs" ON admin_audit_log
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'email' = 'admin@example.com'
  );


