import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { parseGameType } from '@/lib/game-types';

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
 * Fetches the top 20 scores from a game's leaderboard.
 * Includes caching with 5-minute revalidation for performance.
 *
 * Query:
 * - game: flappy (default), pickleball or satcatcher
 * - best=1: one entry per pet (its best score), top 10
 * 
 * Returns:
 * - leaderboard: Array of top 20 entries with rank, petName, score, createdAt
 * - totalEntries: Total number of scores in the leaderboard
 */
export async function GET(request: NextRequest): Promise<NextResponse<LeaderboardResponse>> {
  try {
    const params = request.nextUrl.searchParams;
    const game = parseGameType(params.get('game'));
    if (!game) {
      return NextResponse.json(
        { success: false, leaderboard: [], totalEntries: 0, error: 'Unknown game' },
        { status: 400 }
      );
    }
    const bestPerPet = params.get('best') === '1';
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
      .eq('game', game)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(bestPerPet ? 500 : 20);

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
      .select('*', { count: 'exact', head: true })
      .eq('game', game);

    if (countError) {
      console.error('Error fetching leaderboard count:', countError);
    }

    // Transform data to leaderboard format
    // best=1: keep each pet's best score (rows are already best-first)
    let rows = scores || [];
    if (bestPerPet) {
      const seen = new Set<string>();
      rows = rows.filter((r) => {
        const key = String(r.device_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 10);
    }
    const leaderboard: LeaderboardEntry[] = rows.map((entry, index) => ({
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