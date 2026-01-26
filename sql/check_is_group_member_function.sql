-- Check if is_group_member function exists and see its definition
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition,
    p.prosecdef AS security_definer,
    p.proleakproof AS leakproof
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
    AND p.proname = 'is_group_member';

-- Alternative: Get all function details
\df+ is_group_member

-- Check what the function does - list all functions that might query group_members
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
    END AS volatility,
    p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND (
        p.prosrc LIKE '%group_members%'
        OR p.proname LIKE '%group%member%'
    );

