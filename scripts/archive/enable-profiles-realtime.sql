-- Enable real-time updates for the profiles table
-- This allows the app to receive real-time notifications when profiles are updated

-- Add profiles table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Verify the table was added
SELECT 
  schemaname, 
  tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'profiles';

