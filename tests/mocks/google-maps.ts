import { vi } from 'vitest'

/**
 * Mock Google Maps API responses for geocoding tests
 */

// Track fetch calls for testing
export const fetchCallHistory: Array<{ url: string; options?: any }> = []

let mockGeocodingResponse: any = null
let mockError = false

/**
 * Reset all Google Maps mocks to initial state
 */
export function resetGoogleMapsMocks() {
  mockGeocodingResponse = null
  mockError = false
  fetchCallHistory.length = 0
  
  // Reset fetch to mock implementation that tracks calls
  global.fetch = vi.fn(async (url: string, options?: any) => {
    const urlStr = url.toString()
    fetchCallHistory.push({ url: urlStr, options })
    
    if (mockError) {
      throw new Error('Network error')
    }
    
    // Geocoding API response
    if (urlStr.includes('maps.googleapis.com/maps/api/geocode')) {
      return {
        ok: true,
        json: async () => mockGeocodingResponse || {
          status: 'OK',
          results: []
        }
      } as Response
    }
    
    // Travel times API response
    if (urlStr.includes('travel-times')) {
      return {
        ok: true,
        json: async () => ({
          walking: '30min',
          driving: '10min'
        })
      } as Response
    }
    
    return {
      ok: true,
      json: async () => ({})
    } as Response
  }) as any
}

/**
 * Set mock geocoding API response
 */
export function setMockGeocodingResponse(response: any) {
  mockGeocodingResponse = response
  mockError = false
}

/**
 * Enable/disable mock errors
 */
export function setMockError(error: boolean) {
  mockError = error
}

/**
 * Mock successful geolocation
 */
export function mockGeolocationSuccess(latitude: number, longitude: number) {
  const mockGeolocation = {
    getCurrentPosition: vi.fn((success) => {
      success({
        coords: {
          latitude,
          longitude,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      })
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  }

  Object.defineProperty(global.navigator, 'geolocation', {
    value: mockGeolocation,
    writable: true,
    configurable: true,
  })

  return mockGeolocation
}

/**
 * Mock geolocation permission denied
 */
export function mockGeolocationDenied() {
  const mockGeolocation = {
    getCurrentPosition: vi.fn((_success, error) => {
      error({
        code: 1, // PERMISSION_DENIED
        message: 'User denied Geolocation',
      })
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  }

  Object.defineProperty(global.navigator, 'geolocation', {
    value: mockGeolocation,
    writable: true,
    configurable: true,
  })

  return mockGeolocation
}

/**
 * Mock geolocation timeout
 */
export function mockGeolocationTimeout() {
  const mockGeolocation = {
    getCurrentPosition: vi.fn((_success, error) => {
      error({
        code: 3, // TIMEOUT
        message: 'Geolocation timeout',
      })
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  }

  Object.defineProperty(global.navigator, 'geolocation', {
    value: mockGeolocation,
    writable: true,
    configurable: true,
  })

  return mockGeolocation
}
