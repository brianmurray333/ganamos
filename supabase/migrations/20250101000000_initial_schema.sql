-- Initial Schema Migration for Ganamos
-- Updated to match staging database structure
-- This consolidates all core tables, functions, RLS policies, and indexes

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Profiles Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  balance INTEGER DEFAULT 0,
  pet_coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  fixed_issues_count INTEGER DEFAULT 0,
  status VARCHAR CHECK (status IN ('active', 'deleted', 'suspended')) DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- -----------------------------------------------------------------------------
-- Groups Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  invite_code VARCHAR NOT NULL UNIQUE,
  group_code VARCHAR NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_groups_group_code ON groups(group_code);

-- -----------------------------------------------------------------------------
-- Group Members Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  role VARCHAR NOT NULL CHECK (role IN ('admin', 'member')),
  status VARCHAR NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- -----------------------------------------------------------------------------
-- Connected Accounts Table (Parent-Child relationships)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id UUID NOT NULL REFERENCES profiles(id),
  connected_user_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(primary_user_id, connected_user_id),
  CHECK (primary_user_id != connected_user_id)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_primary ON connected_accounts(primary_user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_connected ON connected_accounts(connected_user_id);

-- -----------------------------------------------------------------------------
-- Donation Pools Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donation_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type VARCHAR NOT NULL CHECK (location_type IN ('neighborhood', 'city', 'region', 'country', 'global')),
  location_name VARCHAR NOT NULL,
  location_code VARCHAR,
  latitude NUMERIC,
  longitude NUMERIC,
  total_donated BIGINT DEFAULT 0,
  current_balance BIGINT DEFAULT 0,
  total_boosted BIGINT DEFAULT 0,
  boost_percentage INTEGER DEFAULT 10,
  max_daily_boost BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donation_pools_location_type ON donation_pools(location_type);
CREATE INDEX IF NOT EXISTS idx_donation_pools_location_name ON donation_pools(location_name);

-- -----------------------------------------------------------------------------
-- Location Hierarchy Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_pool_id UUID NOT NULL REFERENCES donation_pools(id),
  parent_pool_id UUID NOT NULL REFERENCES donation_pools(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_hierarchy_child ON location_hierarchy(child_pool_id);
CREATE INDEX IF NOT EXISTS idx_location_hierarchy_parent ON location_hierarchy(parent_pool_id);

-- -----------------------------------------------------------------------------
-- Posts Table (Issues/Jobs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  reward INTEGER NOT NULL,
  claimed BOOLEAN DEFAULT FALSE,
  claimed_by UUID REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ,
  fixed BOOLEAN DEFAULT FALSE,
  fixed_at TIMESTAMPTZ,
  fixed_image_url TEXT,
  fixed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  group_id UUID REFERENCES groups(id),
  city VARCHAR,
  fixer_note TEXT,
  created_by TEXT,
  created_by_avatar TEXT,
  under_review BOOLEAN DEFAULT FALSE,
  submitted_fix_by_id VARCHAR,
  submitted_fix_by_name VARCHAR,
  submitted_fix_by_avatar TEXT,
  submitted_fix_at TIMESTAMP,
  submitted_fix_image_url TEXT,
  submitted_fix_note TEXT,
  ai_confidence_score INTEGER,
  ai_analysis TEXT,
  original_reward BIGINT,
  total_boost_amount BIGINT DEFAULT 0,
  boost_applied BOOLEAN DEFAULT FALSE,
  is_anonymous BOOLEAN DEFAULT FALSE,
  funding_payment_request TEXT,
  funding_r_hash TEXT,
  funding_status TEXT,
  fixed_by_is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  anonymous_reward_paid_at TIMESTAMPTZ,
  anonymous_reward_payment_hash TEXT,
  locality TEXT,
  admin_area_1 TEXT,
  admin_area_2 TEXT,
  country TEXT,
  country_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_group_id ON posts(group_id);
CREATE INDEX IF NOT EXISTS idx_posts_city ON posts(city);
CREATE INDEX IF NOT EXISTS idx_posts_claimed ON posts(claimed);
CREATE INDEX IF NOT EXISTS idx_posts_fixed ON posts(fixed);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- -----------------------------------------------------------------------------
-- Transactions Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'internal')),
  amount INTEGER NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  payment_request TEXT,
  payment_hash TEXT,
  memo TEXT,
  r_hash_str TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_hash ON transactions(payment_hash);

-- -----------------------------------------------------------------------------
-- Donations Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_user_id UUID REFERENCES profiles(id),
  donation_pool_id UUID NOT NULL REFERENCES donation_pools(id),
  amount BIGINT NOT NULL,
  payment_hash VARCHAR,
  payment_request TEXT,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  donor_name VARCHAR,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_donations_donor_id ON donations(donor_user_id);
CREATE INDEX IF NOT EXISTS idx_donations_pool_id ON donations(donation_pool_id);
CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations(created_at DESC);

-- -----------------------------------------------------------------------------
-- Post Boosts Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id),
  donation_pool_id UUID NOT NULL REFERENCES donation_pools(id),
  boost_amount BIGINT NOT NULL,
  boost_percentage INTEGER NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_boosts_post_id ON post_boosts(post_id);
