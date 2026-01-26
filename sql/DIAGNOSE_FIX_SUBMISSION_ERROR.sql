-- Diagnostic queries to help diagnose the "Unauthorized post update" error
-- when anniecarruth@gmail.com tries to submit a fix

-- 1. Find the user ID for anniecarruth@gmail.com
SELECT 
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'anniecarruth@gmail.com';

-- 2. Check the post that was being updated (from the error log: post ID 5a2265d8-bb31-4813-b4cf-8da08be8d94b)
SELECT 
  id,
  user_id as post_owner_id,
  title,
  group_id,
  under_review,
  submitted_fix_by_id,
  fixed,
  created_at
FROM posts
WHERE id = '5a2265d8-bb31-4813-b4cf-8da08be8d94b';

-- 3. Check if the user is the post owner
SELECT 
  p.id as post_id,
  p.user_id as post_owner_id,
  u.id as user_id,
  u.email,
  CASE 
    WHEN p.user_id = u.id THEN 'YES - User is post owner'
    ELSE 'NO - User is not post owner'
  END as is_post_owner
FROM posts p
CROSS JOIN auth.users u
WHERE p.id = '5a2265d8-bb31-4813-b4cf-8da08be8d94b'
  AND u.email = 'anniecarruth@gmail.com';

-- 4. Check if the user is a connected account (parent) of the post owner
SELECT 
  ca.id,
  ca.primary_user_id,
  ca.connected_user_id,
  p.user_id as post_owner_id,
  CASE 
    WHEN ca.primary_user_id = u.id AND ca.connected_user_id = p.user_id THEN 'YES - User is connected account (parent)'
    ELSE 'NO - User is not a connected account'
  END as is_connected_account
FROM posts p
CROSS JOIN auth.users u
LEFT JOIN connected_accounts ca ON ca.primary_user_id = u.id AND ca.connected_user_id = p.user_id
WHERE p.id = '5a2265d8-bb31-4813-b4cf-8da08be8d94b'
  AND u.email = 'anniecarruth@gmail.com';

-- 5. Check if the user is a group admin for the post's group
SELECT 
  gm.id,
  gm.group_id,
  gm.user_id,
  gm.role,
  gm.status,
  p.group_id as post_group_id,
  CASE 
    WHEN gm.role = 'admin' AND gm.status = 'approved' AND gm.group_id = p.group_id THEN 'YES - User is group admin'
    ELSE 'NO - User is not a group admin'
  END as is_group_admin
FROM posts p
CROSS JOIN auth.users u
LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = p.group_id
WHERE p.id = '5a2265d8-bb31-4813-b4cf-8da08be8d94b'
  AND u.email = 'anniecarruth@gmail.com';

-- 6. Check current RLS policies on posts table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'posts'
  AND cmd = 'UPDATE';

-- 7. Check the trigger function
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'check_group_admin_post_update'
  AND n.nspname = 'public';

-- 8. Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'posts'
  AND trigger_name = 'enforce_group_admin_post_update';

-- 9. Comprehensive check: All authorization checks in one query
WITH user_info AS (
  SELECT id as user_id, email
  FROM auth.users
  WHERE email = 'anniecarruth@gmail.com'
),
post_info AS (
  SELECT id, user_id as post_owner_id, group_id, title
  FROM posts
  WHERE id = '5a2265d8-bb31-4813-b4cf-8da08be8d94b'
)
SELECT 
  ui.email,
  pi.id as post_id,
  pi.title as post_title,
  CASE WHEN ui.user_id = pi.post_owner_id THEN 'YES' ELSE 'NO' END as is_post_owner,
  CASE WHEN EXISTS (
    SELECT 1 FROM connected_accounts ca
    WHERE ca.primary_user_id = ui.user_id
    AND ca.connected_user_id = pi.post_owner_id
  ) THEN 'YES' ELSE 'NO' END as is_connected_account,
  CASE WHEN EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.user_id = ui.user_id
    AND gm.group_id = pi.group_id
    AND gm.role = 'admin'
    AND gm.status = 'approved'
  ) THEN 'YES' ELSE 'NO' END as is_group_admin,
  CASE WHEN ui.user_id IS NOT NULL THEN 'YES' ELSE 'NO' END as is_authenticated
FROM user_info ui
CROSS JOIN post_info pi;


