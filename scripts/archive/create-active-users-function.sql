-- Create a function to get active users in the last 24 hours
-- This function counts users who had any activity (transactions, posts created, posts fixed)

CREATE OR REPLACE FUNCTION get_active_users_last_24h(since_timestamp timestamptz)
RETURNS TABLE(user_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT u.user_id 
  FROM (
    -- Users who made transactions
    SELECT t.user_id::uuid as user_id
    FROM transactions t
    WHERE t.created_at >= since_timestamp
    
    UNION
    
    -- Users who created posts  
    SELECT p.user_id::uuid as user_id
    FROM posts p
    WHERE p.created_at >= since_timestamp
    AND p.user_id IS NOT NULL
    
    UNION
    
    -- Users who fixed posts
    SELECT p.fixed_by::uuid as user_id
    FROM posts p
    WHERE p.fixed_at >= since_timestamp
    AND p.fixed_by IS NOT NULL
  ) u
  WHERE u.user_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
