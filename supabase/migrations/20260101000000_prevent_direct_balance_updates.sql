-- SECURITY FIX: Prevent direct balance updates
-- Only service_role (server-side) can modify balance/pet_coins

CREATE OR REPLACE FUNCTION prevent_direct_balance_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If balance/pet_coins unchanged, allow
  IF OLD.balance IS NOT DISTINCT FROM NEW.balance 
     AND OLD.pet_coins IS NOT DISTINCT FROM NEW.pet_coins THEN
    RETURN NEW;
  END IF;

  -- If service_role, allow
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block: preserve original values
  RAISE WARNING 'SECURITY: Blocked balance update. User: %, Attempted: % -> %', 
    auth.uid(), OLD.balance, NEW.balance;
  NEW.balance := OLD.balance;
  NEW.pet_coins := OLD.pet_coins;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_balance_update ON profiles;
CREATE TRIGGER prevent_balance_update
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_balance_update();

