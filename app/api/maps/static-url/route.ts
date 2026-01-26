/**
 * Helper API route for Google Maps Static API URL resolution
 * Returns the appropriate URL based on mock mode configuration
 * Keeps component code clean by centralizing mock state checks
 * 
 * NOTE: This endpoint is deprecated. Components should use /api/maps/staticmap directly.
 * This is kept for backward compatibility.
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const latitude = searchParams.get('latitude')
    const longitude = searchParams.get('longitude')
    const width = searchParams.get('width') || '640'
    const height = searchParams.get('height') || '400'
    const zoom = searchParams.get('zoom') || '15'

    // Validate required parameters
    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: 'Missing required parameters: latitude and longitude' },
        { status: 400 }
      )
    }

    // Parse and validate coordinates
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Invalid coordinate format' },
        { status: 400 }
      )
    }

    // Get appropriate URL from environment config (now uses the secure proxy)
    const url = serverEnv?.googleMaps.getStaticMapUrl({
      latitude: lat,
      longitude: lng,
      size: `${width}x${height}`,
      zoom: zoom,
    })

    console.log(
      `[Static Map URL] Resolved URL for ${lat},${lng}: ${serverEnv?.useMock ? 'mock' : 'real'}`
    )

    return NextResponse.json({ url })
  } catch (error) {
    console.error('[Static Map URL] Error resolving URL:', error)
    return NextResponse.json(
      { error: 'Failed to resolve static map URL' },
      { status: 500 }
    )
  }
}
