/**
 * Mock data seeding orchestrator
 * 
 * Coordinates seeding of all entities for mock user with:
 * - Idempotency checks (skip if data already exists)
 * - Ordered seeding (respecting entity relationships)
 * - Service role client for RLS bypass
 * - Comprehensive error handling
 */

import type { ServiceRoleClient, SeedSummary, SeedOptions } from './types';
import { seedPosts } from './entities/posts';
import { seedTransactions } from './entities/transactions';
import { seedActivities } from './entities/activities';
import { seedDevices } from './entities/devices';
import { seedFlappyBirdGames } from './entities/games';
import { seedConnectedAccounts } from './entities/accounts';
import { seedGroupMemberships } from './entities/groups';
import { seedPendingFixes } from './entities/fixes';

/**
 * Check if user already has seeded data (idempotency)
 */
async function hasExistingData(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<boolean> {
  try {
    const { count } = await serviceRole
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    return (count || 0) > 0;
  } catch (error) {
    console.error('Error checking existing data:', error);
    return false;
  }
}

/**
 * Update mock user profile with initial balance and settings
 */
async function updateProfile(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<void> {
  try {
    await serviceRole
      .from('profiles')
      .update({
        balance: 50000, // 50k sats starting balance
        pet_coins: 100, // 100 pet coins
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
  } catch (error) {
    console.error('Error updating profile:', error);
    // Non-fatal, continue seeding
  }
}

/**
 * Main seeding orchestrator
 * 
 * Seeds all entities in correct order:
 * 1. Update profile (balance, coins, status)
 * 2. Connected accounts (parent-child relationships)
 * 3. Device (1 per user due to UNIQUE constraint)
 * 4. Posts (12 with varied statuses)
 * 5. Transactions (7 completed transactions)
 * 6. Activities (10 activity feed items)
 * 7. Group memberships (1-2 active groups)
 * 8. Flappy bird games (1 game score)
 * 9. Pending fixes (2-3 fix submissions)
 */
export async function seedMockData(
  userId: string,
  serviceRole: ServiceRoleClient,
  options: SeedOptions = {}
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    success: false,
    userId,
    skipped: false,
    counts: {
      posts: 0,
      transactions: 0,
      activities: 0,
      devices: 0,
      games: 0,
      connectedAccounts: 0,
      groupMemberships: 0,
      pendingFixes: 0,
    },
    errors: [],
  };

  try {
    // Idempotency check: skip if user already has data
    if (!options.skipIdempotencyCheck && !options.force) {
      const hasData = await hasExistingData(serviceRole, userId);
      if (hasData) {
        console.log(`User ${userId} already has seeded data, skipping...`);
        summary.skipped = true;
        summary.success = true;
        return summary;
      }
    }

    console.log(`Starting seed data generation for user ${userId}...`);

    // 1. Update profile
    await updateProfile(serviceRole, userId);

    // 2. Connected accounts
    const accountsResult = await seedConnectedAccounts(serviceRole, userId);
    summary.counts.connectedAccounts = accountsResult.count;
    if (accountsResult.error) summary.errors?.push(accountsResult.error);

    // 3. Device (needed for games)
    const deviceResult = await seedDevices(serviceRole, userId);
    summary.counts.devices = deviceResult.count;
    if (deviceResult.error) summary.errors?.push(deviceResult.error);

    // 4. Posts (needed for fixes and activities)
    const postsResult = await seedPosts(serviceRole, userId);
    summary.counts.posts = postsResult.count;
    if (postsResult.error) summary.errors?.push(postsResult.error);

    // 5. Transactions
    const transactionsResult = await seedTransactions(serviceRole, userId);
    summary.counts.transactions = transactionsResult.count;
    if (transactionsResult.error) summary.errors?.push(transactionsResult.error);

    // 6. Activities
    const activitiesResult = await seedActivities(serviceRole, userId);
    summary.counts.activities = activitiesResult.count;
    if (activitiesResult.error) summary.errors?.push(activitiesResult.error);

    // 7. Group memberships
    const groupsResult = await seedGroupMemberships(serviceRole, userId);
    summary.counts.groupMemberships = groupsResult.count;
    if (groupsResult.error) summary.errors?.push(groupsResult.error);

    // 8. Flappy bird games (requires device ID)
    if (deviceResult.data && deviceResult.data.length > 0) {
      const deviceId = deviceResult.data[0].id;
      const gamesResult = await seedFlappyBirdGames(serviceRole, userId, deviceId);
      summary.counts.games = gamesResult.count;
      if (gamesResult.error) summary.errors?.push(gamesResult.error);
    }

    // 9. Pending fixes (requires post IDs)
    if (postsResult.data && postsResult.data.length > 0) {
      const postIds = postsResult.data.slice(0, 5).map((p: any) => p.id); // First 5 posts
      const fixesResult = await seedPendingFixes(serviceRole, userId, postIds);
      summary.counts.pendingFixes = fixesResult.count;
      if (fixesResult.error) summary.errors?.push(fixesResult.error);
    }

    summary.success = true;
    console.log('Seed data generation completed:', summary);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fatal error during seed data generation:', errorMessage);
    summary.errors?.push(errorMessage);
    summary.success = false;
  }

  return summary;
}