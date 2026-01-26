/**
 * POST /api/wallet/nwc/connect
 * 
 * Connect a non-custodial Lightning wallet via NWC (Nostr Wallet Connect)
 * 
 * SECURITY:
 * - Connection string contains secret key - handle with care
 * - Connection is tested before saving
 * - Only one active NWC wallet per user
 */

import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies, headers } from "next/headers"
import { isValidNWCConnectionString, testNWCConnection } from "@/lib/nwc"
import { connectNWCWallet } from "@/lib/wallet-router"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      )
    }

    // Rate limit wallet connection attempts
    const rateLimit = checkRateLimit(`nwc-connect:${user.id}`, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000, // 5 attempts per hour
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Too many connection attempts. Please try again later.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { connectionString, walletName } = body

    // Validate connection string format
    if (!connectionString || typeof connectionString !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing connection string" },
        { status: 400 }
      )
    }

    if (!isValidNWCConnectionString(connectionString)) {
      return NextResponse.json(
        { success: false, error: "Invalid NWC connection string format" },
        { status: 400 }
      )
    }

    // Test the connection
    console.log(`[NWC Connect] Testing connection for user ${user.id}`)
    const testResult = await testNWCConnection(connectionString)

    if (!testResult.success) {
      console.log(`[NWC Connect] Connection test failed: ${testResult.error}`)
      return NextResponse.json(
        { 
          success: false, 
          error: testResult.error || "Failed to connect to wallet",
          code: "CONNECTION_FAILED",
        },
        { status: 400 }
      )
    }

    // Save the wallet connection
    const connectResult = await connectNWCWallet(
      user.id,
      connectionString,
      walletName
    )

    if (!connectResult.success) {
      return NextResponse.json(
        { success: false, error: connectResult.error },
        { status: 500 }
      )
    }

    console.log(`[NWC Connect] Wallet connected successfully for user ${user.id}`)

    return NextResponse.json({
      success: true,
      wallet: {
        id: connectResult.walletId,
        name: walletName || "My Lightning Wallet",
        relayUrl: testResult.relayUrl,
        balance: testResult.balance,
      },
    })
  } catch (error) {
    console.error("[NWC Connect] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
