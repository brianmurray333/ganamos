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

    // Top scores, best first. With best=1, page through until ten different
    // pets are found (one pet's many attempts can't crowd the others out).
    const PAGE = 500;
    const MAX_PAGES = 20;
    const select = () =>
      supabase
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
        .order('created_at', { ascending: true });

    let scores: any[] | null = null;
    let scoresError: any = null;
    if (!bestPerPet) {
      ({ data: scores, error: scoresError } = await select().limit(20));
    } else {
      const seen = new Set<string>();
      const best: any[] = [];
      for (let page = 0; page < MAX_PAGES && best.length < 10; page++) {
        const { data, error } = await select().range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) { scoresError = error; break; }
        for (const r of data || []) {
          const key = String(r.device_id);
          if (seen.has(key)) continue;
          seen.add(key);
          best.push(r);
          if (best.length === 10) break;
        }
        if (!data || data.length < PAGE) break;
      }
      scores = best;
    }

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