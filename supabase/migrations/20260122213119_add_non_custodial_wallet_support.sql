-- Migration: Add Non-Custodial Wallet Support
-- Allows users to connect their own Lightning wallets via NWC (Nostr Wallet Connect)

-- ============================================================================
-- WALLET TYPE ENUM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE wallet_type AS ENUM ('custodial', 'nwc');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- USER WALLETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  wallet_type wallet_type NOT NULL DEFAULT 'nwc',
  
  -- For NWC connections (connection string is encrypted client-side)
  nwc_connection_encrypted TEXT,
  nwc_relay_url TEXT,
  nwc_pubkey TEXT,  -- Wallet's public key (not secret, used for identification)
  
  -- Permissions granted by user's wallet
  permissions JSONB DEFAULT '["pay_invoice", "make_invoice", "get_balance"]'::jsonb,
  
  -- User-friendly metadata
  wallet_name TEXT DEFAULT 'My Lightning Wallet',
  
  -- Connection state
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'error')),
  
  -- Active state - only one non-custodial wallet can be active per user
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key to profiles
  CONSTRAINT user_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Ensure only one active non-custodial wallet per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_unique_active 
  ON user_wallets(user_id) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);

-- ============================================================================
-- USER PREFERENCES FOR WALLET PROMPT
-- ============================================================================

-- Add column to profiles to track if user dismissed the wallet connection prompt
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS wallet_prompt_dismissed BOOLEAN DEFAULT false;

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS wallet_prompt_dismissed_at TIMESTAMPTZ;

-- ============================================================================
-- WALLET CONNECTION AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_connection_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  wallet_id UUID,
  action TEXT NOT NULL CHECK (action IN (
    'connected', 
    'disconnected', 
    'connection_failed',
    'payment_initiated', 
    'payment_completed', 
    'payment_failed',
    'invoice_created',
    'invoice_creation_failed',
    'prompt_dismissed'
  )),
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT wallet_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT wallet_audit_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES user_wallets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_user ON wallet_connection_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_wallet ON wallet_connection_audit(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_created ON wallet_connection_audit(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_connection_audit ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own wallets
DROP POLICY IF EXISTS user_wallets_select ON user_wallets;
CREATE POLICY user_wallets_select ON user_wallets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_wallets_insert ON user_wallets;
CREATE POLICY user_wallets_insert ON user_wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_wallets_update ON user_wallets;
CREATE POLICY user_wallets_update ON user_wallets
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_wallets_delete ON user_wallets;
CREATE POLICY user_wallets_delete ON user_wallets
  FOR DELETE USING (auth.uid() = user_id);

-- Users can only see their own audit logs
DROP POLICY IF EXISTS wallet_audit_select ON wallet_connection_audit;
CREATE POLICY wallet_audit_select ON wallet_connection_audit
  FOR SELECT USING (auth.uid() = user_id);

-- Insert allowed for authenticated users (their own records)
DROP POLICY IF EXISTS wallet_audit_insert ON wallet_connection_audit;
CREATE POLICY wallet_audit_insert ON wallet_connection_audit
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's active non-custodial wallet
CREATE OR REPLACE FUNCTION get_active_user_wallet(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  wallet_type wallet_type,
  wallet_name TEXT,
  nwc_connection_encrypted TEXT,
  nwc_relay_url TEXT,
  nwc_pubkey TEXT,
  permissions JSONB,
  connection_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uw.id,
    uw.wallet_type,
    uw.wallet_name,
    uw.nwc_connection_encrypted,
    uw.nwc_relay_url,
    uw.nwc_pubkey,
    uw.permissions,
    uw.connection_status
  FROM user_wallets uw
  WHERE uw.user_id = p_user_id
    AND uw.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to disconnect user's wallet
CREATE OR REPLACE FUNCTION disconnect_user_wallet(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE user_wallets
  SET 
    is_active = false,
    connection_status = 'disconnected',
    updated_at = NOW()
  WHERE user_id = p_user_id AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE user_wallets IS 'Stores non-custodial wallet connections (NWC) for users';
COMMENT ON TABLE wallet_connection_audit IS 'Audit log for all wallet connection and payment events';
COMMENT ON COLUMN user_wallets.nwc_connection_encrypted IS 'NWC connection string encrypted client-side - contains secret key';
COMMENT ON COLUMN user_wallets.nwc_pubkey IS 'Wallet public key for identification (not secret)';
COMMENT ON COLUMN profiles.wallet_prompt_dismissed IS 'Whether user has dismissed the "connect your wallet" prompt';
