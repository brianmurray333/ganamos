import { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Top Scores | Ganamos',
  description: 'View the top Flappy Bird game scores from our community',
};

interface LeaderboardEntry {
  rank: number;
  petName: string;
  score: number;
  createdAt: string;
}

interface LeaderboardData {
  success: boolean;
  leaderboard: LeaderboardEntry[];
  totalEntries: number;
  error?: string;
}

async function fetchLeaderboard(): Promise<LeaderboardData> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/leaderboard`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error('Failed to fetch leaderboard:', response.statusText);
      return {
        success: false,
        leaderboard: [],
        totalEntries: 0,
        error: 'Failed to load leaderboard',
      };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return {
      success: false,
      leaderboard: [],
      totalEntries: 0,
      error: 'Failed to load leaderboard',
    };
  }
}

function getRankBadgeVariant(rank: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (rank === 1) return 'default'; // Gold
  if (rank === 2) return 'secondary'; // Silver
  if (rank === 3) return 'destructive'; // Bronze
  return 'outline';
}

function getRankEmoji(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

export default async function TopScorePage() {
  const data = await fetchLeaderboard();

  return (
    <div className="min-h-screen relative">
      {/* Background Image with Gradient Overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: 'url(/images/community-fixing.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-8 md:py-12">
        {/* Page Title */}
        <div className="text-center mb-8 md:mb-12">
          <h1 className="app-title text-4xl md:text-6xl text-white mb-4 flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10 md:w-14 md:h-14 text-yellow-400" />
            Top Scores
          </h1>
          <p className="text-white/80 text-lg md:text-xl">
            The best Flappy Bird players in our community
          </p>
        </div>

        {/* Leaderboard Card */}
        <div className="max-w-4xl mx-auto">
          <Card className="bg-white/95 backdrop-blur-sm shadow-2xl">
            <CardHeader>
              <CardTitle className="text-2xl md:text-3xl text-center">
                🏆 Leaderboard
              </CardTitle>
              <CardDescription className="text-center">
                {data.totalEntries > 0
                  ? `Showing top ${Math.min(20, data.totalEntries)} of ${data.totalEntries} scores`
                  : 'No scores yet - be the first to play!'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.error && (
                <div className="text-center py-8 text-red-600">
                  <p className="text-lg font-semibold">⚠️ {data.error}</p>
                  <p className="text-sm mt-2">Please try again later</p>
                </div>
              )}

              {!data.error && data.leaderboard.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-semibold">No scores yet!</p>
                  <p className="text-sm mt-2">Be the first to set a high score</p>
                </div>
              )}

              {data.leaderboard.length > 0 && (
                <div className="space-y-2">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b-2 border-gray-200">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">
                            Rank
                          </th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">
                            Player
                          </th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">
                            Score
                          </th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.leaderboard.map((entry) => (
                          <tr
                            key={`${entry.rank}-${entry.createdAt}`}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                          >
                            <td className="py-4 px-4">
                              <Badge variant={getRankBadgeVariant(entry.rank)}>
                                {getRankEmoji(entry.rank)} #{entry.rank}
                              </Badge>
                            </td>
                            <td className="py-4 px-4 font-medium text-gray-900">
                              {entry.petName}
                            </td>
                            <td className="py-4 px-4 text-right font-bold text-lg text-gray-900">
                              {entry.score}
                            </td>
                            <td className="py-4 px-4 text-right text-sm text-gray-500">
                              {new Date(entry.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3">
                    {data.leaderboard.map((entry) => (
                      <div
                        key={`${entry.rank}-${entry.createdAt}`}
                        className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={getRankBadgeVariant(entry.rank)}>
                            {getRankEmoji(entry.rank)} #{entry.rank}
                          </Badge>
                          <span className="text-2xl font-bold text-gray-900">
                            {entry.score}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {entry.petName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(entry.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer Note */}
        <div className="text-center mt-8 text-white/60 text-sm">
          <p>Leaderboard updates every 5 minutes</p>
        </div>
      </div>
    </div>
  );
}