import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

/**
 * POST /api/game/pickleball/create
 * Called by host device to create a new pickleball game lobby.
 * Finds all group members with paired devices and creates a game session.
 * 
 * Body: { deviceId, macAddress }
 * Returns: { success, gameId, groupMembers[] }
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

    // 4. Find all group members who have paired devices
    //    Get user's groups first
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", device.user_id)
      .eq("status", "approved")

    const groupIds = memberships?.map(m => m.group_id) || []

    // Find other users in these groups who also have paired devices
    let potentialPlayers: Array<{
      userId: string
      deviceId: string
      petName: string
      petInitial: string
    }> = []

    if (groupIds.length > 0) {
      // Get all approved members in user's groups (excluding self)
      const { data: groupMembers } = await supabase
        .from("group_members")
        .select("user_id")
        .in("group_id", groupIds)
        .eq("status", "approved")
        .neq("user_id", device.user_id)

      const memberUserIds = [...new Set(groupMembers?.map(m => m.user_id) || [])]

      if (memberUserIds.length > 0) {
        // Find paired devices for these users
        const { data: memberDevices } = await supabase
          .from("devices")
          .select("id, user_id, pet_name")
          .in("user_id", memberUserIds)
          .eq("status", "paired")

        if (memberDevices) {
          potentialPlayers = memberDevices.map(d => ({
            userId: d.user_id,
            deviceId: d.id,
            petName: d.pet_name,
            petInitial: d.pet_name.charAt(0).toUpperCase(),
          }))
        }
      }
    }

    // 5. Before creating a new game, check if a group member already has an active lobby
    if (groupIds.length > 0) {
      const { data: existingGroupGames } = await supabase
        .from("pickleball_games")
        .select("*")
        .in("status", ["lobby"])
        .neq("host_device_id", deviceId)
        .gt("lobby_expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5)

      if (existingGroupGames && existingGroupGames.length > 0) {
        for (const existingGame of existingGroupGames) {
          const { data: hostInGroup } = await supabase
            .from("group_members")
            .select("id")
            .in("group_id", groupIds)
            .eq("user_id", existingGame.host_user_id)
            .eq("status", "approved")
            .limit(1)
            .single()

          if (hostInGroup) {
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
              let joinerWagerAccepted = true
              if (gameWager > 0) {
                const { data: joinerProfile } = await supabase
                  .from("profiles")
                  .select("balance")
                  .eq("id", device.user_id)
                  .single()
                joinerWagerAccepted = !!(joinerProfile && joinerProfile.balance >= gameWager)
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
                wagerAccepted: joinerWagerAccepted,
              }

              const updatedPlayers = [...players, joiningPlayer]

              const gameUpdate: Record<string, any> = {
                players: updatedPlayers,
                updated_at: new Date().toISOString(),
              }
              if (!joinerWagerAccepted && existingGame.wager_status === "active") {
                gameUpdate.wager_status = "declined"
              }

              await supabase
                .from("pickleball_games")
                .update(gameUpdate)
                .eq("id", existingGame.id)

              const hostPlayer = players[0]
              const updatedWagerStatus = joinerWagerAccepted
                ? (existingGame.wager_status || "none")
                : "declined"

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
                wagerAccepted: joinerWagerAccepted,
                wagerStatus: updatedWagerStatus,
              })
            }
          }
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

    const lobbyExpiresAt = new Date(Date.now() + 60 * 1000).toISOString()

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

    console.log(`[Pickleball] Game ${game.id} created by device ${deviceId}. ${potentialPlayers.length} potential players in group.`)

    return NextResponse.json({
      success: true,
      action: "host",
      gameId: game.id,
      lobbyExpiresAt,
      potentialPlayers: potentialPlayers.length,
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
