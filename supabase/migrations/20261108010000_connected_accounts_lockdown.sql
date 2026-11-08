-- Lock down connected_accounts (parent ⇄ child account links).
--
-- A connected account lets the primary user act as the connected user
-- (switch profiles, spend their balance, post and pay on their behalf).
-- 20260102060000_fix_critical_rls_policies intended to make creation
-- server-only, but the original policies from the initial schema were never
-- dropped. Because permissive policies are OR'ed, any signed-in user could
-- still INSERT a row linking themselves to ANY other user (and UPDATE rows to
-- point at someone else).
--
-- Legitimate links are created only by /api/child-account (service role).

DROP POLICY IF EXISTS "Users can create connected accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can update their connected accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can view their connected accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can delete their connected accounts" ON connected_accounts;

-- Remaining policies (from 20260102060000):
--   SELECT  "Users can view own connections"         (parent or child)
--   INSERT  "Only service role can create connections"
--   UPDATE  "Only service role can update connections"
--   DELETE  "Primary user can delete own connections"
-- Recreate them defensively in case an environment is missing any.
DROP POLICY IF EXISTS "Users can view own connections" ON connected_accounts;
CREATE POLICY "Users can view own connections" ON connected_accounts
  FOR SELECT USING (auth.uid() = primary_user_id OR auth.uid() = connected_user_id);

DROP POLICY IF EXISTS "Only service role can create connections" ON connected_accounts;
CREATE POLICY "Only service role can create connections" ON connected_accounts
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Only service role can update connections" ON connected_accounts;
CREATE POLICY "Only service role can update connections" ON connected_accounts
  FOR UPDATE TO service_role USING (true);

DROP POLICY IF EXISTS "Primary user can delete own connections" ON connected_accounts;
CREATE POLICY "Primary user can delete own connections" ON connected_accounts
  FOR DELETE USING (auth.uid() = primary_user_id);

ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Belt and braces: browsers never write this table directly.
REVOKE INSERT, UPDATE ON connected_accounts FROM anon, authenticated;
