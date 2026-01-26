import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

export const dynamic = "force-dynamic"

// Sync a single pending spend from the device
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get("deviceId")

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "Device ID required" },
        { status: 400 }
      )
    }

    // Rate limiting check
    const rateLimit = checkRateLimit(deviceId, RATE_LIMITS.DEVICE_SYNC)
    if (!rateLimit.allowed) {
      console.warn(`[Rate Limit] Device ${deviceId} exceeded sync limit (${rateLimit.totalRequests} requests)`)
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
    const { spendId, timestamp, amount, action } = body

    if (!spendId || !amount || !action) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Use admin client with service_role for balance updates
    const supabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })

    // Verify device exists and get user (include coins for per-device tracking)
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, user_id, coins")
      .eq("id", deviceId)
      .eq("status", "paired")
      .single()

    if (deviceError || !device) {
      return NextResponse.json(
        { success: false, error: "Device not found or not paired" },
        { status: 404 }
      )
    }

    // Validate spend amount before calling RPC
    if (amount < 0 || amount > 10000) {
      return NextResponse.json(
        { success: false, error: "Invalid spend amount" },
        { status: 400 }
      )
    }

    // Use atomic RPC function to spend coins
    // This prevents race conditions by handling idempotency check and balance update in a single transaction
    const { data: spendResult, error: spendError } = await supabase.rpc('spend_coins', {
      p_spend_id: spendId,
      p_device_id: deviceId,
      p_user_id: device.user_id,
      p_amount: amount,
      p_action: action,
      p_timestamp: new Date(timestamp || Date.now()).toISOString(),
    })

    if (spendError) {
      console.error("Error in spend_coins RPC:", spendError)
      return NextResponse.json(
        { success: false, error: "Failed to process spend" },
        { status: 500 }
      )
    }

    const result = spendResult?.[0]
    if (!result?.success) {
      return NextResponse.json(
        { success: false, error: "Failed to update balance" },
        { status: 500 }
      )
    }

    // Also update device.coins (per-device tracking for firmware reconciliation)
    // Only do this if not already processed (avoid double-decrementing)
    let deviceCoins = device.coins || 0
    if (!result.already_processed) {
      deviceCoins = Math.max(0, deviceCoins - amount)
      await supabase
        .from("devices")
        .update({ coins: deviceCoins })
        .eq("id", deviceId)
    }

    console.log(
      `[Economy Sync] Device ${deviceId} spent ${amount} coins on ${action} (device.coins -> ${deviceCoins})${result.already_processed ? ' [duplicate]' : ''}`
    )

    // Only include alreadyProcessed when true (matching original API behavior)
    return NextResponse.json({
      success: true,
      ...(result.already_processed && { alreadyProcessed: true }),
      newCoinBalance: result.new_balance, // Return profile.pet_coins (backwards compatible)
      spendId: spendId,
    })
  } catch (error) {
    console.error("Error in economy sync API:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

