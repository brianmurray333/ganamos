# Arduino Device Issues - Diagnosis

## Problems Identified

### 1. ⚠️ API Returning Stale Balance
**Symptom:** Device shows `Balance: 148947 sats` but should show `242340 sats`

**Location:** `app/api/device/config/route.ts` line 194
```typescript
balance: profile?.balance || 0,
```

**Root Cause:** The API is fetching the user's profile from the database, but the `balance` field in the `profiles` table is stale (148947 instead of 242340).

**Possible Reasons:**
- Database balance wasn't updated after the deposit
- API is caching the profile data
- Wrong user_id is being fetched

**Action Required:** Verify in Supabase:
1. Check `profiles.balance` for user_id `dce58449-faa0-413e-b86e-6768d280beb` (Brian Murray)
2. Should be 242340, but might be 148947

### 2. ⚠️ API Returning 0 Coins
**Symptom:** Device shows `Coins: 0` but should show `93393 coins`

**Location:** `app/api/device/config/route.ts` line 195
```typescript
coins: profile?.pet_coins || 0,
```

**Root Cause:** Either:
- `pet_coins` is actually 0 in the database for this user
- The query fails to fetch `pet_coins` (column missing or query error)
- The fallback logic at lines 96-111 is catching an error and defaulting to 0

**Action Required:** Verify in Supabase:
1. Check `profiles.pet_coins` for user_id `dce58449-faa0-413e-b86e-6768d280beb`
2. Should be 93393

### 3. ⚠️ False Celebration on First Sync
**Symptom:** Device celebrates "Earned 148947 sats" on first sync after boot

**Location:** `arduino-reference/pet_blob.cpp` lines 259-286

**Root Cause:** 
- `renderPet()` is called BEFORE `fetchGanamosConfig()` completes
- Initial `ganamosConfig.balance` is 0 (uninitialized struct)
- After API fetch completes, `ganamosConfig.balance` = 148947
- `renderPet()` runs again, sees 148947 > 0, triggers celebration

**Flow:**
1. Boot: `ganamosConfig.balance` = 0 (uninitialized)
2. `renderPet()` called with balance = 0
3. First sync logic: saves 0 to flash
4. API fetch completes: `ganamosConfig.balance` = 148947
5. `renderPet()` called again with balance = 148947
6. Celebration logic: 148947 > 0 (oldBalance was 0), triggers celebration

**Action Required:** Ensure `renderPet()` is only called AFTER successful API fetch, or initialize `ganamosConfig.balance` from flash memory on boot.

## Recommended Fixes

### Backend (API):
1. **Verify database values** - Check if `balance` and `pet_coins` are correct in Supabase
2. **Add logging** - Log the actual `profile.balance` and `profile.pet_coins` values in the API route
3. **Check for caching** - Ensure Supabase client isn't caching stale data

### Arduino:
1. **Initialize balance from flash on boot** - Load `ganamosConfig.balance` from flash before first render
2. **Don't render until config loaded** - Only call `renderPet()` after successful `fetchGanamosConfig()`
3. **Fix first sync logic** - The log message says "Setting balance to 0" but should say the actual balance from API

