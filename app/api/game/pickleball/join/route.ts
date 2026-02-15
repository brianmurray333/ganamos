import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

/**
 * POST /api/game/pickleball/join
 * Called by a device to join an active pickleball lobby.
 * 
 * Body: { deviceId, gameId, macAddress }
 * Returns: { success, players[], playerCount }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, gameId, macAddress } = body

    if (!deviceId || !gameId || !macAddress) {
      return NextResponse.json(
        { success: false, error: "deviceId, gameId, and macAddress required" },
        { status: 400 }
      )
    }

    // Rate limit
    const rateLimit = checkRateLimit(`pickleball-join-${deviceId}`, {
      maxRequests: 10,
      windowMs: 60 * 1000,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      )
    }

    const supabase = createServerSupabaseClient()

    // 1. Get the joining device info
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, user_id, pet_name, pet_type")
      .eq("id", deviceId)
      .eq("status", "paired")
      .single()

    if (deviceError || !device) {
      return NextResponse.json(
        { success: false, error: "Device not found" },
        { status: 404 }
      )
    }

    // 2. Update joining device's MAC address
    await supabase
      .from("devices")
      .update({ mac_address: macAddress })
      .eq("id", deviceId)

    // 3. Get the game
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

    // 4. Validate game state
    if (game.status !== "lobby" && game.status !== "countdown") {
      return NextResponse.json(
        { success: false, error: "Game is not accepting players" },
        { status: 400 }
      )
    }

    // Check lobby expiry
    if (new Date(game.lobby_expires_at) < new Date()) {
      // Auto-cancel expired lobby
      await supabase
        .from("pickleball_games")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", gameId)

      return NextResponse.json(
        { success: false, error: "Game lobby has expired" },
        { status: 400 }
      )
    }

    const players = (game.players as any[]) || []

    // Check if already joined
    if (players.some((p: any) => p.deviceId === deviceId)) {
      return NextResponse.json({
        success: true,
        alreadyJoined: true,
        players,
        playerCount: players.length,
      })
    }

    // Max 4 players
    if (players.length >= 4) {
      return NextResponse.json(
        { success: false, error: "Game is full (4 players max)" },
        { status: 400 }
      )
    }

    // 5. Assign side and position based on player count
    //    Player 1 (host): left-top
    //    Player 2: right-top  
    //    Player 3: right-bottom (makes it 1v2)
    //    Player 4: left-bottom (makes it 2v2)
    const assignments = [
      { side: "left", position: "top" },     // Player 1 (host)
      { side: "right", position: "top" },    // Player 2
      { side: "right", position: "bottom" }, // Player 3
      { side: "left", position: "bottom" },  // Player 4
    ]
    const assignment = assignments[players.length]

    const newPlayer = {
      userId: device.user_id,
      deviceId: device.id,
      petName: device.pet_name,
      petInitial: device.pet_name.charAt(0).toUpperCase(),
      macAddress: macAddress,
      side: assignment.side,
      position: assignment.position,
      joinedAt: new Date().toISOString(),
    }

    const updatedPlayers = [...players, newPlayer]

    // 6. Update game with new player
    const { error: updateError } = await supabase
      .from("pickleball_games")
      .update({
        players: updatedPlayers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gameId)

    if (updateError) {
      console.error("[Pickleball] Failed to add player:", updateError)
      return NextResponse.json(
        { success: false, error: "Failed to join game" },
        { status: 500 }
      )
    }

    console.log(`[Pickleball] Device ${deviceId} (${device.pet_name}) joined game ${gameId}. Players: ${updatedPlayers.length}`)

    return NextResponse.json({
      success: true,
      players: updatedPlayers,
      playerCount: updatedPlayers.length,
      yourSide: assignment.side,
      yourPosition: assignment.position,
    })
  } catch (error) {
    console.error("[Pickleball] Join error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
