-- Migration: Add assigned_to column to posts table
-- Purpose: Allow jobs to be assigned to specific individuals instead of just groups
-- When assigned_to is set:
--   - The job is only visible to the poster and the assigned person
--   - The assigned person gets an email notification (unless they're a child account)
--   - The assigned person's device gets notified of the new job

-- Add the assigned_to column
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id);

-- Add index for faster lookups on assigned_to
CREATE INDEX IF NOT EXISTS idx_posts_assigned_to ON posts(assigned_to);

-- Add a comment explaining the column
COMMENT ON COLUMN posts.assigned_to IS 'When set, this job is privately assigned to a specific user. Only visible to poster and assignee.';

-- Update RLS policies to handle individual assignment visibility
-- Posts should be visible if:
--   1. Public posts (group_id IS NULL AND assigned_to IS NULL)
--   2. Group posts where user is a member (existing logic)
--   3. Posts assigned directly to the user (assigned_to = user.id)
--   4. Posts created by the user (user_id = user.id)

-- Drop the EXISTING select policy by its EXACT name
DROP POLICY IF EXISTS "Users can view public posts or posts from their groups" ON posts;

-- Create new comprehensive select policy that handles assigned_to
CREATE POLICY "Users can view public posts or posts from their groups" ON posts
FOR SELECT USING (
  -- Public posts: no group AND no individual assignment
  (group_id IS NULL AND assigned_to IS NULL)
  -- OR posts created by this user (always see your own)
  OR (user_id = auth.uid())
  -- OR posts assigned directly to this user
  OR (assigned_to = auth.uid())
  -- OR posts in groups where user (or their connected accounts) is approved member
  OR (EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = posts.group_id
    AND group_members.status = 'approved'
    AND (
      group_members.user_id = auth.uid()
      OR group_members.user_id IN (
        SELECT connected_accounts.connected_user_id
        FROM connected_accounts
        WHERE connected_accounts.primary_user_id = auth.uid()
      )
    )
  ))
  -- OR posts created by connected accounts (parent can see child's posts)
  OR (EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE connected_accounts.primary_user_id = auth.uid()
    AND connected_accounts.connected_user_id = posts.user_id
  ))
  -- OR posts assigned to connected accounts (parent can see jobs assigned to child)
  OR (assigned_to IS NOT NULL AND EXISTS (
    SELECT 1 FROM connected_accounts
    WHERE connected_accounts.primary_user_id = auth.uid()
    AND connected_accounts.connected_user_id = posts.assigned_to
  ))
);

