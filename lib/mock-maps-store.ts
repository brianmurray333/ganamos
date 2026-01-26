/**
 * In-memory store for mock Google Maps API responses
 * Manages geocoding and distance matrix data for development/testing
 */

interface MockGeocodingResult {
  coordinates: string // "lat,lng" key
  result: {
    results: Array<{
      formatted_address: string
      address_components: Array<{
        long_name: string
        short_name: string
        types: string[]
      }>
      geometry: {
        location: { lat: number; lng: number }
      }
    }>
    status: string
  }
  createdAt: Date
}

class MockMapsStore {
  private geocodingCache: Map<string, MockGeocodingResult> = new Map()

  /**
   * Auto-generate a mock geocoding result for any coordinates
   */
  getGeocodingResult(latitude: number, longitude: number): any {
    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`

    // Check cache
    if (this.geocodingCache.has(key)) {
      return this.geocodingCache.get(key)!.result
    }

    // Auto-generate mock result
    const cityNames = [
      'San Francisco',
      'New York',
      'London',
      'Tokyo',
      'Berlin',
      'Sydney',
    ]
    const stateNames = [
      'California',
      'New York',
      'England',
      'Kantō',
      'Berlin',
      'New South Wales',
    ]
    const stateShort = ['CA', 'NY', 'ENG', 'KT', 'BE', 'NSW']
    const countries = [
      'United States',
      'United States',
      'United Kingdom',
      'Japan',
      'Germany',
      'Australia',
    ]
    const countryCodes = ['US', 'US', 'GB', 'JP', 'DE', 'AU']

    // Use lat/lng to deterministically pick a location
    const index =
      Math.abs(Math.floor(latitude * 100 + longitude * 100)) %
      cityNames.length

    const mockResult = {
      results: [
        {
          formatted_address: `${Math.floor(Math.abs(latitude * 100))} Mock St, ${cityNames[index]}, ${stateNames[index]}, ${countries[index]}`,
          address_components: [
            {
              long_name: `${Math.floor(Math.abs(latitude * 100))} Mock St`,
              short_name: `${Math.floor(Math.abs(latitude * 100))} Mock St`,
              types: ['street_address'],
            },
            {
              long_name: cityNames[index],
              short_name: cityNames[index],
              types: ['locality', 'political'],
            },
            {
              long_name: stateNames[index],
              short_name: stateShort[index],
              types: ['administrative_area_level_1', 'political'],
            },
            {
              long_name: countries[index],
              short_name: countryCodes[index],
              types: ['country', 'political'],
            },
          ],
          geometry: {
            location: { lat: latitude, lng: longitude },
          },
        },
      ],
      status: 'OK',
    }

    // Cache result
    this.geocodingCache.set(key, {
      coordinates: key,
      result: mockResult,
      createdAt: new Date(),
    })

    return mockResult
  }

  /**
   * Calculate mock travel time based on coordinate distance
   */
  calculateTravelTime(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    mode: 'walking' | 'driving'
  ): string {
    // Calculate approximate distance using Haversine formula
    const R = 6371 // Earth radius in km
    const dLat = ((destLat - originLat) * Math.PI) / 180
    const dLng = ((destLng - originLng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((originLat * Math.PI) / 180) *
        Math.cos((destLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceKm = R * c

    // Calculate time based on mode
    const speedKmh = mode === 'walking' ? 5 : 50 // 5 km/h walking, 50 km/h driving
    const timeHours = distanceKm / speedKmh
    const timeMinutes = Math.round(timeHours * 60)

    // Format like Google Maps
    if (timeMinutes < 60) {
      return `${timeMinutes} min`
    } else {
      const hours = Math.floor(timeMinutes / 60)
      const mins = timeMinutes % 60
      return mins > 0 ? `${hours} hour ${mins} mins` : `${hours} hour`
    }
  }

  /**
   * Get distance matrix result
   */
  getDistanceMatrixResult(
    origin: string,
    destination: string,
    mode: 'walking' | 'driving'
  ): any {
    // Parse coordinates from "lat,lng" format
    const [originLat, originLng] = origin.split(',').map(Number)
    const [destLat, destLng] = destination.split(',').map(Number)

    const durationText = this.calculateTravelTime(
      originLat,
      originLng,
      destLat,
      destLng,
      mode
    )

    // Calculate distance
    const R = 6371
    const dLat = ((destLat - originLat) * Math.PI) / 180
    const dLng = ((destLng - originLng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((originLat * Math.PI) / 180) *
        Math.cos((destLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceKm = R * c
    const distanceText =
      distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m`
        : `${distanceKm.toFixed(1)} km`

    // Parse duration for value in seconds
    const durationValue = (() => {
      const hourMatch = durationText.match(/(\d+)\s*hour/)
      const minMatch = durationText.match(/(\d+)\s*min/)
      const hours = hourMatch ? parseInt(hourMatch[1]) : 0
      const minutes = minMatch ? parseInt(minMatch[1]) : 0
      return hours * 3600 + minutes * 60
    })()

    return {
      status: 'OK',
      origin_addresses: [origin],
      destination_addresses: [destination],
      rows: [
        {
          elements: [
            {
              status: 'OK',
              duration: {
                value: durationValue, // seconds
                text: durationText,
              },
              distance: {
                value: Math.round(distanceKm * 1000), // meters
                text: distanceText,
              },
            },
          ],
        },
      ],
    }
  }

