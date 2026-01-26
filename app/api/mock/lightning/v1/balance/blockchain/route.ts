import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { mockLightningStore } from '@/lib/mock-lightning-store'

export const dynamic = 'force-dynamic'

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

/**
 * GET /api/mock/lightning/v1/balance/blockchain
 * Returns mock on-chain blockchain balance (mimics LND API)
 */
export async function GET(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.lightning.useMock) {
    return NextResponse.json(
      { error: 'Mock Lightning is not enabled. Set USE_MOCKS=true' },
      { status: 403 }
    )
  }

  try {
    const blockchainBalance = mockLightningStore.getBlockchainBalance()

    console.log('[Mock Lightning] Blockchain balance requested:', blockchainBalance)

    // Return response matching LND API format
    // LND returns string values for balance fields
    return NextResponse.json({
      confirmed_balance: String(blockchainBalance),
      unconfirmed_balance: '0', // No unconfirmed balance in mock
      total_balance: String(blockchainBalance),
    })
  } catch (error) {
    console.error('[Mock Lightning] Error getting blockchain balance:', error)
    return NextResponse.json(
      { error: 'Failed to get blockchain balance' },
      { status: 500 }
    )
  }
}
