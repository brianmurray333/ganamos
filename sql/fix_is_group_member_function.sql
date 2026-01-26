-- Fix is_group_member function to explicitly bypass RLS
-- The function needs to query group_members without triggering RLS policies

DROP FUNCTION IF EXISTS public.is_group_member(UUID, UUID) CASCADE;

-- Recreate with proper RLS bypass
CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Use a direct query that bypasses RLS by using the function's security context
  -- SECURITY DEFINER functions run with the privileges of the function owner (typically postgres)
  -- which bypasses RLS on the table
  RETURN EXISTS (
    SELECT 1 
    FROM public.group_members 
    WHERE group_id = check_group_id 
      AND user_id = check_user_id 
      AND status = 'approved'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO anon;

-- Verify the function was created correctly
SELECT 
    p.proname,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
    AND p.proname = 'is_group_member';

