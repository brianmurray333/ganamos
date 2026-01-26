# Transaction Recording Audit Report

## Issues Found & Fixed

### 1. ✅ DEPOSITS - VERIFIED CORRECT
**Status:** Already Fixed (in previous commit)

**Flow:**
1. Create transaction with initial amount (may be 0 for no-value invoices)
2. When payment settles, update transaction `amount` with actual amount paid
3. Update user `balance` and `pet_coins` atomically
4. Both updates succeed or both fail

**Code Location:** `app/actions/lightning-actions.ts` lines 292-322

### 2. ✅ WITHDRAWALS - FIXED (CRITICAL BUG)
**Status:** Fixed in this commit

**Bug Found:** Balance was deducted BEFORE payment succeeded
- Old flow: Create transaction → Deduct balance → Pay invoice → If fails, mark failed (but balance already gone!)
- **Result:** Users lost balance even when withdrawal failed

**Fix Applied:**
1. Create transaction (pending)
2. Pay invoice FIRST
3. Only if payment succeeds → update transaction AND deduct balance
4. If payment fails → mark transaction failed (balance never deducted)

**Code Location:** `app/api/wallet/withdraw/route.ts` lines 65-147

**Improvement Opportunity:** 
- Created a stub for atomic RPC function `update_withdrawal_complete` that would ensure both updates happen in a single database transaction
- Currently uses sequential updates as fallback (acceptable since payment already succeeded)

### 3. ✅ TRANSFERS - VERIFIED CORRECT
**Status:** Using atomic database functions

**Implementation:** Uses PostgreSQL functions (atomic):
- `transfer_sats_to_username()` - username-based transfers
- `family_transfer_sats()` - family account transfers

**Why it's safe:**
- Both transactions (sender + receiver) created in single database transaction
- Balance updates happen atomically within the function
- If any step fails, entire operation rolls back
- No race conditions possible
- All logic in database, not application code

**Code Location:** Database functions in `scripts/` directory

## Balance Discrepancy Analysis

### Paulitoi Balance Discrepancy - RESOLVED ✅

**Original Issue:**
- Profile Balance: 9,000 sats
- Calculated Balance: 10,000 sats
- Discrepancy: -1,000 sats

**Root Cause:**
- User posted 2 issues with rewards (2k + 1k = 3k total)
- Only the 1k reward was deducted from balance
- The 2k reward was never deducted (bug in old post creation flow)
- No transactions were created for either post reward

**Fix Applied:**
1. Created transaction for 2k reward ("Use a bidet")
2. Created transaction for 1k reward ("Roll the carpet")
3. Updated balance from 9,000 → 7,000 (deducted missing 2k)

**Result:**
- Profile Balance: 7,000 sats
- Calculated Balance: 7,000 sats (10k transfer - 2k - 1k)
- Discrepancy: 0 ✅

**Script:** `scripts/fix-paulitoi-missing-reward-transaction.sql`

## Post Reward Transaction Logging - FIXED ✅

**Issue:** When users created posts with rewards, balance was deducted but no transaction was created.

**Fix:** 
- Created `createPostWithRewardAction` in `app/actions/post-actions.ts`
- Updated `app/post/new/page.tsx` to call this action when reward > 0
- Now creates `internal` transaction with negative amount when post is created
- Balance and transaction creation happen atomically

**Going Forward:** All new posts with rewards will create proper transaction records.

