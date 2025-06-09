-- Create the database trigger for email notifications
-- This trigger fires when a post's under_review status changes to true
-- It now handles routing notifications for anonymous posts to an admin.

CREATE OR REPLACE FUNCTION notify_fix_submission()
RETURNS TRIGGER AS $$
DECLARE
    poster_email TEXT;
    poster_name TEXT;
    fixer_name TEXT;
    post_title TEXT;
BEGIN
    -- Only proceed if under_review changed to true
    IF NEW.under_review = TRUE AND (OLD.under_review IS NULL OR OLD.under_review = FALSE) THEN
        
        post_title := NEW.title;
        fixer_name := NEW.submitted_fix_by_name; -- This is the name of the person who SUBMITTED the fix

        IF NEW.user_id IS NULL THEN -- This post was created anonymously
            poster_email := 'brianmurray03@gmail.com'; -- Hardcoded admin email
            poster_name := 'Admin Reviewer'; -- Name for the email greeting
        ELSE
            -- Existing logic to get original poster's email and name
            BEGIN
                SELECT 
                    COALESCE(raw_user_meta_data->>'full_name', u.email) as name,
                    u.email
                INTO poster_name, poster_email
                FROM auth.users u
                WHERE id = NEW.user_id;
                
                IF NOT FOUND THEN -- Check if the SELECT returned a row
                    RAISE NOTICE 'User ID % not found in auth.users for post ID %.', NEW.user_id, NEW.id;
                    poster_name := 'Valued User';
                    poster_email := NULL; -- Will be caught by the check below
                END IF;

            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Error fetching user details for user_id: %, error: %', NEW.user_id, SQLERRM;
                poster_name := 'Valued User';
                poster_email := NULL; 
            END;

            -- If after all that, poster_email is still NULL for a non-anonymous post, skip.
            IF poster_email IS NULL THEN
                RAISE NOTICE 'Could not determine poster_email for user_id: %, skipping notification for post %', NEW.user_id, NEW.id;
                RETURN NEW;
            END IF;
            
        END IF;
        
        -- Insert into notification_queue using the actual column structure
        -- Adjust these column names to match your actual table structure!
        INSERT INTO notification_queue (
            post_id, 
            poster_email, 
            poster_name, 
            fixer_name, 
            post_title, 
            created_at
        ) VALUES (
            NEW.id,
            poster_email,
            poster_name,
            fixer_name,
            post_title,
            NOW()
        );
        
        RAISE NOTICE 'Notification for post % queued. Admin review: %. Target email: %', 
            NEW.id, 
            (CASE WHEN NEW.user_id IS NULL THEN 'YES' ELSE 'NO' END),
            poster_email;
            
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate or ensure the trigger exists
DROP TRIGGER IF EXISTS send_fix_notification_trigger ON posts;
CREATE TRIGGER send_fix_notification_trigger
    AFTER UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_fix_submission();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_fix_submission() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_fix_submission() TO service_role;
