-- Create the database trigger for email notifications
-- This trigger fires when a post's under_review status changes to true
-- It now handles routing notifications for anonymous posts to an admin.

CREATE OR REPLACE FUNCTION notify_fix_submission()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    poster_email TEXT;
    poster_name TEXT;
    fixer_name TEXT;
    post_title TEXT;
    payload_subject TEXT; -- Renamed from 'subject' to avoid conflict if 'subject' is a column name
    notification_payload JSONB;
BEGIN
    -- Only proceed if under_review changed to true
    IF NEW.under_review = TRUE AND (OLD.under_review IS NULL OR OLD.under_review = FALSE) THEN
        
        post_title := NEW.title;
        fixer_name := NEW.submitted_fix_by_name; -- This is the name of the person who SUBMITTED the fix

        IF NEW.user_id IS NULL THEN -- This post was created anonymously
            poster_email := 'brianmurray03@gmail.com'; -- Hardcoded admin email
            poster_name := 'Admin Reviewer'; -- Name for the email greeting
            payload_subject := '[ADMIN REVIEW] Fix Submitted: ' || COALESCE(post_title, 'Untitled Post');
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
                    -- Log to trigger_logs if user not found, then use a default or skip
                    -- For now, let's use a placeholder if user not found, or you could choose to RETURN NEW to skip.
                    RAISE NOTICE 'User ID % not found in auth.users for post ID %.', NEW.user_id, NEW.id;
                    poster_name := 'Valued User';
                    poster_email := NULL; -- Will be caught by the check below
                END IF;

            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Error fetching user details for user_id: %, error: %', NEW.user_id, SQLERRM;
                -- Decide how to handle: skip notification or send to a default? For now, set email to NULL.
                poster_name := 'Valued User';
                poster_email := NULL; 
            END;

            -- If after all that, poster_email is still NULL for a non-anonymous post, skip.
            IF poster_email IS NULL THEN
                RAISE NOTICE 'Could not determine poster_email for user_id: %, skipping notification for post %', NEW.user_id, NEW.id;
                RETURN NEW;
            END IF;
            
            payload_subject := 'Fix submitted for: ' || COALESCE(post_title, 'Untitled Post');
        END IF;
        
        -- Construct the payload for the notification_queue
        notification_payload := jsonb_build_object(
            'type', 'fix_submitted_for_review',
            'data', jsonb_build_object(
                'postId', NEW.id,
                'posterEmail', poster_email,
                'posterName', poster_name,
                'fixerName', fixer_name,
                'postTitle', post_title,
                'emailSubject', payload_subject 
            )
        );
        
        -- Insert into notification_queue
        INSERT INTO notification_queue (payload) VALUES (notification_payload);
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

-- Grant necessary permissions (if not already granted, good to have)
-- These are for the function itself, not directly for http which is removed
GRANT EXECUTE ON FUNCTION notify_fix_submission() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_fix_submission() TO service_role;

-- Ensure the trigger_logs table exists if you use it for direct logging from trigger
-- CREATE TABLE IF NOT EXISTS trigger_logs (
--    id SERIAL PRIMARY KEY,
--    message TEXT,
--    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );
