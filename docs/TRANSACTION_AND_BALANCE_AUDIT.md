# Transaction and Balance Audit Documentation

## ✅ Confirmed: Negative Transactions (Balance Deductions)

All of these operations **update profile balance AND log negative transactions**:

### 1. **POSTS (with rewards)**
- **File**: `app/actions/post-actions.ts` → `createPostWithRewardAction()`
- **Transaction**: `type: 'internal'`, `amount: -reward` (negative)
- **Balance Update**: `balance = balance - reward`
- **Status**: ✅ Confirmed - Creates transaction first, then updates balance

### 2. **WITHDRAWALS**
- **File**: `app/api/wallet/withdraw/route.ts`
- **Transaction**: `type: 'withdrawal'`, `amount: amount` (positive, but subtracted in audit)
- **Balance Update**: `balance = balance - amount` (after payment succeeds)
- **Status**: ✅ Confirmed - Payment happens first, then transaction updated and balance deducted
- **Note**: Transaction amount is positive, but audit calculation subtracts it: `sum - tx.amount`

### 3. **INTERNAL SENDS** (User-to-user transfers)
- **File**: Database functions `transfer_sats_to_username()` and `family_transfer_sats()`
- **Transaction**: `type: 'internal'`, `amount: -p_amount` (negative)
- **Balance Update**: `balance = balance - p_amount` (sender)
- **Status**: ✅ Confirmed - Uses atomic database functions, both transactions created in single DB transaction

### 4. **DONATIONS**
- **File**: `app/actions/donation-actions.ts` → `checkDonationPayment()`
- **Transaction**: `type: 'internal'`, `amount: -donation.amount` (negative)
- **Balance Update**: `balance = balance - donation.amount`
- **Status**: ✅ Confirmed - Only for registered users (`donor_user_id` exists)

---

## ✅ Confirmed: Positive Transactions (Balance Additions)

All of these operations **update profile balance AND log positive transactions**:

### 1. **FIXES** (earning rewards)
- **File**: `app/actions/post-actions.ts` → `createFixRewardAction()`
- **Transaction**: `type: 'internal'`, `amount: reward` (positive)
- **Balance Update**: `balance = balance + reward`
- **Status**: ✅ Confirmed - Creates transaction first, then updates balance

### 2. **DEPOSITS**
- **File**: `app/actions/lightning-actions.ts` → `checkDepositStatus()`
- **Transaction**: `type: 'deposit'`, `amount: actualAmountPaid` (positive)
- **Balance Update**: `balance = balance + actualAmountPaid`
- **Status**: ✅ Confirmed - Updates transaction amount with actual paid amount, then updates balance
- **Note**: Also updates `pet_coins` with same amount

### 3. **INTERNAL RECEIVES** (User-to-user transfers)
- **File**: Database functions `transfer_sats_to_username()` and `family_transfer_sats()`
- **Transaction**: `type: 'internal'`, `amount: p_amount` (positive)
- **Balance Update**: `balance = balance + p_amount` (receiver)
- **Status**: ✅ Confirmed - Uses atomic database functions, both transactions created in single DB transaction

---

## Daily Balance Audit Process

### Location
- **File**: `lib/daily-summary.ts` → `performBalanceAudit()`

### How It Works

1. **Fetch All Active Profiles**
   - Gets all users from `profiles` table where `status != 'deleted'`
   - For each profile, fetches the `balance` field

2. **Calculate Balance from Transactions**
   - For each user, fetches all `completed` transactions
   - Calculates balance using this formula:
     ```typescript
     calculatedBalance = transactions.reduce((sum, tx) => {
       if (tx.type === 'deposit') {
         return sum + tx.amount  // Add deposits (positive)
       } else if (tx.type === 'withdrawal') {
         return sum - tx.amount  // Subtract withdrawals (positive amounts)
       } else if (tx.type === 'internal') {
         return sum + tx.amount  // Add internal (can be positive or negative)
       }
       return sum
     }, 0)
     ```

3. **Compare Profile Balance vs Calculated Balance**
   - Calculates: `difference = profile.balance - calculatedBalance`
   - If `difference !== 0`, flags as discrepancy

4. **Report Results**
   - Returns count of users with discrepancies
   - Returns total discrepancy amount (sum of absolute differences)
   - Lists all users with discrepancies (email, profile balance, calculated balance, difference)

### Audit Reliability

The audit checks **two independent sources of truth**:
1. **Profile Balance**: Direct field in `profiles.balance` (updated by application code)
2. **Calculated Balance**: Sum of all `completed` transactions in `transactions` table

If these don't match, it indicates:
- Missing transactions (balance updated but transaction not created)
- Incorrect transaction amounts
- Balance updated incorrectly
- Race conditions or atomicity issues

### Transaction Types in Audit

- **`deposit`**: Always positive, added to balance
- **`withdrawal`**: Always positive, subtracted from balance in calculation
- **`internal`**: Can be positive or negative (already has correct sign)
  - Negative: Post rewards, internal sends, donations
  - Positive: Fix rewards, internal receives

### Notes

- Only counts `status = 'completed'` transactions
- Pending/failed transactions are excluded
- Internal transactions preserve their sign (positive or negative)
- The audit runs daily as part of the admin summary email

