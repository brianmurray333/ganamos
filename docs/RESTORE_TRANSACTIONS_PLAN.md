# 🔄 Transaction Data Recovery Plan

**Backup Date**: October 24, 2025  
**Data Loss Date**: October 28-30, 2025  
**Missing Transactions**: ~151+ transactions

## Recovery Strategy

### Step 1: Backup Current State
Before making any changes, create a backup of current state:

```sql
-- In Supabase SQL Editor, create backup of current transactions
CREATE TABLE transactions_backup_20251030 AS 
SELECT * FROM transactions;
```

### Step 2: Load the October 24 Backup
The method depends on your backup format:

#### If it's a Supabase SQL Dump:
```bash
# Restore just the transactions table
psql -h <host> -U postgres -d postgres -f backup_2025-10-24.sql
```

#### If it's a .sql file with transactions data:
```sql
-- Run in SQL Editor after extracting transactions data
-- Make sure to handle conflicts properly
```

#### If it's a .csv export:
```sql
-- Use Supabase import feature or
COPY transactions FROM '/path/to/backup.csv' WITH CSV HEADER;
```

### Step 3: Merge Data Carefully
After loading the backup, you need to merge:

1. **Keep transactions from backup** (Oct 24 and earlier)
2. **Keep recent transactions** (the 6 from Oct 28-30)
3. **Avoid duplicates** (use INSERT ... ON CONFLICT)

### Step 4: Recovery SQL Script
Run this after loading the backup to merge safely:

```sql
-- First, identify any duplicate transactions
SELECT 
  user_id, 
  type, 
  amount, 
  created_at, 
  COUNT(*) as duplicates
FROM transactions
GROUP BY user_id, type, amount, created_at
HAVING COUNT(*) > 1;

-- If we have transactions table from backup with different name
-- Let's say it's called 'transactions_backup'
INSERT INTO transactions (id, user_id, type, amount, status, memo, created_at, updated_at, r_hash_str, payment_request, payment_hash)
SELECT 
  id, 
  user_id, 
  type, 
  amount, 
  status, 
  memo, 
  created_at, 
  updated_at, 
  r_hash_str, 
  payment_request, 
  payment_hash
FROM transactions_backup
WHERE id NOT IN (SELECT id FROM transactions)
  AND created_at <= '2025-10-28';  -- Only restore pre-deletion data

-- Verify the restore
SELECT COUNT(*) as total_transactions FROM transactions;
SELECT COUNT(DISTINCT user_id) as users_with_transactions FROM transactions;

-- Check balances match
SELECT 
  p.email,
  p.balance as profile_balance,
  (
    SELECT COALESCE(SUM(CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END), 0)
    FROM transactions t
    WHERE t.user_id = p.id AND t.status = 'completed'
  ) as calculated_balance,
  p.balance - (
    SELECT COALESCE(SUM(CASE 
      WHEN type = 'deposit' THEN amount
      WHEN type = 'withdrawal' THEN -amount
      WHEN type = 'internal' THEN amount
      ELSE 0
    END), 0)
    FROM transactions t
    WHERE t.user_id = p.id AND t.status = 'completed'
  ) as discrepancy
FROM profiles p
WHERE p.balance > 0
ORDER BY discrepancy DESC;
```

### Step 5: Verify Data Integrity
After restoration, verify:

1. Transaction counts match expected numbers
2. User balances reconcile with transaction sums
3. No orphaned transactions (user_id references valid profiles)
4. Activities still reference valid transactions

### Step 6: Clean Up
```sql
-- Drop backup tables once verified
DROP TABLE IF EXISTS transactions_backup_20251030;
DROP TABLE IF EXISTS transactions_backup;  -- If we imported backup to this
```

## Critical Notes

⚠️ **Important**:
- Test this in a staging environment first if possible
- The 6 recent transactions (Oct 28-30) will remain
- Any transactions created between Oct 24-28 that weren't in backup are lost
- This will NOT restore data that was created after the backup date (Oct 24)

## Prevention for Future

After recovery:
1. Set up automated daily backups
2. Implement soft deletes instead of hard deletes
3. Add audit logging for all DELETE operations
4. Monitor transaction table row counts
5. Add alerts for unusual data loss

## Next Steps

1. Tell me your backup file location and format
2. I'll create a custom restore script for your specific situation
3. We'll do a test restore in a safe environment if possible
4. Then restore to production

---

**Status**: Awaiting backup file location and format