CREATE INDEX IF NOT EXISTS idx_post_boosts_pool_id ON post_boosts(donation_pool_id);

-- -----------------------------------------------------------------------------
-- Pending Fixes Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id),
  fixer_id UUID NOT NULL REFERENCES profiles(id),
  fix_image_url TEXT NOT NULL,
  fixer_note TEXT,
  confidence_score INTEGER NOT NULL,
  ai_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_pending_fixes_post_id ON pending_fixes(post_id);
CREATE INDEX IF NOT EXISTS idx_pending_fixes_fixer_id ON pending_fixes(fixer_id);
CREATE INDEX IF NOT EXISTS idx_pending_fixes_status ON pending_fixes(status);

-- -----------------------------------------------------------------------------
-- Activities Table (Unified activity feed)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL,
  related_id UUID,
  related_table TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

-- -----------------------------------------------------------------------------
-- Devices Table (IoT hardware devices)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  pairing_code VARCHAR NOT NULL UNIQUE,
  pet_name VARCHAR NOT NULL,
  pet_type VARCHAR NOT NULL CHECK (pet_type IN ('cat', 'dog', 'rabbit', 'squirrel', 'turtle')),
  status VARCHAR NOT NULL DEFAULT 'paired' CHECK (status IN ('paired', 'disconnected', 'offline')),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_pairing_code ON devices(pairing_code);

-- -----------------------------------------------------------------------------
-- Bitcoin Prices Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bitcoin_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'coinmarketcap',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitcoin_prices_created_at ON bitcoin_prices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bitcoin_prices_currency ON bitcoin_prices(currency);

-- -----------------------------------------------------------------------------
-- Verifications Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR NOT NULL DEFAULT 'pending',
  before_image TEXT,
  after_image TEXT,
  ai_response TEXT,
  reviewer_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verifications_post_id ON verifications(post_id);
CREATE INDEX IF NOT EXISTS idx_verifications_user_id ON verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status);

-- -----------------------------------------------------------------------------
-- Notification Queue Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_queue (
  id SERIAL PRIMARY KEY,
  post_id UUID NOT NULL,
  poster_email TEXT NOT NULL,
  poster_name TEXT NOT NULL,
  fixer_name TEXT,
  post_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  status TEXT,
  last_attempted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_post_id ON notification_queue(post_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);

-- -----------------------------------------------------------------------------
-- Trigger Logs Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trigger_logs (
  id SERIAL PRIMARY KEY,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitcoin_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Profiles RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- Groups RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view groups they are members of" ON groups
  FOR SELECT USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
      AND group_members.status = 'approved'
    )
  );

CREATE POLICY "Users can create groups" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups" ON groups
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- Group Members RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view group members of their groups" ON group_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
    )
  );

CREATE POLICY "Users can insert group membership" ON group_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group admins can update memberships" ON group_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = group_members.group_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'admin'
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Connected Accounts RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their connected accounts" ON connected_accounts
  FOR SELECT USING (
    primary_user_id = auth.uid() OR
    connected_user_id = auth.uid()
  );

CREATE POLICY "Users can create connected accounts" ON connected_accounts
  FOR INSERT WITH CHECK (primary_user_id = auth.uid());

CREATE POLICY "Users can update their connected accounts" ON connected_accounts
  FOR UPDATE USING (primary_user_id = auth.uid());

