-- Add foreign key relationship from transactions.user_id to profiles.id
-- This enables PostgREST embedded queries like: profiles:user_id(email,name)

-- Add the foreign key constraint
ALTER TABLE transactions
ADD CONSTRAINT transactions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

