// Each Satoshi Pet game has its own leaderboard (flappy_bird_game.game).
// Requests without a game are Flappy scores: firmware before game types
// existed only played Flappy.
export const GAME_TYPES = ["flappy", "pickleball", "satcatcher"] as const
export type GameType = (typeof GAME_TYPES)[number]

/** The game named by a request value, "flappy" when absent, or null when unknown. */
export function parseGameType(value: unknown): GameType | null {
  if (value === undefined || value === null || value === "") return "flappy"
  return typeof value === "string" && (GAME_TYPES as readonly string[]).includes(value)
    ? (value as GameType)
    : null
}
