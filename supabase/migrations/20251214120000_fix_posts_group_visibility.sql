-- Fix posts RLS policy to properly restrict group post visibility
-- BUG: The current "Anyone can view posts" policy allows all users to see posts from any group
-- FIX: Posts should only be visible to group members if they belong to a group

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view posts" ON posts;

-- Create a new SELECT policy that properly restricts group post visibility:
-- 1. Public posts (group_id IS NULL) are visible to everyone
-- 2. Group posts are only visible to approved members of that group
--    (Also allow parents to see posts from groups their connected accounts are members of)
CREATE POLICY "Users can view public posts or posts from their groups" ON posts
  FOR SELECT USING (
    -- Public posts (no group) are visible to everyone
    group_id IS NULL
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
  );

COMMENT ON POLICY "Users can view public posts or posts from their groups" ON posts IS 
  'Posts without a group are public. Group posts are only visible to approved group members or their parent accounts.';

