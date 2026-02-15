import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

/**
 * GET /api/game/pickleball/state?gameId=xxx&deviceId=yyy
 * Polled by devices during lobby phase to get current player list and MAC addresses.
 * Once game transitions to ESP-NOW, this is no longer needed until game completion.
 * 
 * Returns: { success, status, players[], playerCount, hostMac, lobbyExpiresAt }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get("gameId")
    const deviceId = searchParams.get("deviceId")

    if (!gameId) {
      return NextResponse.json(
        { success: false, error: "gameId required" },
        { status: 400 }
      )
    }

    // Rate limit: aggressive polling during lobby (every 1s)
    if (deviceId) {
      const rateLimit = checkRateLimit(`pickleball-state-${deviceId}`, {
        maxRequests: 120,
        windowMs: 60 * 1000, // 120 requests per minute (2/sec max during lobby)
      })
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded" },
          { status: 429 }
        )
      }
    }

    const supabase = createServerSupabaseClient()

    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .select("*")
      .eq("id", gameId)
      .single()

    if (gameError || !game) {
      return NextResponse.json(
        { success: false, error: "Game not found" },
        { status: 404 }
      )
    }

    // Check if lobby expired and auto-cancel
    if (
      game.status === "lobby" &&
      new Date(game.lobby_expires_at) < new Date()
    ) {
      const players = (game.players as any[]) || []
      if (players.length < 2) {
        // Not enough players joined - cancel
        await supabase
          .from("pickleball_games")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", gameId)

        return NextResponse.json({
          success: true,
          status: "cancelled",
          reason: "lobby_expired",
          players: [],
          playerCount: 0,
        })
      }
    }

    const players = (game.players as any[]) || []

    // Find the host's MAC address for ESP-NOW connection
    const hostPlayer = players.find(
      (p: any) => p.deviceId === game.host_device_id
    )

    return NextResponse.json({
      success: true,
      gameId: game.id,
      status: game.status,
      players: players.map((p: any) => ({
        deviceId: p.deviceId,
        petName: p.petName,
        petInitial: p.petInitial,
        macAddress: p.macAddress,
        side: p.side,
        position: p.position,
      })),
      playerCount: players.length,
      hostDeviceId: game.host_device_id,
      hostMac: hostPlayer?.macAddress || null,
      lobbyExpiresAt: game.lobby_expires_at,
      scoreLeft: game.score_left,
      scoreRight: game.score_right,
    })
  } catch (error) {
    console.error("[Pickleball] State error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/game/pickleball/state
 * Called by host to update game status (lobby → countdown → playing)
 * 
 * Body: { gameId, deviceId, action: "start_countdown" | "start_game" | "cancel" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gameId, deviceId, action } = body

    if (!gameId || !deviceId || !action) {
      return NextResponse.json(
        { success: false, error: "gameId, deviceId, and action required" },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Verify this device is the host
    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .select("*")
      .eq("id", gameId)
      .eq("host_device_id", deviceId)
      .single()

    if (gameError || !game) {
      return NextResponse.json(
        { success: false, error: "Game not found or you are not the host" },
        { status: 404 }
      )
    }

    const players = (game.players as any[]) || []

    if (action === "start_countdown") {
      // Need at least 2 players
      if (players.length < 2) {
        return NextResponse.json(
          { success: false, error: "Need at least 2 players to start" },
          { status: 400 }
        )
      }

      await supabase
        .from("pickleball_games")
        .update({
          status: "countdown",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gameId)

      return NextResponse.json({ success: true, status: "countdown" })
    }

    if (action === "start_game") {
      await supabase
        .from("pickleball_games")
        .update({
          status: "playing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gameId)

      return NextResponse.json({ success: true, status: "playing" })
    }

    if (action === "cancel") {
      await supabase
        .from("pickleball_games")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gameId)

      return NextResponse.json({ success: true, status: "cancelled" })
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    )
  } catch (error) {
    console.error("[Pickleball] State update error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
