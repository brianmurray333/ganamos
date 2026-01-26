/**
 * Mock Google Maps Geocoding Endpoint
 * Mirrors Google Maps Geocoding API response format
 * Only active when USE_MOCKS=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { mockMapsStore } from '@/lib/mock-maps-store'

export async function GET(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: 'Mock mode is not enabled. Set USE_MOCKS=true' },
      { status: 403 }
    )
  }

  try {
    // Use URL constructor instead of nextUrl.searchParams to avoid static generation error
    const { searchParams } = new URL(request.url)
    const latlng = searchParams.get('latlng')

    if (!latlng) {
      return NextResponse.json(
        { status: 'INVALID_REQUEST', results: [] },
        { status: 400 }
      )
    }

    // Parse coordinates
    const [lat, lng] = latlng.split(',').map(Number)

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { status: 'INVALID_REQUEST', results: [] },
        { status: 400 }
      )
    }

    // Get mock result
    const result = mockMapsStore.getGeocodingResult(lat, lng)

    console.log(
      `[Mock Maps] Geocoding: ${latlng} → ${result.results[0].formatted_address}`
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Mock Maps] Error in geocoding:', error)
    return NextResponse.json(
      { status: 'ERROR', results: [] },
      { status: 500 }
    )
  }
}
