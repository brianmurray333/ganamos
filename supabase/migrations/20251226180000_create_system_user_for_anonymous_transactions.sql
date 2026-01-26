-- Create a system user profile for anonymous transactions
-- This allows us to track anonymous payouts in the transactions table
-- for complete audit trail integrity

-- Create the system user profile if it doesn't exist
-- Using a well-known UUID: 00000000-0000-0000-0000-000000000000
DO $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  system_username TEXT := 'system';
  username_counter INTEGER := 1;
BEGIN
  -- Create auth user if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = system_user_id) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      system_user_id,
      system_user_id,
      'system@ganamos.earth',
      crypt('system_user_password_never_used', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"system","providers":["system"]}'::jsonb,
      '{"name":"System User"}'::jsonb,
      false,
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );
  END IF;

  -- Create profile if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = system_user_id) THEN
    -- Check if username 'system' is already taken, use alternative if needed
    WHILE EXISTS (SELECT 1 FROM profiles WHERE username = system_username) LOOP
      system_username := 'system-' || username_counter;
      username_counter := username_counter + 1;
    END LOOP;
    
    INSERT INTO profiles (
      id,
      email,
      name,
      username,
      balance,
      pet_coins,
      created_at,
      updated_at,
      status
    ) VALUES (
      system_user_id,
      'system@ganamos.earth',
      'System User',
      system_username,
      0,  -- Balance always 0 - this is just for transaction tracking
      0,
      now(),
      now(),
      'active'
    );
  END IF;
END $$;

COMMENT ON TABLE profiles IS 
  'The profile with id 00000000-0000-0000-0000-000000000000 is the system user used for anonymous transactions. Its balance should always be 0 and is not used for actual balance calculations.';