  /**
   * Reset all cached data (for testing)
   */
  reset(): void {
    this.geocodingCache.clear()
  }

  /**
   * Generate a mock static map image as SVG data URL
   * Returns deterministic SVG with grid background, marker, coordinates, and watermark
   */
  getStaticMapImage(
    latitude: number,
    longitude: number,
    width: number = 640,
    height: number = 400,
    zoom: number = 15
  ): string {
    // Format coordinates for display
    const latDir = latitude >= 0 ? 'N' : 'S'
    const lngDir = longitude >= 0 ? 'E' : 'W'
    const coordLabel = `${Math.abs(latitude).toFixed(4)}°${latDir}, ${Math.abs(longitude).toFixed(4)}°${lngDir}`

    // Generate SVG with grid background, marker, and labels
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- Grid background -->
  <defs>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  
  <!-- Orange marker at center -->
  <g transform="translate(${width / 2}, ${height / 2 - 20})">
    <!-- Pin body -->
    <ellipse cx="0" cy="25" rx="8" ry="4" fill="rgba(255, 152, 0, 0.3)"/>
    <path d="M 0,-20 C -10,-20 -15,-10 -15,0 C -15,10 0,25 0,25 C 0,25 15,10 15,0 C 15,-10 10,-20 0,-20 Z" 
          fill="#ff9800" stroke="#fff" stroke-width="2"/>
    <!-- Pin inner circle -->
    <circle cx="0" cy="-5" r="6" fill="#fff"/>
  </g>
  
  <!-- Coordinate label -->
  <rect x="${width / 2 - 100}" y="${height - 50}" width="200" height="30" 
        fill="rgba(255, 255, 255, 0.95)" stroke="#ddd" stroke-width="1" rx="4"/>
  <text x="${width / 2}" y="${height - 28}" 
        font-family="Arial, sans-serif" font-size="12" fill="#333" 
        text-anchor="middle" font-weight="500">${coordLabel}</text>
  
  <!-- MOCK MODE watermark -->
  <text x="20" y="30" 
        font-family="Arial, sans-serif" font-size="20" fill="rgba(255, 87, 34, 0.7)" 
        font-weight="bold" letter-spacing="2">MOCK MODE</text>
  
  <!-- Zoom indicator -->
  <rect x="${width - 70}" y="20" width="50" height="24" 
        fill="rgba(255, 255, 255, 0.9)" stroke="#ddd" stroke-width="1" rx="3"/>
  <text x="${width - 45}" y="36" 
        font-family="Arial, sans-serif" font-size="12" fill="#666" 
        text-anchor="middle">Zoom ${zoom}</text>
</svg>`.trim()

    // Return as data URL for direct embedding
    const base64 = Buffer.from(svg).toString('base64')
    return `data:image/svg+xml;base64,${base64}`
  }
}

// Singleton instance that survives Next.js hot reloads and route compilations
// This pattern ensures the same store is used across all route handlers
const globalForMaps = globalThis as unknown as {
  mapsStore: MockMapsStore | undefined
}

export const mockMapsStore =
  globalForMaps.mapsStore ?? new MockMapsStore()

// Store reference in globalThis so it survives module reloads
if (!globalForMaps.mapsStore) {
  globalForMaps.mapsStore = mockMapsStore
}
