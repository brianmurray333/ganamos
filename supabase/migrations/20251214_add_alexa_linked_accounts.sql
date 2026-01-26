-- Migration: Add Alexa Linked Accounts table
-- Purpose: Store OAuth tokens and group selection for Alexa skill integration

-- Create alexa_linked_accounts table
CREATE TABLE IF NOT EXISTS alexa_linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- Alexa user identifier (from Amazon account linking)
  alexa_user_id TEXT UNIQUE,
  -- Selected group for this Alexa connection
  selected_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  -- OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  -- OAuth client info for validation
  client_id TEXT NOT NULL,
  -- Audit timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_used_at TIMESTAMPTZ
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_alexa_linked_accounts_user_id 
  ON alexa_linked_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_alexa_linked_accounts_access_token 
  ON alexa_linked_accounts(access_token);

CREATE INDEX IF NOT EXISTS idx_alexa_linked_accounts_refresh_token 
  ON alexa_linked_accounts(refresh_token);

-- Create authorization codes table for OAuth flow
CREATE TABLE IF NOT EXISTS alexa_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  -- Selected group for this linking session
  selected_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  -- Code expires after 10 minutes (OAuth standard)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  -- Track if code has been used (can only be used once)
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alexa_auth_codes_code 
  ON alexa_auth_codes(code);

CREATE INDEX IF NOT EXISTS idx_alexa_auth_codes_expires 
  ON alexa_auth_codes(expires_at);

-- RLS Policies for alexa_linked_accounts
ALTER TABLE alexa_linked_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their own Alexa connections
CREATE POLICY "Users can view own alexa connections" ON alexa_linked_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own Alexa connections
CREATE POLICY "Users can create own alexa connections" ON alexa_linked_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own Alexa connections
CREATE POLICY "Users can update own alexa connections" ON alexa_linked_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own Alexa connections
CREATE POLICY "Users can delete own alexa connections" ON alexa_linked_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for alexa_auth_codes (server-side only, no user access)
ALTER TABLE alexa_auth_codes ENABLE ROW LEVEL SECURITY;

-- No direct user access to auth codes - only via API routes with service role

-- Add comments for documentation
COMMENT ON TABLE alexa_linked_accounts IS 'Stores OAuth tokens and preferences for Alexa skill integration';
COMMENT ON COLUMN alexa_linked_accounts.alexa_user_id IS 'Amazon Alexa user ID from account linking (populated after first use)';
COMMENT ON COLUMN alexa_linked_accounts.selected_group_id IS 'The group the user has selected for Alexa job management';
COMMENT ON COLUMN alexa_linked_accounts.access_token IS 'JWT access token for Alexa API requests';
COMMENT ON COLUMN alexa_linked_accounts.refresh_token IS 'Refresh token to obtain new access tokens';

COMMENT ON TABLE alexa_auth_codes IS 'Temporary OAuth authorization codes for Alexa account linking';
COMMENT ON COLUMN alexa_auth_codes.code IS 'One-time authorization code exchanged for tokens';

