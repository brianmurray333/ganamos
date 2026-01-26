import { NextRequest, NextResponse } from 'next/server'
import { checkInvoice } from '@/lib/lightning'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/invoice-status?r_hash=<payment_hash>
 * Check if a Lightning invoice has been paid
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rHash = searchParams.get('r_hash')
    
    if (!rHash) {
      const errorResponse = NextResponse.json(
        { error: 'r_hash parameter is required' },
        { status: 400 }
      )
      
      // Add CORS headers
      errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      errorResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      
      return errorResponse
    }

    // Check invoice status using existing Lightning service
    const invoiceStatus = await checkInvoice(rHash)
    
    const response = NextResponse.json({
      success: invoiceStatus.success,
      settled: invoiceStatus.settled || false,
      r_hash: rHash,
      preimage: invoiceStatus.preimage || null,
      error: invoiceStatus.error
    })
    
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    
    return response
    
  } catch (error) {
    console.error('Error checking invoice status:', error)
    
    const errorResponse = NextResponse.json(
      { error: 'Failed to check invoice status' },
      { status: 500 }
    )
    
    // Add CORS headers
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    errorResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    
    return errorResponse
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
