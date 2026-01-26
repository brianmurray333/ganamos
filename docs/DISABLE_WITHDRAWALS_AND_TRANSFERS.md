# Temporarily Disable Withdrawals and Transfers

## ✅ Current Status

**Withdrawals are already disabled** in `app/api/wallet/withdraw/route.ts` (lines 29-33).

However, **internal transfers are still enabled**, which could allow moving funds via:
- Username transfers (`transfer_sats_to_username`)
- Family transfers (`family_transfer_sats`)

---

## 🔴 Recommended: Disable ALL Fund Movement

To fully protect against fund exfiltration, disable:
1. ✅ Withdrawals (already disabled)
2. ⚠️ Internal transfers (username transfers)
3. ⚠️ Family transfers

---

## Implementation Options

### Option 1: Environment Variable (Recommended)

Use an environment variable to control this, making it easy to toggle:

**Add to `.env` or Vercel environment variables:**
```
DISABLE_WITHDRAWALS=true
```

**Update `app/api/wallet/withdraw/route.ts`:**
```typescript
// At the top of the POST function, after authentication
if (process.env.DISABLE_WITHDRAWALS === 'true') {
  return NextResponse.json({ 
    success: false, 
    error: "Withdrawals are temporarily disabled for security maintenance. Please check back soon." 
  }, { status: 503 })
}
```

**Update transfer functions in database:**
```sql
-- Add check at the start of transfer_sats_to_username function
CREATE OR REPLACE FUNCTION transfer_sats_to_username(
  p_from_user_id UUID,
  p_to_username TEXT,
  p_amount INTEGER,
  p_memo TEXT DEFAULT NULL
) RETURNS JSON AS $$
BEGIN
  -- SECURITY: Transfers temporarily disabled
  IF current_setting('app.disable_transfers', true) = 'true' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Transfers are temporarily disabled for security maintenance'
    );
  END IF;
  
  -- ... rest of function
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Set the database setting:**
```sql
ALTER DATABASE postgres SET app.disable_transfers = 'true';
```

---

### Option 2: Hard Disable (Simpler, Less Flexible)

Just keep the current hard disable in the code and add checks to transfer functions.

---

## What to Disable

### 1. Lightning Withdrawals ✅ (Already Disabled)
- Location: `app/api/wallet/withdraw/route.ts`
- Status: Already disabled (lines 29-33)

### 2. Username Transfers ⚠️ (Still Enabled)
- Location: Database function `transfer_sats_to_username`
- Risk: Attacker could transfer to another account they control
- Action: Disable in database function

### 3. Family Transfers ⚠️ (Still Enabled)
- Location: Database function `family_transfer_sats`
- Risk: If attacker has connected accounts, could transfer funds
- Action: Disable in database function

---

## Quick Implementation

### Step 1: Keep Withdrawals Disabled
✅ Already done - withdrawals are disabled in the code

### Step 2: Disable Transfer Functions

Run this SQL in Supabase SQL Editor:

```sql
-- Disable username transfers
CREATE OR REPLACE FUNCTION transfer_sats_to_username(
  p_from_user_id UUID,
  p_to_username TEXT,
  p_amount INTEGER,
  p_memo TEXT DEFAULT NULL
) RETURNS JSON AS $$
BEGIN
  -- SECURITY: Transfers temporarily disabled for security maintenance
  RETURN json_build_object(
    'success', false,
    'error', 'Transfers are temporarily disabled for security maintenance. Please check back soon.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disable family transfers
CREATE OR REPLACE FUNCTION family_transfer_sats(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount INTEGER,
  p_memo TEXT DEFAULT NULL
) RETURNS JSON AS $$
BEGIN
  -- SECURITY: Transfers temporarily disabled for security maintenance
  RETURN json_build_object(
    'success', false,
    'error', 'Transfers are temporarily disabled for security maintenance. Please check back soon.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**⚠️ WARNING:** This will disable ALL transfers. Make sure you:
1. Save the original function code so you can restore it later
2. Test that withdrawals are already disabled
3. Have a plan to re-enable once security is fixed

---

## Pros and Cons

### ✅ Pros of Disabling:
- **Immediate protection** - No funds can leave the system
- **Prevents further loss** - Even if attacker has access, can't move funds
- **Time to investigate** - Gives you time to find and fix the vulnerability
- **Low risk** - Users can still deposit and use the app

### ⚠️ Cons of Disabling:
- **User frustration** - Legitimate users can't withdraw
- **Not a long-term solution** - Need to fix the root cause
- **Business impact** - May affect user trust

---

## Recommendation

**Yes, temporarily disable withdrawals AND transfers** while you:
1. Reset the fraudulent balance
2. Rotate credentials
3. Implement balance validation triggers
4. Investigate the attack vector

**Then re-enable** once protections are in place.

---

## Re-enabling Later

When you're ready to re-enable:

1. **Remove the disable check** from `app/api/wallet/withdraw/route.ts`
2. **Restore the original transfer functions** (save them first!)
3. **Test thoroughly** before going live
4. **Monitor closely** for any suspicious activity

---

## Alternative: Selective Disable

Instead of disabling everything, you could:
- Disable withdrawals for accounts with balance > 1M sats
- Require additional verification for large withdrawals
- Add rate limiting on withdrawals

But for now, **full disable is safest** until you've secured the system.

