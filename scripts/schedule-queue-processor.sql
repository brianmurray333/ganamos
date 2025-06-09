-- Ensure pg_cron is enabled in your Supabase dashboard under Database > Extensions

-- 1. (Optional) Unschedule the job if it already exists to avoid conflicts
-- SELECT cron.unschedule('invoke-process-notification-queue');

-- 2. Schedule the job to run every 5 minutes
-- IMPORTANT: Replace <YOUR_PROJECT_REF> with your actual Supabase project reference
-- IMPORTANT: Replace <YOUR_SUPABASE_SERVICE_ROLE_KEY> with your actual Supabase service role key (from Project Settings > API)
SELECT cron.schedule(
    'invoke-process-notification-queue', -- Job name
    '*/5 * * * *',                       -- Cron schedule: every 5 minutes
    $$
    SELECT net.http_post(
        url:='https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/process-notification-queue',
        headers:='{"Authorization": "Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    );
    $$
);

-- To check if the job is scheduled:
-- SELECT * FROM cron.job;

-- To check the run details:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC;
