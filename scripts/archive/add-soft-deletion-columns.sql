-- Add soft deletion columns to profiles table
-- This allows us to mark users as deleted without losing data

-- Add status column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'suspended'));

-- Add deleted_at timestamp
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add deleted_by column to track who deleted the account
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Create index for efficient queries of active users
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at);

-- Update existing profiles to have 'active' status
UPDATE profiles SET status = 'active' WHERE status IS NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('status', 'deleted_at', 'deleted_by');
