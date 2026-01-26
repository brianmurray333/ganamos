/**
 * POST /api/wallet/nwc/dismiss-prompt
 * 
 * Dismiss the "connect your wallet" prompt for a user
 * The prompt won't show again unless they reset it
 */

import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { dismissWalletPrompt } from "@/lib/wallet-router"

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

    const success = await dismissWalletPrompt(user.id)

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Failed to dismiss prompt" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[NWC Dismiss] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
