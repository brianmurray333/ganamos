/**
 * Mock Lightning Invoice Settlement Helper
 * Manually settle mock invoices for testing
 * Only active when USE_MOCK_LIGHTNING=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { mockLightningStore } from '@/lib/mock-lightning-store'

export async function POST(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.lightning.useMock) {
    return NextResponse.json(
      { error: 'Mock Lightning is not enabled. Set USE_MOCK_LIGHTNING=true' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { rHash } = body

    if (!rHash) {
      return NextResponse.json(
        { error: 'Missing rHash parameter' },
        { status: 400 }
      )
    }

    // Try to settle the invoice
    const success = mockLightningStore.settleInvoice(rHash)

    if (!success) {
      return NextResponse.json(
        { error: 'Invoice not found', rHash },
        { status: 404 }
      )
    }

    // Get the updated invoice
    const invoice = mockLightningStore.getInvoice(rHash)

    console.log(`[Mock Lightning] Manually settled invoice ${rHash.substring(0, 8)}...`)

    return NextResponse.json({
      success: true,
      message: 'Invoice settled',
      invoice: {
        rHash: invoice?.rHash,
        settled: invoice?.settled,
        settledAt: invoice?.settledAt,
        value: invoice?.value,
      },
    })
  } catch (error) {
    console.error('[Mock Lightning] Error settling invoice:', error)
    return NextResponse.json(
      { error: 'Failed to settle invoice' },
      { status: 500 }
    )
  }
}

// GET endpoint to view all mock invoices (debugging)
export async function GET() {
  // Safety check: Only work in mock mode
  if (!serverEnv?.lightning.useMock) {
    return NextResponse.json(
      { error: 'Mock Lightning is not enabled' },
      { status: 403 }
    )
  }

  const invoices = mockLightningStore.getAllInvoices()

  return NextResponse.json({
    count: invoices.length,
    invoices: invoices.map(inv => ({
      rHash: inv.rHash.substring(0, 16) + '...',
      value: inv.value,
      memo: inv.memo,
      settled: inv.settled,
      createdAt: inv.createdAt,
      settledAt: inv.settledAt,
    })),
  })
}

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
