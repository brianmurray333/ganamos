# Device Coins Fix - Implementation Guide

## Problem
Your daughter's SatoshiPet showed "sats earned" but coin balance stayed at 0 when you sent her sats.

## Root Cause
The transfer functions only updated `balance`, not coins. The device reads coins from the API, but the API wasn't calculating coins earned since last sync.

## Solution
**Device-centric coin economy**: The server tracks earnings per device and tells the device how many coins to add since last sync. The device maintains the local balance and reports spending back to the server.

---

## Changes Made

### 1. ✅ Config API Updated
**File:** `app/api/device/config/route.ts`

Added calculation of `coinsEarnedSinceLastSync`:
- Queries transactions table for earnings after device was paired (`device.created_at`)
- Only includes earnings since last poll (`device.last_seen_at`)
- Returns amount to credit to device

### 2. ✅ Daily Admin Email Updated  
**File:** `lib/daily-summary.ts`

Added device coin stats section:
- Shows each device's coin activity (earned, spent, net) in last 24 hours
- Includes pet name, type, user name, and last seen timestamp
- Color-coded net coins (green=positive, red=negative)

### 3. ✅ Reverted Wrong Changes
- Removed server-side `pet_coins` updates (wrong approach)
- Kept it simple: server calculates earnings, device maintains balance

---

## Arduino Firmware Changes Needed

### File: `arduino-reference/config.cpp`

In the `fetchGanamosConfig()` function, after parsing the config JSON response, add:

```cpp
// After parsing config, around line 189:
ganamosConfig.coins = config["coins"] | 0;
ganamosConfig.btcPrice = config["btcPrice"];

// ADD THIS NEW CODE:
// Apply coins earned from server
int coinsEarned = config["coinsEarnedSinceLastSync"] | 0;
if (coinsEarned > 0) {
  extern int getLocalCoins();
  extern void setLocalCoins(int coins);
  
  int currentCoins = getLocalCoins();
  int newCoins = currentCoins + coinsEarned;
  setLocalCoins(newCoins);
  
  Serial.println("💰 Server credited " + String(coinsEarned) + " coins!");
  Serial.println("💰 Coin balance: " + String(currentCoins) + " → " + String(newCoins));
}
```

### Why This Works

**Before:**
1. Server sends transfer → creates transaction
2. Device polls → API returns `coins: 0` (from `pet_coins` column)
3. Device shows 0 coins ❌

**After:**
1. Server sends transfer → creates transaction
2. Device polls → API calculates: "You earned 1000 sats since last poll"
3. Device receives: `coinsEarnedSinceLastSync: 1000`
4. Device: `localCoins = localCoins + 1000`
5. Device shows 1000 coins ✅

---

## Testing the Fix

### 1. Deploy Server Changes
```bash
# Code changes are already done
git add .
git commit -m "Fix: Device coins now track earnings correctly"
git push origin main
# Vercel auto-deploys
```

### 2. Flash Updated Firmware
```bash
# In arduino-reference directory
# Add the code snippet above to config.cpp
# Upload to device via Arduino IDE or PlatformIO
```

### 3. Test Scenario
1. Check device current coin balance: Look at serial output
2. Send 1000 sats to your daughter
3. Wait 30 seconds for device to poll
4. Serial output should show:
   ```
   💰 Server credited 1000 coins!
   💰 Coin balance: 0 → 1000
   ```
5. Device screen should show updated coin count

### 4. Test Edge Cases

**Pre-existing Balance:**
- New user with 50k sats balance
- Pair new device → should get 0 coins ✅
- Earn 100 sats → should get 100 coins ✅

**Multiple Earnings:**
- Earn 100 sats
- Earn 200 sats  
- Device offline during both
- Device polls → gets 300 coins total ✅

**Factory Reset:**
- Device has 5000 coins locally
- Factory reset → coins = 0
- Boot up → polls server
- Server tracks total earnings since `device.created_at`
- Device should restore full coin history ✅

---

## How It Works

### Server Responsibilities
1. Track ALL earning transactions (deposits, transfers, rewards)
2. Calculate coins earned since device's `last_seen_at`
3. Only count transactions after device's `created_at` (pairing time)
4. Accept spending reports from device

### Device Responsibilities  
1. Maintain local coin balance
2. Add server-reported earnings to balance
3. Deduct local spending immediately
4. Sync pending spends to server

### Transaction Types That Credit Coins
```typescript
.in('type', ['deposit', 'internal'])  // Both types
.gt('amount', 0)                       // Only positive amounts
```

**Included:**
- ✅ Lightning deposits
- ✅ Received transfers (from other users)
- ✅ Fix rewards (earning for fixing issues)
- ✅ Received donations

**Excluded:**
- ❌ Withdrawals
- ❌ Sent transfers
- ❌ Post rewards (spending to create post)

---

## Daily Admin Email

You'll now receive daily device stats showing:
- Pet name and type
- User name
- Coins earned in last 24 hours
- Coins spent in last 24 hours
- Net coin change (color-coded)
- Last seen timestamp

Example:
```
Devices (Last 24 Hours)
• Luna (dog) - Emily
  💰 Earned: 1,500 coins
  💸 Spent: 800 coins
  📊 Net: +700 coins
  🕐 Last seen: 11/16/2025, 2:30 PM
```

---

## Benefits

✅ **Simpler**: Automatically handles ALL earning sources  
✅ **Robust**: No need to update every earning path  
✅ **Offline-first**: Device manages its own balance  
✅ **Auditable**: Daily email shows device activity  
✅ **Recoverable**: Factory reset can restore coins  
✅ **Accurate**: Server is source of truth for earnings

---

## Next Steps

1. ✅ Server changes deployed (automatic via Vercel)
2. ⏳ **Update Arduino firmware** (add code snippet above)
3. ⏳ **Flash device** with new firmware  
4. ✅ Test with your daughter's account
5. ✅ Monitor daily admin emails for device stats

Once the Arduino code is updated and flashed, the fix will be complete!

