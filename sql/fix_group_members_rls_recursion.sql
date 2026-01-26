-- First, check what the is_group_member function does
SELECT pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'is_group_member'
LIMIT 1;

-- Fix: Create or replace is_group_member as SECURITY DEFINER function
-- This allows it to bypass RLS when checking membership
CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER -- This bypasses RLS
STABLE -- Function result is stable for same inputs
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM group_members 
    WHERE group_id = p_group_id 
      AND user_id = p_user_id 
      AND status = 'approved'
  );
$$;

-- If the function already exists with a different signature, drop it first
-- DROP FUNCTION IF EXISTS is_group_member(UUID, UUID);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_group_member(UUID, UUID) TO anon;

