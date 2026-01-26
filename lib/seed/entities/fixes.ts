/**
 * Pending fixes entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedPendingFix, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  FIXER_NOTES,
  PLACEHOLDER_IMAGES,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic pending fix seed data
 * Requires post IDs from post seeder to reference
 */
function generatePendingFixData(postIds: string[]): SeedPendingFix[] {
  const fixes: SeedPendingFix[] = [];
  const now = new Date();

  // Create pending fixes for first N unclaimed posts
  const numFixes = Math.min(SEED_QUANTITIES.PENDING_FIXES, postIds.length);
  
  for (let i = 0; i < numFixes; i++) {
    const fixerNote = FIXER_NOTES[i % FIXER_NOTES.length];
    const confidenceScore = 70 + Math.floor(Math.random() * 30); // 70-99
    
    fixes.push({
      post_id: postIds[i],
      fixer_id: MOCK_USER_ID,
      fix_image_url: PLACEHOLDER_IMAGES.FIXED,
      fixer_note: fixerNote,
      confidence_score: confidenceScore,
      ai_reasoning: `Detected repair completion with ${confidenceScore}% confidence. Image analysis shows improvement.`,
      status: 'pending',
      created_at: now.toISOString(),
    });
  }

  return fixes;
}

/**
 * Seed pending fixes for mock user's posts
 * Requires post IDs to create fix submissions
 */
export async function seedPendingFixes(
  serviceRole: ServiceRoleClient,
  userId: string,
  postIds: string[]
): Promise<SeedResult> {
  try {
    if (!postIds || postIds.length === 0) {
      return {
        count: 0,
        error: 'No posts available for pending fixes',
      };
    }

    const fixes = generatePendingFixData(postIds);

    if (fixes.length === 0) {
      return { count: 0 };
    }

    const { data, error } = await serviceRole
      .from('pending_fixes')
      .insert(fixes)
      .select();

    if (error) {
      throw new Error(`Failed to seed pending fixes: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding pending fixes',
    };
  }
}