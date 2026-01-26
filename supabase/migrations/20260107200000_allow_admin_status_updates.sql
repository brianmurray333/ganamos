-- Allow admin status updates without disabling triggers
-- This migration modifies the prevent_protected_field_updates trigger to allow status changes
-- while still protecting balance and pet_coins

-- ============================================================================
-- DROP THE OLD TRIGGER (prevent_protected_field_updates)
-- ============================================================================
-- This trigger was blocking admin status updates (suspensions)
DROP TRIGGER IF EXISTS prevent_protected_field_updates ON profiles;
DROP FUNCTION IF EXISTS prevent_protected_field_updates();

-- ============================================================================
-- UPDATE THE prevent_direct_balance_update FUNCTION
-- ============================================================================
-- The existing trigger already allows service_role, but we want to ensure
-- status updates are always allowed while balance/pet_coins are protected

CREATE OR REPLACE FUNCTION prevent_direct_balance_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If balance/pet_coins unchanged, allow (this lets status updates through)
  IF OLD.balance IS NOT DISTINCT FROM NEW.balance 
     AND OLD.pet_coins IS NOT DISTINCT FROM NEW.pet_coins THEN
    RETURN NEW;
  END IF;

  -- If service_role, allow balance/pet_coins changes
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block balance/pet_coins changes: preserve original values but allow other field changes
  RAISE WARNING 'SECURITY: Blocked balance update. User: %, Attempted balance: % -> %, Attempted pet_coins: % -> %', 
    auth.uid(), OLD.balance, NEW.balance, OLD.pet_coins, NEW.pet_coins;
  NEW.balance := OLD.balance;
  NEW.pet_coins := OLD.pet_coins;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS prevent_balance_update ON profiles;
CREATE TRIGGER prevent_balance_update
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_balance_update();

-- ============================================================================
-- VERIFY
-- ============================================================================
-- Run these to verify the trigger is working correctly:
-- 
-- This should SUCCEED (status update):
--   UPDATE profiles SET status = 'suspended' WHERE id = 'some-user-id';
--
-- This should FAIL/be blocked (balance update from non-service-role):
--   UPDATE profiles SET balance = 999999 WHERE id = 'some-user-id';

