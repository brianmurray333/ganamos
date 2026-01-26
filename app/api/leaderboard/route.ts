import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const revalidate = 300; // Cache for 5 minutes

interface LeaderboardEntry {
  rank: number;
  petName: string;
  score: number;
  createdAt: string;
}

interface LeaderboardResponse {
  success: boolean;
  leaderboard: LeaderboardEntry[];
  totalEntries: number;
  error?: string;
}

/**
 * GET /api/leaderboard
 * 
 * Fetches the top 20 scores from the Flappy Bird game leaderboard.
 * Includes caching with 5-minute revalidation for performance.
 * 
 * Returns:
 * - leaderboard: Array of top 20 entries with rank, petName, score, createdAt
 * - totalEntries: Total number of scores in the leaderboard
 */
export async function GET(request: NextRequest): Promise<NextResponse<LeaderboardResponse>> {
  try {
    const supabase = createServerSupabaseClient();

    // Query top 20 scores with device pet names
    const { data: scores, error: scoresError } = await supabase
      .from('flappy_bird_game')
      .select(`
        score,
        created_at,
        device_id,
        devices (
          pet_name
        )
      `)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(20);

    if (scoresError) {
      console.error('Error fetching leaderboard scores:', scoresError);
      return NextResponse.json(
        {
          success: false,
          leaderboard: [],
          totalEntries: 0,
          error: 'Failed to fetch leaderboard data',
        },
        { status: 500 }
      );
    }

    // Get total count of entries
    const { count: totalCount, error: countError } = await supabase
      .from('flappy_bird_game')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error fetching leaderboard count:', countError);
    }

    // Transform data to leaderboard format
    const leaderboard: LeaderboardEntry[] = (scores || []).map((entry, index) => ({
      rank: index + 1,
      petName: (entry.devices as any)?.pet_name || 'Anonymous Pet',
      score: entry.score,
      createdAt: entry.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        leaderboard,
        totalEntries: totalCount || 0,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('Unexpected error in leaderboard API:', error);
    return NextResponse.json(
      {
        success: false,
        leaderboard: [],
        totalEntries: 0,
        error: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}