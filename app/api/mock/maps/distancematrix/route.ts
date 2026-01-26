/**
 * Mock Google Maps Distance Matrix Endpoint
 * Mirrors Google Maps Distance Matrix API response format
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
    const origins = searchParams.get('origins')
    const destinations = searchParams.get('destinations')
    const mode = searchParams.get('mode') || 'driving'

    if (!origins || !destinations) {
      return NextResponse.json(
        { status: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Get mock result
    const result = mockMapsStore.getDistanceMatrixResult(
      origins,
      destinations,
      mode as 'walking' | 'driving'
    )

    console.log(
      `[Mock Maps] Distance Matrix: ${origins} → ${destinations} (${mode})`
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Mock Maps] Error in distance matrix:', error)
    return NextResponse.json(
      { status: 'ERROR' },
      { status: 500 }
    )
  }
}
