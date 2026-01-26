# SQL to Run in Supabase Dashboard

To complete the activity feed updates, please run the following SQL in your Supabase SQL Editor:

## Step 1: Update Transfer Functions with Activities

Copy and paste the entire contents of `scripts/update-transfer-functions-with-activities.sql` into the Supabase SQL Editor and run it.

This will:
- Update the `transfer_sats_to_username` function to create activities for both sender and receiver
- Update the `family_transfer_sats` function to create activities for both sender and receiver
- Add proper metadata (amount, memo) to the activities

## Step 2: Test the Changes

After running the SQL, test by:
1. Sending sats between users
2. Checking the profile activity feed to see if transactions appear with amounts and destinations

## What This Fixes

- ✅ **Deposit Activities**: Already working - shows "You deposited X sats"
- ✅ **Send Activities**: Will show "You sent X sats to @username" 
- ✅ **Receive Activities**: Will show "You received X sats from @username"
- ✅ **Amount Display**: All transactions now show the actual amount
- ✅ **Destination Display**: Send/receive transactions show the other user's username

The activity feed will now match the wallet transaction history with proper amounts and destinations!
