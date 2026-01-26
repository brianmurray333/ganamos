-- Fix RLS policies on transactions table to allow connected accounts to view their transactions

-- First, let's see what policies currently exist
SELECT policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'transactions';

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow individual access" ON transactions;
DROP POLICY IF EXISTS "Allow users to view their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow users to create their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to view their own transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to create their own transactions" ON transactions;

-- Create new comprehensive policies for transactions

-- Policy 1: Allow users to view their own transactions AND transactions for connected accounts
CREATE POLICY "Allow users to view own and connected account transactions"
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

-- Policy 2: Allow users to create transactions for themselves AND for connected accounts
CREATE POLICY "Allow users to create own and connected account transactions"
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

-- Policy 3: Allow users to update their own transactions AND connected account transactions
CREATE POLICY "Allow users to update own and connected account transactions"
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

-- Verify the new policies
SELECT policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'transactions';
