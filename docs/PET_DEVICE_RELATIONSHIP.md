# Pet Device Relationship (1:1)

## Overview
Each pet device can only be connected to ONE user, and each user can only have ONE pet device. This is a true 1:1 relationship.

## Implementation

### Database Constraint
- ✅ **Unique constraint** on `devices.pairing_code` ensures each physical device can only be registered once
- ✅ Added in: `scripts/add-device-unique-constraint.sql`

### API Enforcement
- ✅ **`/api/device/register`** endpoint checks if pairing code is already connected to another user
- ✅ Returns error: "This device (pet_name) is already connected to another user"
- ✅ Allows re-pairing if same user reconnects their own device

### User-Device Relationship
- ✅ Each user (parent OR child account) has their own `user_id` in the devices table
- ✅ Parent account devices do NOT automatically show on child account profiles
- ✅ Child accounts can connect their own separate pets

### UI Behavior
- ✅ **Profile page** shows only devices belonging to the `activeUserId`
- ✅ When viewing Marlowe's profile (child account), only Marlowe's pet shows
- ✅ When viewing Brian's profile (parent account), only Brian's pet shows
- ✅ Fixed in: `app/api/device/list/route.ts` and `app/profile/page.tsx`

## Current State

### Before Fix
- ❌ Meme appeared on both Brian and Marlowe's profiles (incorrect)
- ❌ Device list API always returned authenticated user's devices

### After Fix
- ✅ Meme only appears on Brian's profile (owner)
- ✅ Marlowe's profile shows "Not Connected" (correct)
- ✅ Marlowe can now connect their own separate pet
- ✅ Each physical device (pairing code) can only be used once

## Files Modified
1. `app/api/device/register/route.ts` - Created with duplicate check
2. `app/api/device/list/route.ts` - Updated to use activeUserId
3. `app/profile/page.tsx` - Updated to pass activeUserId to API
4. `scripts/add-device-unique-constraint.sql` - Database constraint

## Testing
To verify the fix works:
1. Switch to Marlowe's account → Pet card should show "Not Connected"
2. Switch to Brian's account → Pet card should show "meme"
3. Try to connect same pairing code to Marlowe → Should get error
4. Connect a different pairing code to Marlowe → Should work
