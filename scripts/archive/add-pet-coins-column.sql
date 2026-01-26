-- Add pet_coins column to profiles table
-- This tracks coins earned that can be used for pet care (separate from balance)

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pet_coins INTEGER NOT NULL DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN profiles.pet_coins IS 'Coins earned for pet care. Separate from balance to allow spending balance while keeping pet coins.';

-- Create index for faster lookups (optional, but good for performance)
CREATE INDEX IF NOT EXISTS idx_profiles_pet_coins ON profiles(pet_coins) WHERE pet_coins > 0;

