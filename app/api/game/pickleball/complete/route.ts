import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

/**
 * POST /api/game/pickleball/complete
 * Called by host device when game finishes to record results.
 * Awards happiness bonus to winning side.
 * 
 * Body: { gameId, deviceId, scoreLeft, scoreRight, winnerSide }
 * Returns: { success }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gameId, deviceId, scoreLeft, scoreRight, winnerSide } = body

    if (!gameId || !deviceId) {
      return NextResponse.json(
        { success: false, error: "gameId and deviceId required" },
        { status: 400 }
      )
    }

    if (winnerSide !== "left" && winnerSide !== "right") {
      return NextResponse.json(
        { success: false, error: "winnerSide must be 'left' or 'right'" },
        { status: 400 }
      )
    }

    // Rate limit
    const rateLimit = checkRateLimit(`pickleball-complete-${deviceId}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Verify game exists and this device is the host
    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .select("*")
      .eq("id", gameId)
      .eq("host_device_id", deviceId)
      .single()

    if (gameError || !game) {
      return NextResponse.json(
        { success: false, error: "Game not found or not host" },
        { status: 404 }
      )
    }

    if (game.status === "completed") {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
      })
    }

    // Update game with final results
    const { error: updateError } = await supabase
      .from("pickleball_games")
      .update({
        status: "completed",
        score_left: scoreLeft || 0,
        score_right: scoreRight || 0,
        winner_side: winnerSide,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", gameId)

    if (updateError) {
      console.error("[Pickleball] Failed to complete game:", updateError)
      return NextResponse.json(
        { success: false, error: "Failed to save game results" },
        { status: 500 }
      )
    }

    console.log(`[Pickleball] Game ${gameId} completed. Score: L${scoreLeft}-R${scoreRight}. Winner: ${winnerSide}`)

    return NextResponse.json({
      success: true,
      scoreLeft,
      scoreRight,
      winnerSide,
    })
  } catch (error) {
    console.error("[Pickleball] Complete error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
