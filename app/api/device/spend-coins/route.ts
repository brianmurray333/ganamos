import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * POST endpoint to spend coins for pet care actions
 * Called by device when user feeds pet, heals pet, or plays game
 */
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
        { status: 400 }
      )
    }

    // Rate limiting check
    const rateLimit = checkRateLimit(deviceId, RATE_LIMITS.DEVICE_SPEND)
    if (!rateLimit.allowed) {
      console.warn(`[Rate Limit] Device ${deviceId} exceeded spend limit (${rateLimit.totalRequests} requests)`)
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { amount, action } = body // action: 'feed', 'heal', or 'game'

    if (!amount || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid amount required",
        },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Find the device (include coins for per-device tracking)
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("user_id, coins")
      .eq("id", deviceId)
      .eq("status", "paired")
      .single()

    if (deviceError || !device) {
      return NextResponse.json(
        {
          success: false,
          error: "Device not found or not paired",
        },
        { status: 404 }
      )
    }

    // Get current coins
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("pet_coins")
      .eq("id", device.user_id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        {
          success: false,
          error: "User profile not found",
        },
        { status: 404 }
      )
    }

    const currentCoins = parseInt(profile.pet_coins || "0")

    // Check sufficient coins
    if (currentCoins < amount) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient coins",
          currentCoins,
          required: amount,
        },
        { status: 400 }
      )
    }

    // Deduct coins from profile (pet_coins)
    const newCoins = currentCoins - amount
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        pet_coins: newCoins,
        updated_at: new Date().toISOString(),
      })
      .eq("id", device.user_id)

    if (updateError) {
      console.error("Error updating coins:", updateError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update coins",
        },
        { status: 500 }
      )
    }

    // Also deduct from device.coins (per-device tracking for firmware reconciliation)
    const deviceCoins = device.coins || 0
    const newDeviceCoins = Math.max(0, deviceCoins - amount)
    await supabase
      .from("devices")
      .update({ coins: newDeviceCoins })
      .eq("id", deviceId)
    
    console.log(`[Spend Coins] Device ${deviceId} spent ${amount} coins on ${action}. Device coins: ${deviceCoins} -> ${newDeviceCoins}`)

    return NextResponse.json({
      success: true,
      coinsSpent: amount,
      newCoinBalance: newCoins, // Return profile.pet_coins (backwards compatible)
      action,
    })
  } catch (error) {
    console.error("Error in spend coins API:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    )
  }
}

