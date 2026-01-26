-- Clean up ALL existing RLS policies on transactions table and create new ones

-- Drop ALL existing policies (including the old ones that weren't dropped)
DROP POLICY IF EXISTS "Users can view their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create transactions for themselves and connected acco" ON transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow individual access" ON transactions;
DROP POLICY IF EXISTS "Allow users to view their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow users to create their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to view their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to create their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow users to view own and connected account transactions" ON transactions;
DROP POLICY IF EXISTS "Allow users to create own and connected account transactions" ON transactions;
DROP POLICY IF EXISTS "Allow users to update own and connected account transactions" ON transactions;

-- Verify all policies are dropped
SELECT 'Policies after cleanup:' as status;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'transactions';

-- Create ONE comprehensive SELECT policy that handles all cases
CREATE POLICY "transactions_select_policy"
ON transactions
FOR SELECT
USING (
  -- User can see their own transactions
  auth.uid() = user_id
  OR
  -- Primary user can see transactions of their connected accounts
  EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = user_id
  )
  OR
  -- Connected user can see transactions of their primary account  
  EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE connected_user_id = auth.uid() 
    AND primary_user_id = user_id
  )
);

-- Create ONE comprehensive INSERT policy
CREATE POLICY "transactions_insert_policy"
ON transactions
FOR INSERT
WITH CHECK (
  -- User can create transactions for themselves
  auth.uid() = user_id
  OR
  -- Primary user can create transactions for their connected accounts
  EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = user_id
  )
);

-- Create ONE comprehensive UPDATE policy
CREATE POLICY "transactions_update_policy"
ON transactions
FOR UPDATE
USING (
  -- User can update their own transactions
  auth.uid() = user_id
  OR
  -- Primary user can update transactions of their connected accounts
  EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = user_id
  )
)
WITH CHECK (
  -- Same conditions for the updated data
  auth.uid() = user_id
  OR
  EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE primary_user_id = auth.uid() 
    AND connected_user_id = user_id
  )
);

-- Verify the final policies
SELECT 'Final policies:' as status;
SELECT policyname, permissive, cmd, 
       CASE 
         WHEN length(qual) > 100 THEN left(qual, 100) || '...' 
         ELSE qual 
       END as qual_preview
FROM pg_policies 
WHERE tablename = 'transactions'
ORDER BY cmd, policyname;
