-- is_group_member(group, user) is SECURITY DEFINER and was executable by
-- anon/authenticated, so anyone could call it over the API with arbitrary ids
-- and learn who belongs to a private group. Its only use is the group_members
-- SELECT policy, which only ever asks about the caller.
--
-- Replace that use with a helper that takes no user id (it answers for
-- auth.uid() only), then make is_group_member server-only.

CREATE OR REPLACE FUNCTION public.ganamos_caller_in_group(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND status = 'approved'
  );
$$;
-- RLS policies call it as the querying role, so those roles need EXECUTE.
REVOKE ALL ON FUNCTION public.ganamos_caller_in_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ganamos_caller_in_group(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;
CREATE POLICY "Users can view group members of their groups" ON group_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR ganamos_caller_in_group(group_id)
    -- A parent may read their children's own rows (20261122000000)
    OR EXISTS (
      SELECT 1 FROM connected_accounts ca
      WHERE ca.primary_user_id = auth.uid()
        AND ca.connected_user_id = group_members.user_id
    )
  );

REVOKE ALL ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO service_role;
