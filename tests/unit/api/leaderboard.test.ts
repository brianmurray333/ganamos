import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/leaderboard/route';
import { createServerSupabaseClient } from '@/lib/supabase';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}));

describe('Leaderboard API - Unit Tests', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to setup mock for both score query and count query
  function setupMocks(scoresData: any, scoresError: any, totalCount: number | null, countError: any = null) {
    const mockScoresChain = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: scoresData,
        error: scoresError,
      }),
    };

    const mockCountChain = {
      data: null,
      error: countError,
      count: totalCount,
    };

    let callCount = 0;
    mockSupabaseClient = {
      from: vi.fn().mockImplementation((table) => {
        callCount++;
        if (callCount === 1) {
          // First call: scores query
          return {
            select: vi.fn().mockReturnValue(mockScoresChain),
          };
        } else {
          // Second call: count query
          return {
            select: vi.fn().mockReturnValue(mockCountChain),
          };
        }
      }),
    };

    (createServerSupabaseClient as any).mockReturnValue(mockSupabaseClient);
  }

  describe('GET /api/leaderboard', () => {
    it('should return top 20 scores with correct structure', async () => {
      const mockScores = Array.from({ length: 20 }, (_, i) => ({
        score: 100 - i * 5,
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
        device_id: `device-${i}`,
        devices: { pet_name: `Player ${i + 1}` },
      }));

      setupMocks(mockScores, null, 50);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.leaderboard).toHaveLength(20);
      expect(data.totalEntries).toBe(50);

      // Verify first entry structure
      expect(data.leaderboard[0]).toEqual({
        rank: 1,
        petName: 'Player 1',
        score: 100,
        createdAt: expect.any(String),
      });
    });

    it('should handle empty leaderboard', async () => {
      setupMocks([], null, 0);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.leaderboard).toEqual([]);
      expect(data.totalEntries).toBe(0);
    });

    it('should fallback to "Anonymous Pet" when pet_name is null', async () => {
      const mockScores = [
        {
          score: 100,
          created_at: new Date().toISOString(),
          device_id: 'device-1',
          devices: { pet_name: null },
        },
        {
          score: 90,
          created_at: new Date().toISOString(),
          device_id: 'device-2',
          devices: null,
        },
      ];

      setupMocks(mockScores, null, 2);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.leaderboard[0].petName).toBe('Anonymous Pet');
      expect(data.leaderboard[1].petName).toBe('Anonymous Pet');
    });

    it('should assign correct ranks in order', async () => {
      const mockScores = [
        {
          score: 100,
          created_at: '2024-01-01T10:00:00Z',
          device_id: 'device-1',
          devices: { pet_name: 'First' },
        },
        {
          score: 90,
          created_at: '2024-01-01T11:00:00Z',
          device_id: 'device-2',
          devices: { pet_name: 'Second' },
        },
        {
          score: 80,
          created_at: '2024-01-01T12:00:00Z',
          device_id: 'device-3',
          devices: { pet_name: 'Third' },
        },
      ];

      setupMocks(mockScores, null, 3);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.leaderboard[0].rank).toBe(1);
      expect(data.leaderboard[0].score).toBe(100);
      expect(data.leaderboard[1].rank).toBe(2);
      expect(data.leaderboard[1].score).toBe(90);
      expect(data.leaderboard[2].rank).toBe(3);
      expect(data.leaderboard[2].score).toBe(80);
    });

    it('should handle database errors gracefully', async () => {
      setupMocks(null, { message: 'Database connection failed' }, null);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.leaderboard).toEqual([]);
      expect(data.error).toBe('Failed to fetch leaderboard data');
    });

    it('should set correct cache headers', async () => {
      setupMocks([], null, 0);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      const response = await GET(request);

      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('s-maxage=300');
      expect(cacheControl).toContain('stale-while-revalidate=60');
    });

    it('should call Supabase with correct query parameters', async () => {
      setupMocks([], null, 0);

      const request = new NextRequest('http://localhost:3000/api/leaderboard');
      await GET(request);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('flappy_bird_game');
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2); // Once for scores, once for count
    });
  });
});
