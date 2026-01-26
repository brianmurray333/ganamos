-- Seed Data for Local Development
-- This file contains comprehensive mock data for testing the application locally
-- Run `supabase db reset` to apply migrations and seed data

-- ============================================================================
-- Test Users (Auth + Profiles)
-- ============================================================================

DO $$
DECLARE
  user1_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;
  user2_id uuid := 'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid;
  user3_id uuid := 'c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid;
  user4_id uuid := 'd3bbef22-cf3e-7cd1-ee9a-9ee2ea6b3d44'::uuid;
  user5_id uuid := 'e4ccfa33-df4a-8de2-ff0b-0ff3fb7c4e55'::uuid;
BEGIN
  -- User 1: Test User (Main)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user1_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      user1_id, '00000000-0000-0000-0000-000000000000',
      'test@ganamos.dev', crypt('test123456', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Test User"}'::jsonb,
      false, 'authenticated', 'authenticated',
      '', '', '', ''
    );
    
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), user1_id, 'test@ganamos.dev',
      jsonb_build_object('sub', user1_id::text, 'email', 'test@ganamos.dev'),
      'email', now(), now(), now()
    );
  END IF;

  -- User 2: Alice
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user2_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      user2_id, '00000000-0000-0000-0000-000000000000',
      'alice@ganamos.dev', crypt('alice123456', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Alice"}'::jsonb,
      false, 'authenticated', 'authenticated',
      '', '', '', ''
    );
    
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), user2_id, 'alice@ganamos.dev',
      jsonb_build_object('sub', user2_id::text, 'email', 'alice@ganamos.dev'),
      'email', now(), now(), now()
    );
  END IF;

  -- User 3: Bob
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user3_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      user3_id, '00000000-0000-0000-0000-000000000000',
      'bob@ganamos.dev', crypt('bob123456', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Bob"}'::jsonb,
      false, 'authenticated', 'authenticated',
      '', '', '', ''
    );
    
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), user3_id, 'bob@ganamos.dev',
      jsonb_build_object('sub', user3_id::text, 'email', 'bob@ganamos.dev'),
      'email', now(), now(), now()
    );
  END IF;

  -- User 4: Charlie
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user4_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      user4_id, '00000000-0000-0000-0000-000000000000',
      'charlie@ganamos.dev', crypt('charlie123456', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Charlie"}'::jsonb,
      false, 'authenticated', 'authenticated',
      '', '', '', ''
    );
    
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), user4_id, 'charlie@ganamos.dev',
      jsonb_build_object('sub', user4_id::text, 'email', 'charlie@ganamos.dev'),
      'email', now(), now(), now()
    );
  END IF;

  -- User 5: Diana
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user5_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      user5_id, '00000000-0000-0000-0000-000000000000',
      'diana@ganamos.dev', crypt('diana123456', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Diana"}'::jsonb,
      false, 'authenticated', 'authenticated',
      '', '', '', ''
    );
    
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), user5_id, 'diana@ganamos.dev',
      jsonb_build_object('sub', user5_id::text, 'email', 'diana@ganamos.dev'),
      'email', now(), now(), now()
    );
  END IF;

  -- Create Profiles
  INSERT INTO profiles (id, email, name, username, balance, created_at, updated_at)
  VALUES
    (user1_id, 'test@ganamos.dev', 'Test User', 'testuser', 5000, now(), now()),
    (user2_id, 'alice@ganamos.dev', 'Alice', 'alice', 3000, now(), now()),
    (user3_id, 'bob@ganamos.dev', 'Bob', 'bob', 2500, now(), now()),
    (user4_id, 'charlie@ganamos.dev', 'Charlie', 'charlie', 4000, now(), now()),
    (user5_id, 'diana@ganamos.dev', 'Diana', 'diana', 2000, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    balance = EXCLUDED.balance,
    updated_at = now();

  RAISE NOTICE 'Created 5 test users with profiles';
END $$;

-- ============================================================================
-- Donation Pools
-- ============================================================================
-- Create donation pools for various location types
INSERT INTO donation_pools (
  location_type,
  location_name,
  location_code,
  latitude,
  longitude,
  total_donated,
  current_balance,
  total_boosted,
  boost_percentage
)
VALUES
  ('city', 'Austin', 'US-TX-AUSTIN', 30.2672, -97.7431, 5000, 5000, 0, 10),
  ('city', 'New York', 'US-NY-NYC', 40.7128, -74.0060, 5000, 5000, 0, 10),
  ('city', 'San Francisco', 'US-CA-SF', 37.7749, -122.4194, 5000, 5000, 0, 10),
  ('city', 'Miami', 'US-FL-MIAMI', 25.7617, -80.1918, 5000, 5000, 0, 10),
  ('city', 'Chicago', 'US-IL-CHICAGO', 41.8781, -87.6298, 5000, 5000, 0, 10),
  ('country', 'United States', 'US', NULL, NULL, 10000, 10000, 0, 10),
  ('global', 'Global', 'GLOBAL', NULL, NULL, 20000, 20000, 0, 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Bitcoin Prices
-- ============================================================================
INSERT INTO bitcoin_prices (price, currency, source)
VALUES
  (97500.00, 'USD', 'diadata.org'),
  (97450.00, 'USD', 'diadata.org'),
  (97600.00, 'USD', 'diadata.org'),
  -- Mock DIA Data Bitcoin price seed (for local development with USE_MOCKS=true)
  (42150.00, 'USD', 'diadata.org')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Groups
-- ============================================================================
INSERT INTO groups (id, name, description, created_by, invite_code, group_code)
VALUES
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'Austin Community Clean-up', 'Making Austin beautiful one fix at a time', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'AUSTIN-CLEANUP', 'AUSCLEAN'),
  ('b2222222-2222-2222-2222-222222222222'::uuid, 'NYC Street Fixers', 'Fixing potholes and street issues in NYC', 'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'NYC-FIXERS', 'NYCFIX')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Group Members
-- ============================================================================
-- Uncomment and modify these once you have actual user profiles created

-- INSERT INTO posts (
--   title,
--   description,
--   image_url,
--   location,
--   city,
--   latitude,
--   longitude,
--   reward,
--   user_id,
--   created_by
-- )
-- VALUES
--   (
--     'Pothole on Main Street',
--     'Large pothole causing traffic issues near downtown',
--     'https://placehold.co/600x400/png?text=Pothole',
--     'Main St & 5th Ave, Austin, TX',
--     'Austin',
--     30.2672,
--     -97.7431,
--     500,
--     'user-uuid-here',
--     'user-uuid-here'
--   ),
--   (
--     'Graffiti on Community Center',
--     'Graffiti needs to be cleaned up on the community center wall',
--     'https://placehold.co/600x400/png?text=Graffiti',
--     'Community Center, Austin, TX',
--     'Austin',
--     30.2700,
--     -97.7400,
--     300,
--     'user-uuid-here',
--     'user-uuid-here'
--   );

-- ============================================================================
-- Posts (Issues)
-- ============================================================================
-- Note: created_by should be the display name, not the UUID
INSERT INTO posts (
  id, user_id, title, description, image_url, location,
  latitude, longitude, city,
  reward, original_reward, claimed, fixed, created_by, created_at
)
VALUES
  -- Unfixed posts
  (
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'Pothole on Main Street',
    'Large pothole causing traffic issues near downtown Austin. Needs immediate attention.',
    'https://placehold.co/600x400/png?text=Pothole',
    'Main St & 5th Ave, Austin, TX 78701',
    30.2672, -97.7431, 'Austin',
    500, 500, false, false,
    'Test User',
    now() - interval '2 days'
  ),
  (
    'b2222222-2222-2222-2222-222222222222'::uuid,
    'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid,
    'Graffiti on Community Center',
    'Graffiti needs to be cleaned up on the community center wall. It''s been there for weeks.',
    'https://placehold.co/600x400/png?text=Graffiti',
    'Community Center, Austin, TX',
    30.2700, -97.7400, 'Austin',
    300, 300, false, false,
    'Alice',
    now() - interval '1 day'
  ),
  (
    'c3333333-3333-3333-3333-333333333333'::uuid,
    'c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid,
    'Broken Streetlight',
    'Streetlight is out on 3rd Street. Makes the area unsafe at night.',
    'https://placehold.co/600x400/png?text=Streetlight',
    '3rd St, New York, NY 10001',
    40.7128, -74.0060, 'New York',
    400, 400, true, false,
    'Bob',
    now() - interval '3 days'
  ),
  -- Post with long location name (for testing truncation)
  (
    'f6666666-6666-6666-6666-666666666666'::uuid,
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'Grab dinner in Georgetown',
    'Looking for a nice restaurant for dinner tonight in the Georgetown area.',
    'https://placehold.co/600x400/png?text=Dinner',
    'Ritz-Carlton Residences North Lobby, Washington, DC 20007',
    38.9072, -77.0369, 'Washington',
    1000, 1000, false, false,
    'Test User',
    now()
  ),
  -- Fixed posts
  (
    'd4444444-4444-4444-4444-444444444444'::uuid,
    'd3bbef22-cf3e-7cd1-ee9a-9ee2ea6b3d44'::uuid,
    'Littered Park Bench',
    'Park bench area is full of trash. Needs cleaning.',
    'https://placehold.co/600x400/png?text=Trash',
    'Central Park, New York, NY',
    40.7851, -73.9683, 'New York',
    250, 250, true, true,
    'Charlie',
    now() - interval '5 days'
  ),
  (
    'e5555555-5555-5555-5555-555555555555'::uuid,
    'e4ccfa33-df4a-8de2-ff0b-0ff3fb7c4e55'::uuid,
    'Damaged Sidewalk',
    'Sidewalk has a large crack that could cause someone to trip.',
    'https://placehold.co/600x400/png?text=Sidewalk',
    'Market St, San Francisco, CA',
    37.7749, -122.4194, 'San Francisco',
    600, 600, true, true,
    'Diana',
    now() - interval '7 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Update fixed posts with fix details
UPDATE posts SET
  fixed_by = 'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid,
  fixed_at = now() - interval '2 days',
  fixed_image_url = 'https://placehold.co/600x400/png?text=Fixed',
  fixer_note = 'Cleaned up all the trash and restored the area.'
WHERE id = 'd4444444-4444-4444-4444-444444444444'::uuid;

UPDATE posts SET
  fixed_by = 'c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid,
  fixed_at = now() - interval '4 days',
  fixed_image_url = 'https://placehold.co/600x400/png?text=Fixed',
  fixer_note = 'Repaired the sidewalk crack with new concrete.'
WHERE id = 'e5555555-5555-5555-5555-555555555555'::uuid;

-- Update claimed post
UPDATE posts SET
  claimed_by = 'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid,
  claimed_at = now() - interval '1 day'
WHERE id = 'c3333333-3333-3333-3333-333333333333'::uuid;

-- ============================================================================
-- Transactions
-- ============================================================================
INSERT INTO transactions (user_id, type, amount, status, memo, created_at)
VALUES
  -- Deposits
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'deposit', 5000, 'completed', 'Initial deposit', now() - interval '10 days'),
  ('b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'deposit', 3000, 'completed', 'Initial deposit', now() - interval '9 days'),
  ('c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid, 'deposit', 2500, 'completed', 'Initial deposit', now() - interval '8 days'),
  ('d3bbef22-cf3e-7cd1-ee9a-9ee2ea6b3d44'::uuid, 'deposit', 4000, 'completed', 'Initial deposit', now() - interval '7 days'),
  ('e4ccfa33-df4a-8de2-ff0b-0ff3fb7c4e55'::uuid, 'deposit', 2000, 'completed', 'Initial deposit', now() - interval '6 days'),

  -- Post Rewards (using 'internal' type since 'post_reward' is not in the schema)
  ('b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'internal', 250, 'completed', 'Reward for fixing littered park bench', now() - interval '2 days'),
  ('c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid, 'internal', 600, 'completed', 'Reward for fixing damaged sidewalk', now() - interval '4 days'),

  -- Internal transfers
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'internal', 500, 'completed', 'Transfer to Alice', now() - interval '3 days'),
  ('b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'internal', 500, 'completed', 'Received from Test User', now() - interval '3 days')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Activities
-- ============================================================================
INSERT INTO activities (user_id, type, metadata)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'post_created', 
   '{"post_id":"a1111111-1111-1111-1111-111111111111","title":"Pothole on Main Street"}'::jsonb),
  ('b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'post_created',
   '{"post_id":"b2222222-2222-2222-2222-222222222222","title":"Graffiti on Community Center"}'::jsonb),
  ('b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'post_fixed',
   '{"post_id":"d4444444-4444-4444-4444-444444444444","title":"Littered Park Bench","reward":250}'::jsonb),
  ('c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid, 'post_fixed',
   '{"post_id":"e5555555-5555-5555-5555-555555555555","title":"Damaged Sidewalk","reward":600}'::jsonb),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'transaction',
   '{"type":"deposit","amount":5000,"status":"completed"}'::jsonb),
  ('b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid, 'transaction',
   '{"type":"post_reward","amount":250,"status":"completed"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Connected Accounts (Parent-Child relationships)
-- ============================================================================
INSERT INTO connected_accounts (primary_user_id, connected_user_id)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Sample Devices and Flappy Bird Leaderboard Entries
-- ============================================================================
DO $$
DECLARE
  user1_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;
  user2_id uuid := 'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22'::uuid;
  user3_id uuid := 'c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33'::uuid;
  user4_id uuid := 'd3bbef22-cf3e-7cd1-ee9a-9ee2ea6b3d44'::uuid;
  user5_id uuid := 'e4ccfa33-df4a-8de2-ff0b-0ff3fb7c4e55'::uuid;

  device1_id uuid := '10111111-1111-1111-1111-111111111101'::uuid;
  device2_id uuid := '20222222-2222-2222-2222-222222222202'::uuid;
  device3_id uuid := '30333333-3333-3333-3333-333333333303'::uuid;
  device4_id uuid := '40444444-4444-4444-4444-444444444404'::uuid;
  device5_id uuid := '50555555-5555-5555-5555-555555555505'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM devices WHERE id = device1_id) THEN
    INSERT INTO devices (id, user_id, pairing_code, pet_name, pet_type, status)
    VALUES (device1_id, user1_id, 'FLP001', 'Satoshi', 'cat', 'paired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM devices WHERE id = device2_id) THEN
    INSERT INTO devices (id, user_id, pairing_code, pet_name, pet_type, status)
    VALUES (device2_id, user2_id, 'FLP002', 'Luna', 'dog', 'paired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM devices WHERE id = device3_id) THEN
    INSERT INTO devices (id, user_id, pairing_code, pet_name, pet_type, status)
    VALUES (device3_id, user3_id, 'FLP003', 'Bolt', 'rabbit', 'paired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM devices WHERE id = device4_id) THEN
    INSERT INTO devices (id, user_id, pairing_code, pet_name, pet_type, status)
    VALUES (device4_id, user4_id, 'FLP004', 'Pixel', 'squirrel', 'paired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM devices WHERE id = device5_id) THEN
    INSERT INTO devices (id, user_id, pairing_code, pet_name, pet_type, status)
    VALUES (device5_id, user5_id, 'FLP005', 'Nala', 'turtle', 'paired');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM flappy_bird_game WHERE device_id = device1_id AND score = 24
  ) THEN
    INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
    VALUES (device1_id, user1_id, 24, NOW() - INTERVAL '2 days');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM flappy_bird_game WHERE device_id = device2_id AND score = 18
  ) THEN
    INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
    VALUES (device2_id, user2_id, 18, NOW() - INTERVAL '1 day');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM flappy_bird_game WHERE device_id = device3_id AND score = 15
  ) THEN
    INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
    VALUES (device3_id, user3_id, 15, NOW() - INTERVAL '12 hours');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM flappy_bird_game WHERE device_id = device4_id AND score = 12
  ) THEN
    INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
    VALUES (device4_id, user4_id, 12, NOW() - INTERVAL '6 hours');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM flappy_bird_game WHERE device_id = device5_id AND score = 9
  ) THEN
    INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
    VALUES (device5_id, user5_id, 9, NOW() - INTERVAL '3 hours');
  END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- ============================================================================
-- Test User for Development (Mock Login)
-- ============================================================================
-- This creates the test@ganamos.dev user for mock login functionality
-- WARNING: This should ONLY be used in local development environments

DO $$
DECLARE
  test_user_id uuid;
BEGIN
  -- Generate a consistent UUID for the test user
  test_user_id := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;

  -- Check if user already exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test@ganamos.dev') THEN
    -- Insert test user into auth.users
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
      test_user_id,
      '00000000-0000-0000-0000-000000000000',
      'test@ganamos.dev',
      crypt('test123456', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Test User"}'::jsonb,
      false,
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );

    -- Insert corresponding identity
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      test_user_id,
      'test@ganamos.dev',
      jsonb_build_object('sub', test_user_id::text, 'email', 'test@ganamos.dev'),
      'email',
      now(),
      now(),
      now()
    );

    -- Insert profile for test user
    INSERT INTO profiles (
      id,
      email,
      name,
      username,
      avatar_url,
      balance,
      created_at,
      updated_at
    ) VALUES (
      test_user_id,
      'test@ganamos.dev',
      'Test User',
      'testuser',
      null,
      1000,  -- Start with 1000 sats for testing
      now(),
      now()
    ) ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Test user created: test@ganamos.dev (password: test123456)';
  ELSE
    RAISE NOTICE 'Test user already exists: test@ganamos.dev';
  END IF;
END $$;

-- To add test users and complete seed data:
--
-- 1. Start Supabase: `supabase start`
-- 2. Open Supabase Studio: http://localhost:54323
-- 3. Go to Authentication > Users
-- 4. Create test users manually or via API
-- 5. Copy the user UUIDs
-- 6. Uncomment and update the INSERT statements above with actual UUIDs
-- 7. Run: `supabase db reset` to reapply migrations and seed data
--
-- Mock Login:
-- - Email: test@ganamos.dev
-- - Password: test123456
-- - This user is automatically created by the seed script above
-- - Only available when NEXT_PUBLIC_POD_URL is set (development only)

COMMENT ON TABLE donation_pools IS 'Seeded with donation pools for cities, countries, and global';
COMMENT ON TABLE bitcoin_prices IS 'Seeded with sample Bitcoin prices for testing';
