# Critical Security Bugs Fixed

## Summary

Fixed 3 critical security vulnerabilities that could lead to loss of funds:

1. ✅ **Deposit Poller Vulnerability** - Fixed
2. ✅ **Non-Atomic Withdrawal Fallback** - SQL function created
3. ✅ **Session Object Logging** - Fixed

---

## Bug 1: Deposit Poller Vulnerability ✅ FIXED

### Location
`app/actions/lightning-actions.ts:181-270`

### Issue
The `checkDepositStatus` function accepted a `userId` parameter and would use it as a fallback if no session was found. This allowed anyone to call the function with any `userId` and credit transactions to that user's account.

### Fix Applied
1. **Removed `userId` parameter** - Function now only accepts `rHash`
2. **Requires live session** - No fallback to userId parameter
3. **Verifies transaction ownership** - Checks `transaction.user_id === session.user.id` before processing
4. **Added security logging** - Logs unauthorized access attempts

### Changes
- `checkDepositStatus(rHash: string, userId: string)` → `checkDepositStatus(rHash: string)`
- Added session verification before processing
- Added transaction ownership verification
- Updated caller in `app/wallet/deposit/page.tsx` to remove userId parameter

---

## Bug 2: Non-Atomic Withdrawal Fallback ✅ FIXED

### Location
`app/api/wallet/withdraw/route.ts:91-148`

### Issue
The withdrawal code tried to call `update_withdrawal_complete` RPC function, but it didn't exist, so every withdrawal used the non-atomic fallback. This allowed concurrent requests to double-spend balances.

### Fix Applied
1. **Created SQL function** - `scripts/create-update-withdrawal-complete-function.sql`
2. **Atomic operation** - Uses row-level locks (`FOR UPDATE`) to prevent concurrent withdrawals
3. **Balance validation** - Checks `balance >= amount` before deducting
4. **Transaction safety** - All updates happen in a single database transaction

### SQL Function Features
- **Row-level locking** - Prevents concurrent balance updates
- **Balance validation** - Verifies sufficient balance before deducting
- **Transaction ownership** - Verifies transaction belongs to user
- **Atomic updates** - Transaction status and balance update together or not at all
- **Error handling** - Returns JSON with success/error status

### Next Step
**You need to run the SQL function in Supabase:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `scripts/create-update-withdrawal-complete-function.sql`
3. Run the query
4. Verify the function exists: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'update_withdrawal_complete';`

After creating the function, the withdrawal code will use it automatically (no code changes needed).

---

## Bug 3: Session Object Logging ✅ FIXED

### Location
`app/api/wallet/withdraw/route.ts:17`

### Issue
The code logged the entire Supabase session object, which includes bearer tokens that could be exposed in logs.

### Fix Applied
1. **Removed session object logging** - No longer logs `session` object
2. **Safe logging** - Only logs session error messages or user ID (safe information)
3. **No token exposure** - Bearer tokens are never logged

### Changes
- Before: `console.log("[Withdraw API] session:", session, sessionError)`
- After: Logs only error messages or user ID, never the full session object

---

## Additional Improvements

### Updated Key Usage
- Changed `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_API_KEY` in:
  - `app/api/wallet/withdraw/route.ts`
  - `app/actions/lightning-actions.ts`

This ensures all code uses the new secure key instead of the old compromised one.

---

## Testing Recommendations

### After Deploying These Fixes

1. **Test Deposit Poller:**
   - Try to access deposit status without authentication → Should fail
   - Try to access another user's transaction → Should fail with "Unauthorized"
   - Normal deposit flow → Should work correctly

2. **Test Withdrawal:**
   - Create the SQL function in Supabase first
   - Make a withdrawal → Should use the atomic function
   - Check logs → Should not see session objects with tokens

3. **Verify Logs:**
   - Check Vercel/application logs
   - Verify no session objects or bearer tokens are logged
   - Verify security alerts are logged for unauthorized attempts

---

## Deployment Checklist

- [x] Fix deposit poller vulnerability
- [x] Create SQL function for atomic withdrawals
- [x] Fix session logging
- [x] Update key references to use new secret key
- [ ] **TODO: Run SQL function in Supabase Dashboard**
- [ ] Test deposits
- [ ] Test withdrawals
- [ ] Verify logs don't contain tokens
- [ ] Deploy to production

---

## Security Impact

**Before fixes:**
- ❌ Anyone could credit transactions to any user
- ❌ Concurrent withdrawals could double-spend
- ❌ Bearer tokens exposed in logs

**After fixes:**
- ✅ Deposits require authentication and ownership verification
- ✅ Withdrawals are atomic and prevent double-spending
- ✅ No tokens logged

These fixes close the main loss-of-funds paths identified in the security audit.

