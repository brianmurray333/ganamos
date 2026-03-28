-- Database Cleanup: Anti-patterns & Consistency Fixes
-- All changes are reversible (NOT NULL can be dropped, FK ON DELETE can be changed back)
-- No data is deleted or modified by this migration

BEGIN;

-- ============================================================================
-- 1. Add NOT NULL constraints to posts boolean columns
--    Verified: all columns have 0 NULL values and have DEFAULT values set
--    Reversible: ALTER TABLE posts ALTER COLUMN x DROP NOT NULL
-- ============================================================================

ALTER TABLE posts ALTER COLUMN claimed SET NOT NULL;
ALTER TABLE posts ALTER COLUMN fixed SET NOT NULL;
ALTER TABLE posts ALTER COLUMN under_review SET NOT NULL;
ALTER TABLE posts ALTER COLUMN boost_applied SET NOT NULL;
ALTER TABLE posts ALTER COLUMN is_anonymous SET NOT NULL;
ALTER TABLE posts ALTER COLUMN created_at SET NOT NULL;

-- ============================================================================
-- 2. Widen posts.reward from integer to bigint
--    Matches original_reward and total_boost_amount which are already bigint.
--    Integer max (~2.1B sats = ~21 BTC) could be exceeded in theory.
--    This is a safe widening conversion -- no data loss possible.
-- ============================================================================

ALTER TABLE posts ALTER COLUMN reward TYPE bigint;

-- ============================================================================
-- 3. Repoint verifications FKs from auth.users to profiles
--    Verified: all reviewer_id and user_id values exist in profiles table.
--    This normalizes the FK to point to profiles (which itself FKs to auth.users).
--    Adding ON DELETE SET NULL so that deleting a user doesn't block on empty
--    verification records.
-- ============================================================================

ALTER TABLE verifications DROP CONSTRAINT verifications_reviewer_id_fkey;
ALTER TABLE verifications ADD CONSTRAINT verifications_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- user_id and post_id are NOT NULL, so CASCADE is the right choice
ALTER TABLE verifications DROP CONSTRAINT verifications_user_id_fkey;
ALTER TABLE verifications ADD CONSTRAINT verifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE verifications DROP CONSTRAINT IF EXISTS verifications_post_id_fkey;
ALTER TABLE verifications ADD CONSTRAINT verifications_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- ============================================================================
-- 4. Add ON DELETE clauses to FKs that are missing them
--    Currently these all default to NO ACTION (= RESTRICT at commit time).
--
--    SET NULL: Only for NULLABLE FK columns where the parent being removed
--              shouldn't block deletion, but the child row should survive.
--    CASCADE:  Only for NOT NULL dependent columns where the child record
--              is meaningless without the parent.
--    Left as RESTRICT: NOT NULL columns where cascading could cause
--              unintended data loss, and all financial/audit FKs.
-- ============================================================================

-- NULLABLE columns -> ON DELETE SET NULL (safe: column already allows NULL)

ALTER TABLE posts DROP CONSTRAINT posts_fixed_by_fkey;
ALTER TABLE posts ADD CONSTRAINT posts_fixed_by_fkey
  FOREIGN KEY (fixed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE posts DROP CONSTRAINT posts_assigned_to_fkey;
ALTER TABLE posts ADD CONSTRAINT posts_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles DROP CONSTRAINT profiles_deleted_by_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_deleted_by_fkey
  FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE donations DROP CONSTRAINT donations_donor_user_id_fkey;
ALTER TABLE donations ADD CONSTRAINT donations_donor_user_id_fkey
  FOREIGN KEY (donor_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE transactions DROP CONSTRAINT transactions_approved_by_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE transactions DROP CONSTRAINT transactions_rejected_by_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_rejected_by_fkey
  FOREIGN KEY (rejected_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- NOT NULL dependent columns -> ON DELETE CASCADE (child is meaningless without parent)
-- post_boosts and verifications are both currently empty tables

ALTER TABLE post_boosts DROP CONSTRAINT post_boosts_post_id_fkey;
ALTER TABLE post_boosts ADD CONSTRAINT post_boosts_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- NOTE: Intentionally LEFT AS RESTRICT (current default behavior):
--   activities.user_id (NOT NULL) - don't want to cascade-delete 1000+ activity rows
--   groups.created_by (NOT NULL) - don't want to cascade-delete groups
--   pickleball_games.host_user_id (NOT NULL) - don't want to cascade-delete games
--   pickleball_games.host_device_id (NOT NULL) - don't want to cascade-delete games
--   post_boosts.donation_pool_id (NOT NULL) - structural integrity
--   transactions.user_id - financial integrity, must not lose owner
--   withdrawal_audit_logs.* - audit trail integrity
--   donations.donation_pool_id - pool must exist
--   location_hierarchy FKs - structural integrity

-- ============================================================================
-- 5. Bitcoin prices retention function
--    Creates a callable function to trim old price data. Does NOT delete anything.
--    Call with: SELECT trim_old_bitcoin_prices(30) to keep last 30 days.
-- ============================================================================

CREATE OR REPLACE FUNCTION trim_old_bitcoin_prices(days_to_keep integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM bitcoin_prices
  WHERE created_at < NOW() - (days_to_keep || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION trim_old_bitcoin_prices IS
  'Trims bitcoin_prices rows older than the specified number of days. Returns count of deleted rows. Default: keep 90 days.';

COMMIT;
