/**
 * GET /api/wallet/nwc/status
 * 
 * Get the current status of the user's NWC wallet connection
 * Also checks if the user has dismissed the connection prompt
 */

import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { getUserWalletInfo, hasUserDismissedPrompt } from "@/lib/wallet-router"

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      )
    }

    // Get wallet info
    const walletInfo = await getUserWalletInfo(user.id)
    const promptDismissed = await hasUserDismissedPrompt(user.id)

    // Get wallet details if connected
    let walletDetails = null
    if (walletInfo.hasNWCWallet) {
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("id, wallet_name, nwc_relay_url, connection_status, last_connected_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()

      if (wallet) {
        walletDetails = {
          id: wallet.id,
          name: wallet.wallet_name,
          relayUrl: wallet.nwc_relay_url,
          status: wallet.connection_status,
          lastConnected: wallet.last_connected_at,
        }
      }
    }

    return NextResponse.json({
      success: true,
      hasNWCWallet: walletInfo.hasNWCWallet,
      wallet: walletDetails,
      custodialBalance: walletInfo.custodialBalance,
      promptDismissed,
    })
  } catch (error) {
    console.error("[NWC Status] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
