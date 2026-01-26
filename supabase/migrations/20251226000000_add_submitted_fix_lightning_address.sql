-- Add Lightning address field for anonymous fix submissions
-- This allows anonymous users to provide a Lightning address to receive rewards
-- when their fix submission is approved

-- Add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' 
    AND column_name = 'submitted_fix_lightning_address'
  ) THEN
    ALTER TABLE posts ADD COLUMN submitted_fix_lightning_address TEXT;
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN posts.submitted_fix_lightning_address IS 
  'Lightning address (user@domain.com) or invoice for anonymous fix submissions. Used to pay reward when fix is approved.';

