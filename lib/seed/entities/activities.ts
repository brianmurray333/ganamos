/**
 * Activity entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedActivity, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  ACTIVITY_TYPES,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic activity seed data with metadata
 * 
 * Activities reference posts/transactions created by other seeders
 * We create generic activities that will appear in the feed
 */
function generateActivityData(): SeedActivity[] {
  const activities: SeedActivity[] = [];
  const now = new Date();

  // Create variety of activity types
  const activityTemplates = [
    { type: ACTIVITY_TYPES.POST_CREATED, meta: { action: 'created_post' } },
    { type: ACTIVITY_TYPES.POST_FIXED, meta: { action: 'fixed_post', reward: 500 } },
    { type: ACTIVITY_TYPES.POST_CLAIMED, meta: { action: 'claimed_post' } },
    { type: ACTIVITY_TYPES.TRANSACTION, meta: { type: 'deposit', amount: 5000, status: 'completed' } },
    { type: ACTIVITY_TYPES.POST_CREATED, meta: { action: 'created_post' } },
    { type: ACTIVITY_TYPES.POST_FIXED, meta: { action: 'fixed_post', reward: 300 } },
    { type: ACTIVITY_TYPES.TRANSACTION, meta: { type: 'internal', amount: 250, status: 'completed' } },
    { type: ACTIVITY_TYPES.DEVICE_PAIRED, meta: { action: 'paired_device', pet_name: 'Satoshi' } },
    { type: ACTIVITY_TYPES.GROUP_JOINED, meta: { action: 'joined_group' } },
    { type: ACTIVITY_TYPES.POST_FIXED, meta: { action: 'fixed_post', reward: 400 } },
  ];

  for (let i = 0; i < SEED_QUANTITIES.ACTIVITIES; i++) {
    const template = activityTemplates[i % activityTemplates.length];
    
    // Spread activities across past days
    const daysAgo = Math.floor(i / 3); // 3 activities per day
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - daysAgo);

    activities.push({
      user_id: MOCK_USER_ID,
      type: template.type,
      metadata: template.meta,
      created_at: createdAt.toISOString(),
    });
  }

  return activities;
}

/**
 * Seed activities for mock user
 */
export async function seedActivities(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<SeedResult> {
  try {
    const activities = generateActivityData();

    const { data, error } = await serviceRole
      .from('activities')
      .insert(activities)
      .select();

    if (error) {
      throw new Error(`Failed to seed activities: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding activities',
    };
  }
}