"use client"

import { useEffect, useState } from "react"
import { Trophy } from "lucide-react"

type Game = "flappy" | "satcatcher" | "pickleball"
type Entry = { rank: number; petName: string; score: number }

const GAMES: { id: Game; name: string; unit: string }[] = [
  { id: "flappy", name: "Flappy Pet", unit: "walls" },
  { id: "satcatcher", name: "Sat Catcher", unit: "sats" },
  { id: "pickleball", name: "Pickleball", unit: "rally" },
]

/** Top 10 pets per game (each pet's best score), from the same leaderboards the pets show. */
export function LeaderboardSection() {
  const [game, setGame] = useState<Game>("flappy")
  const [boards, setBoards] = useState<Partial<Record<Game, Entry[] | "error">>>({})

  useEffect(() => {
    if (boards[game]) return
    let cancelled = false
    fetch(`/api/leaderboard?game=${game}&best=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!cancelled) setBoards((b) => ({ ...b, [game]: (d.leaderboard as Entry[]) ?? [] }))
      })
      .catch(() => {
        if (!cancelled) setBoards((b) => ({ ...b, [game]: "error" }))
      })
    return () => {
      cancelled = true
    }
  }, [game, boards])

  const board = boards[game]
  const unit = GAMES.find((g) => g.id === game)!.unit

  return (
    <section id="leaderboard" className="py-16 sm:py-24 scroll-mt-20">
      <div className="max-w-xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Leaderboard</h2>
          <p className="mt-3 text-white/60">The best pets in every game. Scores come straight from the pets.</p>
        </div>

        <div className="flex justify-center gap-2 mb-6" role="tablist" aria-label="Game">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={game === g.id}
              onClick={() => setGame(g.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                game === g.id ? "bg-[#F7931A] text-[#1d1100]" : "bg-white/5 text-white/70 ring-1 ring-white/15 hover:bg-white/10"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b0c12]/80 overflow-hidden" role="tabpanel">
          {board === undefined ? (
            <ol aria-busy="true" className="divide-y divide-white/10">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="h-4 w-6 rounded bg-white/10 animate-pulse" />
                  <span className="h-4 flex-1 max-w-[10rem] rounded bg-white/10 animate-pulse" />
                  <span className="ml-auto h-4 w-10 rounded bg-white/10 animate-pulse" />
                </li>
              ))}
            </ol>
          ) : board === "error" ? (
            <p className="px-5 py-10 text-center text-white/55">Couldn&apos;t load the leaderboard. Try again in a moment.</p>
          ) : board.length === 0 ? (
            <p className="px-5 py-10 text-center text-white/55">No scores yet. The first pet to play takes the top spot.</p>
          ) : (
            <ol className="divide-y divide-white/10">
              {board.map((e) => (
                <li key={e.rank} className="flex items-center gap-4 px-5 py-3.5">
                  <span
                    className={`w-6 shrink-0 text-right font-semibold tabular-nums ${e.rank <= 3 ? "text-[#F7931A]" : "text-white/40"}`}
                  >
                    {e.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {e.petName}
                    {e.rank === 1 && <Trophy className="ml-2 inline h-4 w-4 -mt-0.5 text-[#F7931A]" aria-label="Top score" />}
                  </span>
                  <span className="shrink-0 tabular-nums text-white/80">
                    {e.score.toLocaleString()} <span className="text-white/40 text-sm">{unit}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
