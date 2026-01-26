/**
 * Connected accounts entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedConnectedAccount, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  TEST_USER_IDS,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic connected account seed data
 */
function generateConnectedAccountData(): SeedConnectedAccount[] {
  const accounts: SeedConnectedAccount[] = [];
  const now = new Date();

  // Create connected accounts using existing test users from seed.sql
  for (let i = 0; i < SEED_QUANTITIES.CONNECTED_ACCOUNTS && i < TEST_USER_IDS.length; i++) {
    accounts.push({
      primary_user_id: MOCK_USER_ID,
      connected_user_id: TEST_USER_IDS[i],
      created_at: now.toISOString(),
    });
  }

  return accounts;
}

/**
 * Seed connected accounts for mock user (parent-child relationships)
 */
export async function seedConnectedAccounts(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<SeedResult> {
  try {
    const accounts = generateConnectedAccountData();

    if (accounts.length === 0) {
      return {
        count: 0,
        error: 'No test users available for connected accounts',
      };
    }

    const { data, error } = await serviceRole
      .from('connected_accounts')
      .insert(accounts)
      .select();

    if (error) {
      throw new Error(`Failed to seed connected accounts: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding connected accounts',
    };
  }
}