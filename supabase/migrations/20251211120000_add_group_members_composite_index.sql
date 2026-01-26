-- Add composite index on group_members to speed up RLS policy checks and queries
-- This index is optimized for the common query patterns:
-- 1. RLS policy: checking if a user is an approved member of a group
-- 2. Fetching all members of specific groups with a status filter

-- The column order (group_id, user_id, status) is optimal because:
-- - group_id is used in the leading position for "IN (group_ids)" queries
-- - user_id + status are used together in RLS checks
-- - This covers both the RLS EXISTS subquery and the member count queries

CREATE INDEX IF NOT EXISTS idx_group_members_group_user_status 
ON group_members(group_id, user_id, status);

-- Also add an index specifically for user lookups with status (used when fetching user's groups)
CREATE INDEX IF NOT EXISTS idx_group_members_user_status 
ON group_members(user_id, status);

