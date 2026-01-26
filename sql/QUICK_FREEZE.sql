-- QUICK FREEZE - Run this NOW in Supabase SQL Editor
UPDATE profiles 
SET status = 'suspended', updated_at = NOW()
WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

-- Verify it worked
SELECT id, email, status FROM profiles WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

