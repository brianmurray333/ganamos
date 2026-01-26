-- Critical query: Check for CASCADE delete rules
-- This is likely the cause of transaction loss

SELECT
    tc.constraint_name,
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '⚠️ DANGER: Deletes will cascade!'
        WHEN rc.delete_rule = 'SET NULL' THEN '⚠️ WARNING: user_id will be set to NULL'
        WHEN rc.delete_rule = 'SET DEFAULT' THEN '⚠️ WARNING: user_id will be set to default'
        ELSE 'Safe: NO ACTION'
    END as severity
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'transactions'
    AND tc.constraint_type = 'FOREIGN KEY';

