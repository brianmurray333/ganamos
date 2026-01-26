/**
 * Mock Google Maps Static API Endpoint
 * Returns SVG placeholder map images for development/testing
 * Only active when USE_MOCKS=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'

/**
 * Generate mock map SVG with coordinates and "MOCK MAP" indicator
 */
function generateMockMapSVG(
  latitude: number,
  longitude: number,
  size: string
): string {
  const [width, height] = size.split('x').map(Number)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#E5E7EB"/>
  
  <!-- Grid pattern for map feel -->
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#D1D5DB" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  
  <!-- Mock map indicator -->
  <rect x="${width / 2 - 150}" y="20" width="300" height="60" fill="white" opacity="0.9" rx="8"/>
  <text x="${width / 2}" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#374151">
    MOCK MAP
  </text>
  
  <!-- Coordinates display -->
  <rect x="${width / 2 - 120}" y="${height - 80}" width="240" height="50" fill="white" opacity="0.9" rx="4"/>
  <text x="${width / 2}" y="${height - 50}" text-anchor="middle" font-family="monospace" font-size="16" fill="#6B7280">
    ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
  </text>
  
  <!-- Location marker -->
  <circle cx="${width / 2}" cy="${height / 2}" r="12" fill="#F59E0B" opacity="0.8"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="6" fill="#FFF" opacity="0.9"/>
  
  <!-- Pulsing ring animation -->
  <circle cx="${width / 2}" cy="${height / 2}" r="12" fill="none" stroke="#F59E0B" stroke-width="2" opacity="0.6">
    <animate attributeName="r" from="12" to="24" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`
}

export async function GET(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: 'Mock mode is not enabled. Set USE_MOCKS=true' },
      { status: 403 }
    )
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const latitude = parseFloat(searchParams.get('latitude') || '0')
    const longitude = parseFloat(searchParams.get('longitude') || '0')
    const size = searchParams.get('size') || '640x400'

    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude)) {
      return new NextResponse('Invalid coordinates', { status: 400 })
    }

    // Generate mock SVG
    const svg = generateMockMapSVG(latitude, longitude, size)

    console.log(
      `[Mock Maps] Static Map: ${latitude},${longitude} (${size})`
    )

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[Mock Maps] Error in static map endpoint:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
