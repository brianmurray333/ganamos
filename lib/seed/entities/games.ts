/**
 * Flappy bird game entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedGame, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  GAME_SCORES,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic game score data
 */
function generateGameData(deviceId: string): SeedGame {
  const now = new Date();
  now.setHours(now.getHours() - 2); // Game played 2 hours ago
  
  const score = GAME_SCORES[Math.floor(Math.random() * GAME_SCORES.length)];

  return {
    device_id: deviceId,
    user_id: MOCK_USER_ID,
    score,
    created_at: now.toISOString(),
  };
}

/**
 * Seed flappy bird game for mock user's device
 * Requires device_id from device seeder
 */
export async function seedFlappyBirdGames(
  serviceRole: ServiceRoleClient,
  userId: string,
  deviceId: string
): Promise<SeedResult> {
  try {
    const game = generateGameData(deviceId);

    const { data, error } = await serviceRole
      .from('flappy_bird_game')
      .insert([game])
      .select();

    if (error) {
      throw new Error(`Failed to seed game: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding games',
    };
  }
}