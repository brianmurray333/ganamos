-- Create a secure database function to get device config
-- This function safely returns user profile data for a device
-- Uses SECURITY DEFINER to bypass RLS but only for verified device-user relationships

CREATE OR REPLACE FUNCTION get_device_user_profile(p_device_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  balance INTEGER,
  pet_coins INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Verify device exists and is paired
  IF NOT EXISTS (
    SELECT 1 FROM devices 
    WHERE id = p_device_id 
      AND status = 'paired'
  ) THEN
    RAISE EXCEPTION 'Device not found or not paired';
  END IF;

  -- Return the profile for the device's linked user
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.name,
    p.balance,
    COALESCE(p.pet_coins, 0) as pet_coins,
    p.updated_at
  FROM profiles p
  INNER JOIN devices d ON d.user_id = p.id
  WHERE d.id = p_device_id
    AND d.status = 'paired';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (or anon if needed)
-- Since devices don't have auth, we might need to allow anon
GRANT EXECUTE ON FUNCTION get_device_user_profile(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_device_user_profile(UUID) TO authenticated;

