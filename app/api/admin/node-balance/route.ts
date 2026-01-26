import { NextRequest, NextResponse } from "next/server"
import { lndRequest } from "../../../../lib/lightning"

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Get the total node balance from Voltage
 * Admin only endpoint for daily email summaries
 */
export async function GET(request: NextRequest) {
  try {

    // Get wallet balance from LND
    const result = await lndRequest("/v1/balance/channels")
    
    if (!result.success) {
      console.error("Failed to get node balance:", result.error)
      return NextResponse.json(
        { error: "Failed to get node balance", details: result.error },
        { status: 500 }
      )
    }

    // Parse the balance data
    const channelBalance = parseInt(result.data.balance || "0")
    const pendingBalance = parseInt(result.data.pending_open_balance || "0")
    
    // Also get on-chain balance
    const onChainResult = await lndRequest("/v1/balance/blockchain")
    const onChainBalance = onChainResult.success 
      ? parseInt(onChainResult.data.confirmed_balance || "0")
      : 0

    const totalBalance = channelBalance + pendingBalance + onChainBalance

    return NextResponse.json({
      success: true,
      balances: {
        channel_balance: channelBalance,
        pending_balance: pendingBalance, 
        onchain_balance: onChainBalance,
        total_balance: totalBalance
      }
    })
  } catch (error) {
    console.error("Node balance API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
