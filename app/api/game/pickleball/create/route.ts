import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

/**
 * POST /api/game/pickleball/create
 * Called by a device to create or join a pickleball game lobby.
 * Auto-joins an existing lobby if one is available, otherwise creates a new one.
 * 
 * Body: { deviceId, macAddress, wagerAmount? }
 * Returns: { success, gameId, action: "host"|"join", ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, macAddress, wagerAmount: rawWager } = body
    const wagerAmount = Number(rawWager) || 0

    if (wagerAmount !== 0 && wagerAmount !== 100 && wagerAmount !== 500 && wagerAmount !== 1000) {
      return NextResponse.json(
        { success: false, error: "Wager must be 0, 100, 500, or 1000" },
        { status: 400 }
      )
    }

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "Device ID required" },
        { status: 400 }
      )
    }

    if (!macAddress) {
      return NextResponse.json(
        { success: false, error: "MAC address required for ESP-NOW" },
        { status: 400 }
      )
    }

    // Rate limit: 5 game creates per minute
    const rateLimit = checkRateLimit(`pickleball-create-${deviceId}`, {
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

    // 1. Find the host device and get user info
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, user_id, pet_name, pet_type")
      .eq("id", deviceId)
      .eq("status", "paired")
      .single()

    if (deviceError || !device) {
      return NextResponse.json(
        { success: false, error: "Device not found or not paired" },
        { status: 404 }
      )
    }

    // 2. Update host device's MAC address in DB
    await supabase
      .from("devices")
      .update({ mac_address: macAddress })
      .eq("id", deviceId)

    // 2b. If wager > 0, verify host has sufficient balance
    if (wagerAmount > 0) {
      const { data: hostProfile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", device.user_id)
        .single()

      if (!hostProfile || hostProfile.balance < wagerAmount) {
        return NextResponse.json(
          { success: false, error: "Insufficient balance for wager" },
          { status: 400 }
        )
      }
    }

    // 3. Check for existing active game from this device
    const { data: existingGame } = await supabase
      .from("pickleball_games")
      .select("id")
      .eq("host_device_id", deviceId)
      .in("status", ["lobby", "countdown", "playing"])
      .single()

    if (existingGame) {
      // Cancel existing game before creating new one
      await supabase
        .from("pickleball_games")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", existingGame.id)
    }

    // 4. Before creating a new game, check if any active lobby exists to join
    const { data: existingLobbies } = await supabase
      .from("pickleball_games")
      .select("*")
      .in("status", ["lobby"])
      .neq("host_device_id", deviceId)
      .gt("lobby_expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(5)

    if (existingLobbies && existingLobbies.length > 0) {
      for (const existingGame of existingLobbies) {
        const players = (existingGame.players as any[]) || []
        const alreadyJoined = players.some((p: any) => p.deviceId === deviceId)

        if (!alreadyJoined && players.length < 4) {
          const sideAssignments = [
            { side: "left", position: "top" },
            { side: "right", position: "top" },
            { side: "right", position: "bottom" },
            { side: "left", position: "bottom" },
          ]
          const assignment = sideAssignments[players.length]

          // Check joiner's balance against the game's wager
          const gameWager = existingGame.wager_amount || 0
          if (gameWager > 0) {
            const { data: joinerProfile } = await supabase
              .from("profiles")
              .select("balance")
              .eq("id", device.user_id)
              .single()
            if (!joinerProfile || joinerProfile.balance < gameWager) {
              // Insufficient balance for this wager game — skip it, try next lobby
              continue
            }
          }

          const joiningPlayer = {
            userId: device.user_id,
            deviceId: device.id,
            petName: device.pet_name,
            petInitial: device.pet_name.charAt(0).toUpperCase(),
            macAddress,
            side: assignment.side,
            position: assignment.position,
            joinedAt: new Date().toISOString(),
            wagerAccepted: gameWager > 0 ? true : undefined,
          }

          const updatedPlayers = [...players, joiningPlayer]

          await supabase
            .from("pickleball_games")
            .update({ players: updatedPlayers, updated_at: new Date().toISOString() })
            .eq("id", existingGame.id)

          const hostPlayer = players[0]

          console.log(`[Pickleball] Device ${deviceId} auto-joined existing game ${existingGame.id} as player ${players.length}`)

          return NextResponse.json({
            success: true,
            action: "join",
            gameId: existingGame.id,
            hostMac: hostPlayer?.macAddress || "",
            hostPetName: hostPlayer?.petName || "Someone",
            playerIndex: players.length,
            yourSide: assignment.side,
            yourPosition: assignment.position,
            players: updatedPlayers,
            playerCount: updatedPlayers.length,
            wagerAmount: gameWager,
            wagerAccepted: true,
            wagerStatus: existingGame.wager_status || "none",
          })
        }
      }
    }

    // 6. No existing lobby found — create a new game session
    const hostPlayer = {
      userId: device.user_id,
      deviceId: device.id,
      petName: device.pet_name,
      petInitial: device.pet_name.charAt(0).toUpperCase(),
      macAddress: macAddress,
      side: "left",
      position: "top",
      joinedAt: new Date().toISOString(),
      wagerAccepted: wagerAmount > 0 ? true : undefined,
    }

    const lobbyExpiresAt = new Date(Date.now() + 100 * 1000).toISOString()

    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .insert({
        host_device_id: deviceId,
        host_user_id: device.user_id,
        status: "lobby",
        players: [hostPlayer],
        lobby_expires_at: lobbyExpiresAt,
        wager_amount: wagerAmount,
        wager_status: wagerAmount > 0 ? "active" : "none",
      })
      .select("id")
      .single()

    if (gameError || !game) {
      console.error("[Pickleball] Failed to create game:", gameError)
      return NextResponse.json(
        { success: false, error: "Failed to create game" },
        { status: 500 }
      )
    }

    console.log(`[Pickleball] Game ${game.id} created by device ${deviceId}.`)

    return NextResponse.json({
      success: true,
      action: "host",
      gameId: game.id,
      lobbyExpiresAt,
      wagerAmount,
      wagerStatus: wagerAmount > 0 ? "active" : "none",
    })
  } catch (error) {
    console.error("[Pickleball] Create error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
