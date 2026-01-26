/**
 * POST /api/wallet/nwc/disconnect
 * 
 * Disconnect the user's NWC wallet
 * This removes the connection but doesn't affect their custodial balance
 */

import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { disconnectNWCWallet } from "@/lib/wallet-router"

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

    console.log(`[NWC Disconnect] Disconnecting wallet for user ${user.id}`)

    const success = await disconnectNWCWallet(user.id)

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Failed to disconnect wallet" },
        { status: 500 }
      )
    }

    console.log(`[NWC Disconnect] Wallet disconnected for user ${user.id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[NWC Disconnect] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
