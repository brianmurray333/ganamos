-- Backfill usernames for existing profiles

-- Function to generate username from name
CREATE OR REPLACE FUNCTION generate_username(full_name TEXT, user_id UUID)
RETURNS TEXT AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    counter INTEGER := 0;
    name_parts TEXT[];
BEGIN
    -- Handle null or empty names
    IF full_name IS NULL OR trim(full_name) = '' THEN
        base_username := 'user-' || substring(user_id::text from 1 for 8);
    ELSE
        -- Split name into parts and create base username
        name_parts := string_to_array(lower(trim(full_name)), ' ');
        
        IF array_length(name_parts, 1) = 1 THEN
            -- Single name: use as-is
            base_username := name_parts[1];
        ELSE
            -- Multiple names: firstname-lastname
            base_username := name_parts[1] || '-' || name_parts[array_length(name_parts, 1)];
        END IF;
        
        -- Clean up the username: remove special characters, keep only alphanumeric and hyphens
        base_username := regexp_replace(base_username, '[^a-z0-9-]', '', 'g');
        
        -- Ensure it's not empty after cleaning
        IF length(base_username) < 3 THEN
            base_username := 'user-' || substring(user_id::text from 1 for 8);
        END IF;
    END IF;
    
    -- Check for uniqueness and add counter if needed
    final_username := base_username;
    
    WHILE EXISTS (SELECT 1 FROM profiles WHERE username = final_username) LOOP
        counter := counter + 1;
        final_username := base_username || '-' || counter;
    END LOOP;
    
    RETURN final_username;
END;
$$ LANGUAGE plpgsql;

-- Backfill usernames for all profiles that don't have one
UPDATE profiles 
SET username = generate_username(name, id::uuid)
WHERE username IS NULL;

-- Drop the helper function
DROP FUNCTION generate_username(TEXT, UUID);

-- Show results
SELECT id, name, username 
FROM profiles 
WHERE username IS NOT NULL 
ORDER BY created_at 
LIMIT 10;
