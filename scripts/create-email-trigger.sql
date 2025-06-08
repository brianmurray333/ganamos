-- Create the database trigger for email notifications
-- This trigger fires when a post's under_review status changes to true

CREATE OR REPLACE FUNCTION notify_fix_submission()
RETURNS TRIGGER AS $$
DECLARE
    poster_email TEXT;
    poster_name TEXT;
    fixer_name TEXT;
    post_title TEXT;
    function_url TEXT;
    response_status INTEGER;
BEGIN
    -- Only proceed if under_review changed to true
    IF NEW.under_review = TRUE AND (OLD.under_review IS NULL OR OLD.under_review = FALSE) THEN
        
        -- Get the edge function URL
        function_url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/send-fix-notification';
        
        -- Get post details
        post_title := NEW.title;
        fixer_name := NEW.submitted_fix_by_name;
        
        -- Try to get poster email and name from auth.users with error handling
        BEGIN
            SELECT 
                COALESCE(raw_user_meta_data->>'full_name', email) as name,
                email
            INTO poster_name, poster_email
            FROM auth.users 
            WHERE id = NEW.user_id;
            
            -- If we couldn't get the email, log and skip
            IF poster_email IS NULL THEN
                RAISE NOTICE 'Could not find email for user_id: %, skipping notification', NEW.user_id;
                RETURN NEW;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error accessing auth.users for user_id: %, error: %', NEW.user_id, SQLERRM;
            RETURN NEW;
        END;
        
        -- Call the edge function
        BEGIN
            SELECT status INTO response_status
            FROM http((
                'POST',
                function_url,
                ARRAY[http_header('Content-Type', 'application/json'), http_header('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))],
                json_build_object(
                    'postId', NEW.id,
                    'posterEmail', poster_email,
                    'posterName', poster_name,
                    'fixerName', fixer_name,
                    'postTitle', post_title
                )::text
            )::http_request);
            
            RAISE NOTICE 'Email notification sent for post %, response status: %', NEW.id, response_status;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error sending email notification for post %: %', NEW.id, SQLERRM;
        END;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS send_fix_notification_trigger ON posts;
CREATE TRIGGER send_fix_notification_trigger
    AFTER UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_fix_submission();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_fix_submission() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_fix_submission() TO service_role;
