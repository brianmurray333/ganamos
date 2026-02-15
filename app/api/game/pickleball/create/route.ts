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
    const { deviceId, macAddress } = body

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

    // 5. Create the game session with host as first player
    const hostPlayer = {
      userId: device.user_id,
      deviceId: device.id,
      petName: device.pet_name,
      petInitial: device.pet_name.charAt(0).toUpperCase(),
      macAddress: macAddress,
      side: "left",    // Host always starts on left
      position: "top", // Host starts top-left
      joinedAt: new Date().toISOString(),
    }

    const lobbyExpiresAt = new Date(Date.now() + 60 * 1000).toISOString() // 60 second lobby

    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .insert({
        host_device_id: deviceId,
        host_user_id: device.user_id,
        status: "lobby",
        players: [hostPlayer],
        lobby_expires_at: lobbyExpiresAt,
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
      gameId: game.id,
      lobbyExpiresAt,
      potentialPlayers: potentialPlayers.length,
    })
  } catch (error) {
    console.error("[Pickleball] Create error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
