import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

interface DeviceRecord {
  id: string
  user_id: string
  pet_name: string | null
}

interface LeaderboardRow {
  rank: number
  petName: string
  score: number
  deviceId: string
  isYou: boolean
  entryId: string | null
}

async function fetchDevice(
  supabase: SupabaseClient,
  deviceId: string,
): Promise<DeviceRecord | null> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, user_id, pet_name")
    .eq("id", deviceId)
    .eq("status", "paired")
    .maybeSingle()

  if (error) {
    console.error("[game-score] Device lookup failed:", error)
    return null
  }

  return data
}

async function buildLeaderboardResponse(
  supabase: SupabaseClient,
  deviceId?: string,
  fallbackPetName?: string | null,
) {
  const leaderboardQuery = supabase
    .from("flappy_bird_game")
    .select("id, score, device_id, created_at, devices!inner(pet_name)")
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5)

  const { data: rows, error: leaderboardError } = await leaderboardQuery

  if (leaderboardError) {
    throw leaderboardError
  }

  const leaderboard: LeaderboardRow[] =
    rows?.map((row, index) => ({
      rank: index + 1,
      petName: row.devices?.pet_name ?? "Pet",
      score: row.score,
      deviceId: row.device_id,
      isYou: deviceId ? row.device_id === deviceId : false,
      entryId: row.id,
    })) ?? []

  let personalBest: number | null = null
  let yourRank: number | null = null
  let yourEntry: LeaderboardRow | null = null

  if (deviceId) {
    const { data: bestRows, error: bestError } = await supabase
      .from("flappy_bird_game")
      .select("score")
      .eq("device_id", deviceId)
      .order("score", { ascending: false })
      .limit(1)

    if (bestError) {
      throw bestError
    }

    if (bestRows && bestRows.length > 0) {
      personalBest = bestRows[0].score

      const { count, error: rankError } = await supabase
        .from("flappy_bird_game")
        .select("score", { count: "exact", head: true })
        .gt("score", personalBest)

      if (rankError) {
        throw rankError
      }

      yourRank = ((count as number) || 0) + 1

      const onBoardIndex = leaderboard.findIndex(
        (entry) => entry.deviceId === deviceId,
      )

      if (onBoardIndex === -1) {
        yourEntry = {
          rank: yourRank,
          petName: fallbackPetName ?? "You",
          score: personalBest,
          deviceId,
          isYou: true,
          entryId: null,
        }
      } else {
        leaderboard[onBoardIndex].rank = onBoardIndex + 1
      }
    }
  }

  return {
    leaderboard,
    personalBest,
    yourRank,
    yourEntry,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get("deviceId")

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Device ID required",
        },
        { status: 400 },
      )
    }

    // Rate limiting check
    const rateLimit = checkRateLimit(deviceId, RATE_LIMITS.GAME_SCORE)
    if (!rateLimit.allowed) {
      console.warn(`[Rate Limit] Device ${deviceId} exceeded game score limit (${rateLimit.totalRequests} requests)`)
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const scoreValue = Number(body?.score)

    if (!Number.isFinite(scoreValue) || scoreValue < 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Score must be a non-negative number",
        },
        { status: 400 },
      )
    }

    const score = Math.floor(scoreValue)

    const supabase = createServerSupabaseClient()
    const device = await fetchDevice(supabase, deviceId)

    if (!device) {
      return NextResponse.json(
        {
          success: false,
          error: "Device not found or not paired",
        },
        { status: 404 },
      )
    }

    const { data: previousRows, error: previousError } = await supabase
      .from("flappy_bird_game")
      .select("score")
      .eq("device_id", deviceId)
      .order("score", { ascending: false })
      .limit(1)

    if (previousError) {
      console.error("[game-score] Failed to fetch previous best:", previousError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to compute previous high score",
        },
        { status: 500 },
      )
    }

    const previousBest =
      previousRows && previousRows.length > 0 ? previousRows[0].score : null
    const isPersonalBest = previousBest === null || score > previousBest

    const { data: insertedRows, error: insertError } = await supabase
      .from("flappy_bird_game")
      .insert({
        device_id: device.id,
        user_id: device.user_id,
        score,
      })
      .select("id, score, created_at")

    if (insertError) {
      console.error("[game-score] Insert failed:", insertError)
      return NextResponse.json(
        {
          success: false,
          error: "Unable to record score",
        },
        { status: 500 },
      )
    }

    const insertedEntryId = insertedRows && insertedRows.length > 0 ? insertedRows[0].id : null

    const leaderboardPayload = await buildLeaderboardResponse(
      supabase,
      deviceId,
      device.pet_name,
    )

    // Check if current score made it into top 5
    const isNewHighScore =
      insertedEntryId != null &&
      leaderboardPayload.leaderboard.some(
        (entry) => entry.entryId === insertedEntryId,
      )

    // Calculate rank of the CURRENT score (not personal best)
    const { count: currentScoreRankCount, error: currentRankError } = await supabase
      .from("flappy_bird_game")
      .select("score", { count: "exact", head: true })
      .gt("score", score)

    if (currentRankError) {
      console.error("[game-score] Failed to calculate current score rank:", currentRankError)
    }

    const currentScoreRank = ((currentScoreRankCount as number) || 0) + 1

    return NextResponse.json({
      success: true,
      isPersonalBest,
      isNewHighScore,
      personalBest: leaderboardPayload.personalBest ?? score,
      yourRank: leaderboardPayload.yourRank,
      currentScoreRank, // Rank of the score just submitted
      leaderboard: leaderboardPayload.leaderboard.map((entry) => ({
        rank: entry.rank,
        petName: entry.petName,
        score: entry.score,
        isYou: entry.isYou,
      })),
      yourEntry: leaderboardPayload.yourEntry
        ? {
            rank: leaderboardPayload.yourEntry.rank,
            petName: leaderboardPayload.yourEntry.petName,
            score: leaderboardPayload.yourEntry.score,
          }
        : null,
    })
  } catch (error) {
    console.error("[game-score] Unexpected error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get("deviceId") || undefined

    const supabase = createServerSupabaseClient()
    let fallbackPetName: string | null | undefined = null

    if (deviceId) {
      const device = await fetchDevice(supabase, deviceId)
      fallbackPetName = device?.pet_name
    }

    const leaderboardPayload = await buildLeaderboardResponse(
      supabase,
      deviceId,
      fallbackPetName,
    )

    return NextResponse.json({
      success: true,
      personalBest: leaderboardPayload.personalBest,
      yourRank: leaderboardPayload.yourRank,
      leaderboard: leaderboardPayload.leaderboard.map((entry) => ({
        rank: entry.rank,
        petName: entry.petName,
        score: entry.score,
        isYou: entry.isYou,
      })),
      yourEntry: leaderboardPayload.yourEntry
        ? {
            rank: leaderboardPayload.yourEntry.rank,
            petName: leaderboardPayload.yourEntry.petName,
            score: leaderboardPayload.yourEntry.score,
          }
        : null,
    })
  } catch (error) {
    console.error("[game-score] GET error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}


