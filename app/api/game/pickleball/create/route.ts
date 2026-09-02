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
    const { deviceId, macAddress, wagerAmount: rawWager, roomCode: rawRoomCode } = body
    const wagerAmount = Number(rawWager) || 0
    const roomCode = typeof rawRoomCode === "string" ? rawRoomCode.trim().toUpperCase() : ""

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

    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", device.user_id)
      .eq("status", "approved")
    const groupIds = (memberships || []).map((membership: any) => membership.group_id)

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
    let lobbyQuery = supabase
      .from("pickleball_games")
      .select("*")
      .in("status", ["lobby"])
      .neq("host_device_id", deviceId)
      .gt("lobby_expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10)

    if (roomCode) {
      lobbyQuery = lobbyQuery.eq("room_code", roomCode)
    } else if (groupIds.length > 0) {
      lobbyQuery = lobbyQuery.in("matchmaking_group_id", groupIds)
    } else {
      // Devices without a group do not receive global strangers' lobbies.
      lobbyQuery = lobbyQuery.is("matchmaking_group_id", null).not("room_code", "is", null)
    }
    const { data: existingLobbies } = await lobbyQuery

    if (existingLobbies && existingLobbies.length > 0) {
      for (const existingGame of existingLobbies) {
        const players = (existingGame.players as any[]) || []
        const alreadyJoined = players.some((p: any) => p.deviceId === deviceId)

        if (!alreadyJoined && players.length < 4) {
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
            joinedAt: new Date().toISOString(),
          }

          const { data: joinResult, error: joinError } = await supabase.rpc(
            "join_pickleball_game_atomic",
            { p_game_id: existingGame.id, p_player: joiningPlayer }
          )
          if (joinError) continue
          const updatedPlayers = joinResult.players as any[]
          const playerIndex = Number(joinResult.playerIndex)
          const joined = updatedPlayers[playerIndex]

          const hostPlayer = players[0]

          console.log(`[Pickleball] Device ${deviceId} auto-joined existing game ${existingGame.id} as player ${players.length}`)

          return NextResponse.json({
            success: true,
            action: "join",
            gameId: existingGame.id,
            hostMac: hostPlayer?.macAddress || "",
            hostPetName: hostPlayer?.petName || "Someone",
            playerIndex,
            yourSide: joined.side,
            yourPosition: joined.position,
            players: updatedPlayers,
            playerCount: updatedPlayers.length,
            wagerAmount: gameWager,
            wagerAccepted: gameWager === 0,
            wagerStatus: existingGame.wager_status || "none",
            roomCode: existingGame.room_code,
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
    const matchmakingGroupId = groupIds[0] || null
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    const generatedRoomCode = roomCode || Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")

    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .insert({
        host_device_id: deviceId,
        host_user_id: device.user_id,
        status: "setup",
        players: [hostPlayer],
        lobby_expires_at: lobbyExpiresAt,
        wager_amount: wagerAmount,
        wager_status: wagerAmount > 0 ? "active" : "none",
        matchmaking_group_id: matchmakingGroupId,
        room_code: generatedRoomCode,
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
      roomCode: generatedRoomCode,
      matchmaking: matchmakingGroupId ? "group" : "room",
    })
  } catch (error) {
    console.error("[Pickleball] Create error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
