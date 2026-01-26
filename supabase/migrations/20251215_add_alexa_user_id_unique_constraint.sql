-- Add UNIQUE constraint on user_id for alexa_linked_accounts
-- This allows upsert operations to work correctly (one Alexa link per user)

-- First drop the existing index (we'll replace it with a unique constraint)
DROP INDEX IF EXISTS idx_alexa_linked_accounts_user_id;

-- Add unique constraint on user_id
ALTER TABLE alexa_linked_accounts 
  ADD CONSTRAINT alexa_linked_accounts_user_id_unique UNIQUE (user_id);
