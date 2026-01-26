/**
 * Google Maps Static API Proxy Endpoint
 * Securely proxies requests to Google Maps Static API or returns mock SVG
 * API key is never exposed to the client
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
  try {
    const searchParams = request.nextUrl.searchParams
    const latitude = parseFloat(searchParams.get('latitude') || '0')
    const longitude = parseFloat(searchParams.get('longitude') || '0')
    const zoom = searchParams.get('zoom') || '15'
    const size = searchParams.get('size') || '640x400'
    const scale = searchParams.get('scale') || '2'
    const maptype = searchParams.get('maptype') || 'roadmap'
    const markers = searchParams.get('markers') || `color:0xF7931A|${latitude},${longitude}`
    const style = searchParams.get('style') || ''

    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude)) {
      return new NextResponse('Invalid coordinates', { status: 400 })
    }

    // Mock mode: return SVG placeholder
    if (serverEnv?.useMock) {
      const svg = generateMockMapSVG(latitude, longitude, size)
      console.log(`[Mock Maps] Static Map: ${latitude},${longitude}`)
      
      return new NextResponse(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Real mode: proxy Google Static Maps API
    const apiKey = serverEnv?.googleMaps.apiKey
    if (!apiKey) {
      console.error('[Maps API] Google Maps API key not configured')
      return new NextResponse('Maps API not configured', { status: 500 })
    }

    // Build Google Static Maps URL
    const googleParams = new URLSearchParams({
      center: `${latitude},${longitude}`,
      zoom,
      size,
      scale,
      maptype,
      key: apiKey,
      markers,
    })

    // Add style parameters (can be multiple)
    if (style) {
      const styles = style.split('|')
      styles.forEach(s => {
        if (s) googleParams.append('style', s)
      })
    }

    const googleUrl = `https://maps.googleapis.com/maps/api/staticmap?${googleParams.toString()}`

    console.log(`[Maps API] Fetching static map for ${latitude},${longitude}`)

    // Fetch image from Google
    const response = await fetch(googleUrl)
    
    if (!response.ok) {
      console.error(`[Maps API] Google Maps API error: ${response.status}`)
      return new NextResponse('Failed to fetch map', { status: response.status })
    }

    const imageBuffer = await response.arrayBuffer()

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[Maps API] Error in static map endpoint:', error)
    return new NextResponse('Internal server error', { status: 500 })
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
