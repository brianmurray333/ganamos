-- Fix posts RLS policy to allow post owners to ALWAYS view their own posts
-- BUG: When viewing a private group post from an email link, the owner gets "Post not found"
-- because the policy only checks group membership, not post ownership.
--
-- The fix adds: post owners can always view their own posts

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view public posts or posts from their groups" ON posts;

-- Create an improved SELECT policy that:
-- 1. Public posts (group_id IS NULL) are visible to everyone
-- 2. Post owners can ALWAYS view their own posts (regardless of group membership)
-- 3. Group posts are visible to approved members of that group
-- 4. Parents can see posts from groups their connected accounts are members of
CREATE POLICY "Users can view public posts or posts from their groups" ON posts
  FOR SELECT USING (
    -- Public posts (no group) are visible to everyone
    group_id IS NULL
    OR
    -- Post owners can ALWAYS view their own posts
    user_id = auth.uid()
    OR
    -- Group posts are visible to approved members of that group
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = posts.group_id
      AND group_members.status = 'approved'
      AND (
        -- User is directly a member
        group_members.user_id = auth.uid()
        OR
        -- User has a connected account that is a member
        group_members.user_id IN (
          SELECT connected_user_id FROM connected_accounts
          WHERE primary_user_id = auth.uid()
        )
      )
    )
    OR
    -- Parents can view posts from their connected accounts
    user_id IN (
      SELECT connected_user_id FROM connected_accounts
      WHERE primary_user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can view public posts or posts from their groups" ON posts IS 
  'Posts visible if: public, owned by user, in user''s group, or owned by connected account.';

