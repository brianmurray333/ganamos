-- Add username column to profiles table

-- Add username column with unique constraint
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Add constraint to ensure username format (optional - can be removed if too restrictive)
-- ALTER TABLE profiles 
-- ADD CONSTRAINT username_format_check 
-- CHECK (username ~ '^[a-z0-9-]+$' AND length(username) >= 3 AND length(username) <= 30);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'username';
