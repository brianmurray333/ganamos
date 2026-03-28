-- RLS Security Hardening - 2026-03-28
-- Addresses vulnerabilities found during security audit
--
-- Fixes:
-- 1. Suspended users could unsuspend themselves via direct profile UPDATE
-- 2. Post owners could inflate reward or mark posts as fixed client-side
-- 3. pending_spends INSERT was open to any user for any user_id
-- 4. pet_orders INSERT was open to any authenticated user
-- 5. donations UPDATE immutability check had broken self-referential WHERE clause

-- ==========================================================================
-- FIX 1: Prevent users from changing their own status (e.g. unsuspending)
-- Only service_role can change profile status
-- ==========================================================================
CREATE OR REPLACE FUNCTION prevent_status_self_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
      RETURN NEW;
    END IF;
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_status_self_update ON profiles;
CREATE TRIGGER prevent_status_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_status_self_update();

-- ==========================================================================
-- FIX 2: Protect financial/completion fields on posts
-- Only service_role can change reward, fixed, fixed_by, etc.
-- ==========================================================================
CREATE OR REPLACE FUNCTION protect_post_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.reward := OLD.reward;
  NEW.original_reward := OLD.original_reward;
  NEW.fixed := OLD.fixed;
  NEW.fixed_by := OLD.fixed_by;
  NEW.fixed_at := OLD.fixed_at;
  NEW.total_boost_amount := OLD.total_boost_amount;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_post_financial_fields ON posts;
CREATE TRIGGER protect_post_financial_fields
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION protect_post_financial_fields();

-- ==========================================================================
-- FIX 3: pending_spends INSERT must match authenticated user
-- Previously was WITH CHECK (true) allowing inserts for any user_id
-- ==========================================================================
DROP POLICY IF EXISTS "pending_spends_insert" ON pending_spends;
CREATE POLICY "pending_spends_insert" ON pending_spends
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ==========================================================================
-- FIX 4: pet_orders INSERT restricted to service_role
-- Previously was WITH CHECK (true) for public role
-- ==========================================================================
DROP POLICY IF EXISTS "pet_orders_insert" ON pet_orders;
CREATE POLICY "pet_orders_insert" ON pet_orders
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ==========================================================================
-- FIX 5: Fix broken donations UPDATE immutability check
-- The old policy had WHERE donations_1.id = donations_1.id (always true)
-- instead of WHERE d.id = donations.id (referencing the actual row)
-- ==========================================================================
DROP POLICY IF EXISTS "Users can only update non-financial donation fields" ON donations;
CREATE POLICY "Users can only update non-financial donation fields" ON donations
  FOR UPDATE TO public
  USING (auth.uid() = donor_user_id)
  WITH CHECK (
    auth.uid() = donor_user_id
    AND amount = (SELECT d.amount FROM donations d WHERE d.id = donations.id)
    AND status = (SELECT d.status FROM donations d WHERE d.id = donations.id)
  );