CREATE POLICY "Users can delete their connected accounts" ON connected_accounts
  FOR DELETE USING (primary_user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Posts RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view posts" ON posts
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create posts" ON posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Post creators can update their posts" ON posts
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- Transactions RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their own transactions" ON transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own transactions" ON transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own transactions" ON transactions
  FOR UPDATE USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Donations RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view donations" ON donations
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create donations" ON donations
  FOR INSERT WITH CHECK (auth.uid() = donor_user_id OR donor_user_id IS NULL);

-- -----------------------------------------------------------------------------
-- Post Boosts RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view post boosts" ON post_boosts
  FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- Pending Fixes RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view pending fixes" ON pending_fixes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create pending fixes" ON pending_fixes
  FOR INSERT WITH CHECK (auth.uid() = fixer_id);

CREATE POLICY "Post owners can update pending fixes" ON pending_fixes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = pending_fixes.post_id
      AND posts.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Donation Pools RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view donation pools" ON donation_pools
  FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- Activities RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their own activities" ON activities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own activities" ON activities
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Devices RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their own devices" ON devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own devices" ON devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices" ON devices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices" ON devices
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Bitcoin Prices RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Bitcoin prices are publicly readable" ON bitcoin_prices
  FOR SELECT TO public USING (true);

CREATE POLICY "Service role can insert bitcoin prices" ON bitcoin_prices
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update bitcoin prices" ON bitcoin_prices
  FOR UPDATE TO service_role USING (true);

-- -----------------------------------------------------------------------------
-- Verifications RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view verifications for their posts" ON verifications
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = verifications.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create verifications" ON verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Location Hierarchy RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Anyone can view location hierarchy" ON location_hierarchy
  FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- Notification Queue RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Service role can manage notification queue" ON notification_queue
  FOR ALL TO service_role USING (true);

-- -----------------------------------------------------------------------------
-- Trigger Logs RLS Policies
-- -----------------------------------------------------------------------------
CREATE POLICY "Service role can view trigger logs" ON trigger_logs
  FOR SELECT TO service_role USING (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Update timestamp trigger function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_members_updated_at
  BEFORE UPDATE ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connected_accounts_updated_at
  BEFORE UPDATE ON connected_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_donation_pools_updated_at
  BEFORE UPDATE ON donation_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verifications_updated_at
  BEFORE UPDATE ON verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Get latest Bitcoin price function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_latest_bitcoin_price(p_currency TEXT DEFAULT 'USD')
RETURNS TABLE (
  price NUMERIC,
  currency TEXT,
  source TEXT,
  created_at TIMESTAMPTZ,
  age_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.price,
    bp.currency,
    bp.source,
    bp.created_at,
    EXTRACT(EPOCH FROM (NOW() - bp.created_at))::INTEGER / 60 AS age_minutes
  FROM bitcoin_prices bp
  WHERE bp.currency = p_currency
  ORDER BY bp.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_latest_bitcoin_price(TEXT) TO public;

-- -----------------------------------------------------------------------------
-- Cleanup old Bitcoin prices function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_old_bitcoin_prices()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM bitcoin_prices
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_old_bitcoin_prices() TO service_role;

-- ============================================================================
-- REALTIME
-- ============================================================================

-- Enable realtime for profiles (activity feed updates)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE activities;

-- ============================================================================
-- STORAGE
-- ============================================================================

-- Create storage buckets for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true),
       ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for post images
CREATE POLICY "Anyone can view post images" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

CREATE POLICY "Authenticated users can upload post images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-images' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can update their own post images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'post-images' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete their own post images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-images' AND
    auth.uid() IS NOT NULL
  );

-- Storage RLS policies for profile avatars
CREATE POLICY "Anyone can view profile avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-avatars');

CREATE POLICY "Authenticated users can upload profile avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-avatars' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can update their own profile avatars" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-avatars' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete their own profile avatars" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-avatars' AND
    auth.uid() IS NOT NULL
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE profiles IS 'User profiles with balance and pet coins';
COMMENT ON TABLE posts IS 'Community issues/jobs to be fixed';
COMMENT ON TABLE transactions IS 'Financial transactions including deposits, withdrawals, and transfers';
COMMENT ON TABLE activities IS 'Unified activity feed for user actions';
COMMENT ON TABLE devices IS 'Connected IoT hardware devices';
COMMENT ON TABLE bitcoin_prices IS 'Cached Bitcoin price data updated every 30 minutes';
COMMENT ON TABLE donation_pools IS 'Location-based donation pools for boosting posts';
COMMENT ON TABLE donations IS 'User donations to location-based pools';
COMMENT ON TABLE post_boosts IS 'Donation pool boosts applied to posts';
COMMENT ON TABLE pending_fixes IS 'Pending fix submissions awaiting approval';
COMMENT ON TABLE connected_accounts IS 'Parent-child account relationships for family accounts';
COMMENT ON TABLE verifications IS 'Post fix verification records';
COMMENT ON TABLE notification_queue IS 'Queue for email notifications';

COMMENT ON FUNCTION get_latest_bitcoin_price IS 'Returns the most recent Bitcoin price with age in minutes';
COMMENT ON FUNCTION cleanup_old_bitcoin_prices IS 'Deletes Bitcoin price records older than 30 days';
