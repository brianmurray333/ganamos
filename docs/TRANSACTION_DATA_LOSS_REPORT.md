# 🚨 Transaction Data Loss Report

**Date**: October 30, 2025  
**Severity**: CRITICAL

## Summary

The transactions table has experienced **massive data loss**. Only **6 transactions** remain in the database, and they all appear to be orphaned with `undefined` user_id values.

## Current State

### Total Transactions
- **Only 6 transactions** in the entire database
- All are `internal` type
- All have `status = completed`
- All created between **Oct 28-30, 2025**
- All have **undefined** user_id (orphaned)

### Users Affected
1. **admin@example.com** - Has 117,447 sats balance but only 3 transactions visible
2. **paulitoi@stakwork.com** - Has 1,000 sats balance, 0 transactions
3. **jimp79@gmail.com** - Has 1,000 sats balance, 0 transactions
4. **child-d60a269f-b1a9-4030-96d5-7ddc3ca5e369@ganamos.app** - Has 23,497 sats balance, 0 transactions
5. **paulitoi@gmail.com** - Has 8,000 sats balance, 0 transactions

### Brian's Remaining Transactions
1. Transfer to @kit - 1,000 sats (Oct 30)
2. Transfer to @brynn - 3,000 sats (Oct 28)
3. Transfer to @charlotte - 11,000 sats (Oct 28)

## Evidence of Deletion

### Timing
- All remaining transactions are from the past **2-3 days** (Oct 28-30)
- Previous transaction history appears completely wiped
- Date range span: only 2 days of data

### Balance Discrepancy
- Brian's profile balance: **117,447 sats**
- Brian's calculated balance from remaining transactions: **-15,000 sats**
- **Discrepancy: 132,447 sats**

This indicates hundreds or thousands of missing transactions.

### Orphaned Transactions
All 6 remaining transactions have `user_id = undefined`, suggesting:
1. The transactions were created with invalid user IDs
2. The user profiles were deleted but transactions remained orphaned
3. There's a bug in transaction creation that's setting user_id incorrectly

## Possible Causes

1. **Manual Deletion** - Someone ran `DELETE FROM transactions` or `TRUNCATE transactions`
2. **Migration Gone Wrong** - A database migration may have deleted data
3. **Script Execution** - A cleanup or migration script may have run incorrectly
4. **Foreign Key Cascade** - If user profiles were deleted, cascading deletes may have removed transactions
5. **RLS Policy Bug** - Row Level Security policies may have hidden/removed data unexpectedly

## Impact

### Critical
- **No transaction history** for users with substantial balances
- **Audit trail completely lost** for financial records
- **Balance calculations** cannot be verified
- **User trust** compromised

### Financial
- At least **150,000+ sats** in unverified balances
- No way to reconcile balances without transaction history
- Potential for fraud or inconsistencies

## Immediate Actions Needed

1. **Check Supabase logs** for DELETE/TRUNCATE operations
2. **Search git history** for recent migration scripts
3. **Check cron jobs** or scheduled tasks that might have deleted data
4. **Review recent deployments** that may have triggered data loss
5. **Implement database backups** if not already in place
6. **Create soft-delete mechanism** instead of hard deletes

## Recommendations

### Short Term
- [ ] Investigate Supabase audit logs
- [ ] Check recent script executions
- [ ] Verify no further data loss
- [ ] Add monitoring/alerting for transaction table

### Long Term
- [ ] Implement daily automated backups
- [ ] Add transaction logging/audit trail
- [ ] Create point-in-time recovery capabilities
- [ ] Implement soft deletion for all financial data
- [ ] Add transaction count monitoring
- [ ] Create alerts for unusual data loss

## Files Created

1. `scripts/analyze-missing-transactions.js` - Analysis script
2. `scripts/analyze-missing-transactions.sql` - SQL analysis queries
3. This report

## Next Steps

1. Run the analysis scripts to get detailed breakdowns
2. Contact Supabase support about the data loss
3. Investigate backup availability
4. Plan data recovery if possible
5. Document incident for compliance/audit purposes

---

**⚠️ THIS IS A CRITICAL INCIDENT REQUIRING IMMEDIATE ATTENTION**

