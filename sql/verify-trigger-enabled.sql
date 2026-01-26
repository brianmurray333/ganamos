-- Verify that the security trigger is enabled and active

-- Check if the trigger exists and is enabled
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing,
    action_orientation,
    action_condition
FROM information_schema.triggers
WHERE trigger_name = 'prevent_protected_field_updates'
  AND event_object_table = 'profiles';

-- Alternative: Check using pg_trigger system catalog
SELECT 
    tgname as trigger_name,
    tgenabled as is_enabled,
    CASE tgenabled
        WHEN 'O' THEN 'Enabled (origin)'
        WHEN 'D' THEN 'Disabled'
        WHEN 'R' THEN 'Replica'
        WHEN 'A' THEN 'Always'
        ELSE 'Unknown'
    END as enabled_status,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'prevent_protected_field_updates'
  AND tgrelid = 'profiles'::regclass;

