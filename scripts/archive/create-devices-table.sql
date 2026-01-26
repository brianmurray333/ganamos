-- Create devices table for storing connected hardware devices
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pairing_code VARCHAR(6) NOT NULL,
  pet_name VARCHAR(50) NOT NULL,
  pet_type VARCHAR(20) NOT NULL CHECK (pet_type IN ('cat', 'dog', 'rabbit', 'squirrel', 'turtle')),
  status VARCHAR(20) NOT NULL DEFAULT 'paired' CHECK (status IN ('paired', 'disconnected', 'offline')),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Create index for pairing code lookups (used during pairing process)
CREATE INDEX IF NOT EXISTS idx_devices_pairing_code ON devices(pairing_code);

-- Enable Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own devices
CREATE POLICY "Users can view their own devices" ON devices
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert devices for themselves
CREATE POLICY "Users can create their own devices" ON devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own devices
CREATE POLICY "Users can update their own devices" ON devices
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own devices
CREATE POLICY "Users can delete their own devices" ON devices
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_devices_updated_at();
