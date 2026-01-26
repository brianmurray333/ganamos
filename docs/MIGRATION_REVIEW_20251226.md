# Migration Review - December 26, 2025

## Migrations to Apply (IN ORDER)

1. **`add_submitted_fix_lightning_address_20251226.sql`** - MUST RUN FIRST
2. **`create_system_user_for_anonymous_transactions_20251226.sql`** - Can run in any order
3. **`allow_fix_submissions_20251226.sql`** - MUST RUN AFTER #1 (references column)

## Migration Analysis

### ✅ Migration 1: `add_submitted_fix_lightning_address_20251226.sql`

**Status:** ✅ SAFE

**What it does:**
- Adds `submitted_fix_lightning_address TEXT` column to `posts` table
- Uses `IF NOT EXISTS` check - idempotent

**Potential Issues:**
- None - safe to run multiple times

**Regression Risk:** ⚠️ LOW
- New column is nullable, so existing rows unaffected
- No constraints added that could break existing data

---

### ✅ Migration 2: `create_system_user_for_anonymous_transactions_20251226.sql`

**Status:** ✅ SAFE (after fix)

**What it does:**
- Creates system user in `auth.users` (UUID: `00000000-0000-0000-0000-000000000000`)
- Creates system profile in `profiles` table
- Uses `IF NOT EXISTS` checks - idempotent

**Potential Issues:**
- ✅ FIXED: Username 'system' might conflict - now handles with fallback
- ✅ FIXED: UUID might already exist - protected by `IF NOT EXISTS`

**Regression Risk:** ⚠️ LOW
- If system user already exists, migration skips creation
- Username conflict handled with fallback (`system-1`, `system-2`, etc.)
- No impact on existing users

**Note:** If the system user already exists with different data, this won't update it. That's fine - we only need it to exist.

---

### ⚠️ Migration 3: `allow_fix_submissions_20251226.sql`

**Status:** ⚠️ NEEDS VERIFICATION

**What it does:**
1. Replaces trigger function `check_group_admin_post_update()` 
2. Drops and recreates RLS policies
3. References `submitted_fix_lightning_address` column (must exist first!)

**Potential Issues:**

1. **Column Dependency:** ⚠️ CRITICAL
   - References `NEW.submitted_fix_lightning_address` on line 122
   - **MUST run after `add_submitted_fix_lightning_address_20251226.sql`**
   - If column doesn't exist, trigger function creation will fail

2. **Policy Name Change:** ⚠️ MEDIUM
   - Drops: `"Post creators, connected accounts, and group admins can update posts"`
   - Creates: `"Post creators, connected accounts, group admins, and fix submitters can update posts"`
   - Uses `DROP POLICY IF EXISTS` - safe if policy doesn't exist
   - **BUT:** If the policy name is different in production, this might not drop the right one

3. **Trigger Function Replacement:** ⚠️ LOW
   - Uses `CREATE OR REPLACE FUNCTION` - safe
   - Will update existing function if it exists
   - **BUT:** If function signature changed, might cause issues

4. **Anonymous User Access:** ⚠️ MEDIUM
   - Adds `(auth.uid() IS NULL AND fixed = false AND under_review = false)` to RLS policy
   - This allows truly unauthenticated users to update posts
   - **Security concern:** Need to ensure trigger properly restricts what they can change (it does)

**Regression Risk:** ⚠️ MEDIUM
- If policy name is different, old policy might remain (creating duplicate policies)
- If trigger function has different signature, might break existing functionality
- Anonymous users can now update posts (but trigger restricts to fix-submission fields only)

---

## Critical Checks Before Running

### 1. Verify Policy Names Match
Run this in production to check current policy names:
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'posts' AND cmd = 'UPDATE';
```

Expected policies (from diagnostic query):
- "Users can update their own posts"
- "Group admins can disassociate posts"
- "Anyone can submit a fix on an open post"
- "Post creators, connected accounts, and group admins can update " (truncated)

**Issue:** The migration drops `"Post creators, connected accounts, and group admins can update posts"` but the actual policy name might be truncated or different.

### 2. Verify Column Doesn't Exist
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'posts' AND column_name = 'submitted_fix_lightning_address';
```

### 3. Verify System User Doesn't Exist
```sql
SELECT id, email, username FROM profiles WHERE id = '00000000-0000-0000-0000-000000000000';
SELECT id, email FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000000';
```

### 4. Verify Trigger Function Exists
```sql
SELECT proname FROM pg_proc WHERE proname = 'check_group_admin_post_update';
```

---

## Recommended Execution Order

1. **First:** Run verification queries above
2. **Second:** `add_submitted_fix_lightning_address_20251226.sql`
3. **Third:** `create_system_user_for_anonymous_transactions_20251226.sql`
4. **Fourth:** `allow_fix_submissions_20251226.sql`

---

## Potential Regressions

### ⚠️ HIGH RISK: Policy Name Mismatch

**Problem:** If the policy name in production is different (e.g., truncated), the DROP won't work and you'll have duplicate policies.

**Solution:** Update migration to handle multiple possible policy names:
```sql
-- Drop all possible variations
DROP POLICY IF EXISTS "Post creators, connected accounts, and group admins can update posts" ON posts;
DROP POLICY IF EXISTS "Post creators, connected accounts, and group admins can update " ON posts;
-- etc.
```

### ⚠️ MEDIUM RISK: Anonymous User Access

**Problem:** Anonymous users can now update posts. While the trigger restricts them, this is a new capability.

**Mitigation:** 
- Trigger function properly validates fix submissions
- Only fix-submission fields can be changed
- Content fields are protected

### ⚠️ LOW RISK: Username Conflict

**Problem:** Username 'system' might already exist.

**Solution:** ✅ Already fixed - uses fallback mechanism

---

## Testing Checklist

After running migrations:

- [ ] Verify column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'submitted_fix_lightning_address';`
- [ ] Verify system user exists: `SELECT * FROM profiles WHERE id = '00000000-0000-0000-0000-000000000000';`
- [ ] Verify trigger function updated: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'check_group_admin_post_update';`
- [ ] Verify policies: `SELECT policyname FROM pg_policies WHERE tablename = 'posts' AND cmd = 'UPDATE';`
- [ ] Test: Anonymous user can submit fix (should work)
- [ ] Test: Logged-in user can submit fix (should work)
- [ ] Test: Post owner can still update their post (should work)
- [ ] Test: Group admin can still update posts in their group (should work)

---

## Recommendation

**Status:** ✅ READY with one fix needed

**Action Required:**
1. Fix the policy drop to handle truncated names (see below)
2. Run migrations in the specified order
3. Monitor for any errors during execution


