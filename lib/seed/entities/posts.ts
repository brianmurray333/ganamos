/**
 * Post entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedPost, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  MOCK_USER_NAME,
  POST_TITLES,
  POST_DESCRIPTIONS,
  CITIES,
  PLACEHOLDER_IMAGES,
  REWARD_AMOUNTS,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic post seed data with varied statuses
 */
function generatePostData(): SeedPost[] {
  const posts: SeedPost[] = [];
  const now = new Date();

  // Create posts with different statuses for realism
  for (let i = 0; i < SEED_QUANTITIES.POSTS; i++) {
    const city = CITIES[i % CITIES.length];
    const title = POST_TITLES[i % POST_TITLES.length];
    const description = POST_DESCRIPTIONS[i % POST_DESCRIPTIONS.length];
    const reward = REWARD_AMOUNTS[i % REWARD_AMOUNTS.length];
    
    // Vary created_at timestamps across past days
    const daysAgo = Math.floor(i / 3); // 3-4 posts per day going back
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - daysAgo);

    // Status variations:
    // - Posts 0-5: Unfixed, unclaimed (pending)
    // - Posts 6-8: Claimed but not fixed (in progress)
    // - Posts 9-11: Fixed (completed)
    const isClaimed = i >= 6;
    const isFixed = i >= 9;

    const post: SeedPost = {
      user_id: MOCK_USER_ID,
      title,
      description: `${title}. ${description}`,
      image_url: PLACEHOLDER_IMAGES.POST,
      location: `${city.name}, USA`,
      latitude: city.lat + (Math.random() - 0.5) * 0.01, // Small random offset
      longitude: city.lng + (Math.random() - 0.5) * 0.01,
      city: city.name,
      reward,
      original_reward: reward,
      claimed: isClaimed,
      fixed: isFixed,
      created_by: MOCK_USER_NAME,
      created_at: createdAt.toISOString(),
      is_anonymous: i % 4 === 0, // 25% anonymous posts
    };

    // Add claim details for claimed posts
    if (isClaimed) {
      const claimedAt = new Date(createdAt);
      claimedAt.setHours(claimedAt.getHours() + 2); // Claimed 2 hours after creation
      post.claimed_by = MOCK_USER_ID;
      post.claimed_at = claimedAt.toISOString();
    }

    // Add fix details for fixed posts
    if (isFixed) {
      const fixedAt = new Date(post.claimed_at || createdAt);
      fixedAt.setHours(fixedAt.getHours() + 24); // Fixed 24 hours after claim
      post.fixed_by = MOCK_USER_ID;
      post.fixed_at = fixedAt.toISOString();
      post.fixed_image_url = PLACEHOLDER_IMAGES.FIXED;
      post.fixer_note = `Successfully completed repair of ${title.toLowerCase()}. Area restored to good condition.`;
    }

    posts.push(post);
  }

  return posts;
}

/**
 * Seed posts for mock user with varied statuses
 */
export async function seedPosts(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<SeedResult> {
  try {
    const posts = generatePostData();

    const { data, error } = await serviceRole
      .from('posts')
      .insert(posts)
      .select();

    if (error) {
      throw new Error(`Failed to seed posts: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding posts',
    };
  }
}