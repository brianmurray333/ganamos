/**
 * Group membership entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedGroupMembership, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  EXISTING_GROUP_IDS,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic group membership seed data
 */
function generateGroupMembershipData(): SeedGroupMembership[] {
  const memberships: SeedGroupMembership[] = [];
  const now = new Date();

  // Create memberships to existing groups from seed.sql
  for (let i = 0; i < SEED_QUANTITIES.GROUP_MEMBERSHIPS && i < EXISTING_GROUP_IDS.length; i++) {
    memberships.push({
      group_id: EXISTING_GROUP_IDS[i],
      user_id: MOCK_USER_ID,
      role: 'member',
      status: 'approved', // Active membership so it shows on dashboard
      created_at: now.toISOString(),
    });
  }

  return memberships;
}

/**
 * Seed group memberships for mock user
 */
export async function seedGroupMemberships(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<SeedResult> {
  try {
    const memberships = generateGroupMembershipData();

    if (memberships.length === 0) {
      return {
        count: 0,
        error: 'No groups available for memberships',
      };
    }

    const { data, error } = await serviceRole
      .from('group_members')
      .insert(memberships)
      .select();

    if (error) {
      throw new Error(`Failed to seed group memberships: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding group memberships',
    };
  }
}