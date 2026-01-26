/**
 * Mock Lightning Invoice Check Endpoint
 * Mirrors LND REST API /v1/invoice/{rHash} endpoint
 * Only active when USE_MOCK_LIGHTNING=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { mockLightningStore } from '@/lib/mock-lightning-store'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ rHash: string }> }
) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.lightning.useMock) {
    return NextResponse.json(
      { error: 'Mock Lightning is not enabled. Set USE_MOCKS=true' },
      { status: 403 }
    )
  }

  try {
    const { rHash } = await params

    if (!rHash) {
      return NextResponse.json(
        { error: 'Missing rHash parameter' },
        { status: 400 }
      )
    }

    // Decode the URL-encoded rHash (it comes as base64 from the client)
    const decodedRHash = decodeURIComponent(rHash)

    // Get the invoice from the store
    const invoice = mockLightningStore.getInvoice(decodedRHash)

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found', rHash: decodedRHash },
        { status: 404 }
      )
    }

    // Return response matching LND API format
    return NextResponse.json({
      r_hash: invoice.rHashBase64,
      r_preimage: invoice.preimage || '',
      payment_request: invoice.paymentRequest,
      add_index: invoice.addIndex,
      settled: invoice.settled,
      creation_date: Math.floor(invoice.createdAt.getTime() / 1000).toString(),
      settle_date: invoice.settledAt ? Math.floor(invoice.settledAt.getTime() / 1000).toString() : '0',
      value: invoice.value.toString(),
      value_msat: (invoice.value * 1000).toString(),
      amt_paid: invoice.settled ? invoice.value.toString() : '0',
      amt_paid_sat: invoice.settled ? invoice.value.toString() : '0',
      amt_paid_msat: invoice.settled ? (invoice.value * 1000).toString() : '0',
      state: invoice.settled ? 'SETTLED' : 'OPEN',
      memo: invoice.memo,
    })
  } catch (error) {
    console.error('[Mock Lightning] Error checking invoice:', error)
    return NextResponse.json(
      { error: 'Failed to check invoice' },
      { status: 500 }
    )
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Grpc-Metadata-macaroon',
    },
  })
}
