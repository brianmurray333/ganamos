import { vi } from 'vitest'

/**
 * Mock Google Maps API responses and data fixtures
 */

// Test data constants - San Francisco coordinates
export const MOCK_SF_COORDS = {
  latitude: 37.7749,
  longitude: -122.4194,
} as const

export const MOCK_OAKLAND_COORDS = {
  latitude: 37.8044,
  longitude: -122.2712,
} as const

export const MOCK_LA_COORDS = {
  latitude: 34.0522,
  longitude: -118.2437,
} as const

// Mock geocoding response for San Francisco
export const mockGeocodingResponse = {
  status: 'OK',
  results: [
    {
      formatted_address: '1 Market St, San Francisco, CA 94105, USA',
      address_components: [
        {
          long_name: 'San Francisco',
          short_name: 'SF',
          types: ['locality', 'political'],
        },
        {
          long_name: 'California',
          short_name: 'CA',
          types: ['administrative_area_level_1', 'political'],
        },
        {
          long_name: 'San Francisco County',
          short_name: 'San Francisco County',
          types: ['administrative_area_level_2', 'political'],
        },
        {
          long_name: 'United States',
          short_name: 'US',
          types: ['country', 'political'],
        },
      ],
      geometry: {
        location: { lat: 37.7749, lng: -122.4194 },
        location_type: 'APPROXIMATE',
      },
    },
  ],
}

// Mock geocoding response for invalid coordinates
export const mockGeocodingErrorResponse = {
  status: 'ZERO_RESULTS',
  results: [],
}

// Mock Distance Matrix API response
export const mockDistanceMatrixResponse = {
  status: 'OK',
  origin_addresses: ['San Francisco, CA, USA'],
  destination_addresses: ['Oakland, CA, USA'],
  rows: [
    {
      elements: [
        {
          status: 'OK',
          duration: {
            value: 1800,
            text: '30 mins',
          },
          distance: {
            value: 20000,
            text: '12.4 mi',
          },
        },
      ],
    },
  ],
}

// Mock Distance Matrix API response with hours and minutes
export const mockDistanceMatrixLongDurationResponse = {
  status: 'OK',
  origin_addresses: ['San Francisco, CA, USA'],
  destination_addresses: ['Los Angeles, CA, USA'],
  rows: [
    {
      elements: [
        {
          status: 'OK',
          duration: {
            value: 23400,
            text: '6 hours 30 mins',
          },
          distance: {
            value: 615000,
            text: '382 mi',
          },
        },
      ],
    },
  ],
}

// Mock Distance Matrix API error response
export const mockDistanceMatrixErrorResponse = {
  status: 'ZERO_RESULTS',
  origin_addresses: [],
  destination_addresses: [],
  rows: [],
}

// Mock Places Autocomplete predictions
export const mockAutocompletePredictions = [
  {
    place_id: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
    description: 'San Francisco, CA, USA',
    structured_formatting: {
      main_text: 'San Francisco',
      secondary_text: 'CA, USA',
    },
  },
  {
    place_id: 'ChIJr-Upf5qAhYARg2fK_1E9sKE',
    description: 'San Francisco International Airport, San Francisco, CA, USA',
    structured_formatting: {
      main_text: 'San Francisco International Airport',
      secondary_text: 'San Francisco, CA, USA',
    },
  },
]

// Mock Place Details response
export const mockPlaceDetails = {
  place_id: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
  name: 'San Francisco',
  formatted_address: 'San Francisco, CA, USA',
  geometry: {
    location: {
      lat: () => 37.7749,
      lng: () => -122.4194,
    },
    viewport: {
      getNorthEast: () => ({ lat: () => 37.8324, lng: () => -122.3482 }),
      getSouthWest: () => ({ lat: () => 37.7074, lng: () => -122.5168 }),
    },
  },
}

/**
 * Create mock Google Maps namespace with essential classes and services
 */
export function createGoogleMapsMock() {
  // Mock LatLng class
  class MockLatLng {
    constructor(public lat: number, public lng: number) {}
    lat() {
      return this.lat
    }
    lng() {
      return this.lng
    }
  }

  // Mock LatLngBounds class
  class MockLatLngBounds {
    private ne: MockLatLng
    private sw: MockLatLng

    constructor(sw?: { lat: number; lng: number }, ne?: { lat: number; lng: number }) {
      this.sw = sw ? new MockLatLng(sw.lat, sw.lng) : new MockLatLng(0, 0)
      this.ne = ne ? new MockLatLng(ne.lat, ne.lng) : new MockLatLng(0, 0)
    }

    getNorthEast() {
      return this.ne
    }

    getSouthWest() {
      return this.sw
    }

    extend(point: MockLatLng) {
      return this
    }
  }

  // Mock Map class
  class MockMap {
    private center: MockLatLng = new MockLatLng(37.7749, -122.4194)
    private zoom: number = 13
    private listeners: Record<string, Function[]> = {}

    constructor(element: HTMLElement, options?: any) {
      if (options?.center) {
        this.center = new MockLatLng(options.center.lat, options.center.lng)
      }
      if (options?.zoom) {
        this.zoom = options.zoom
      }
    }

    setCenter(center: MockLatLng | { lat: number; lng: number }) {
      if (center instanceof MockLatLng) {
        this.center = center
      } else {
        this.center = new MockLatLng(center.lat, center.lng)
      }
    }

    getCenter() {
      return this.center
    }

    setZoom(zoom: number) {
      this.zoom = zoom
    }

    getZoom() {
      return this.zoom
    }

    fitBounds(bounds: MockLatLngBounds) {
      // Mock implementation
    }

    addListener(event: string, handler: Function) {
      if (!this.listeners[event]) {
        this.listeners[event] = []
      }
      this.listeners[event].push(handler)
      return { remove: vi.fn() }
    }

    getPanes() {
      return {
        overlayMouseTarget: document.createElement('div'),
        overlayLayer: document.createElement('div'),
        floatPane: document.createElement('div'),
      }
    }
  }

  // Mock Marker class
  class MockMarker {
    private position: MockLatLng
    private map: MockMap | null = null
    private listeners: Record<string, Function[]> = {}

    constructor(options: any) {
      this.position = new MockLatLng(options.position.lat, options.position.lng)
      if (options.map) {
        this.map = options.map
      }
    }

    setPosition(position: MockLatLng) {
      this.position = position
    }

    getPosition() {
      return this.position
    }

    setMap(map: MockMap | null) {
      this.map = map
    }

    getMap() {
      return this.map
    }

    addListener(event: string, handler: Function) {
      if (!this.listeners[event]) {
        this.listeners[event] = []
      }
      this.listeners[event].push(handler)
      return { remove: vi.fn() }
    }

    setIcon(icon: any) {}
  }

  // Mock OverlayView class
  class MockOverlayView {
    private map: MockMap | null = null
    
    setMap(map: MockMap | null) {
      this.map = map
      if (map && this.onAdd) {
        this.onAdd()
      }
      if (!map && this.onRemove) {
        this.onRemove()
      }
    }

    getMap() {
      return this.map
    }

    getPanes() {
      return this.map?.getPanes()
    }

    getProjection() {
      return {
        fromLatLngToDivPixel: (latLng: MockLatLng) => ({
          x: 100,
          y: 100,
        }),
      }
    }

    onAdd() {}
    draw() {}
    onRemove() {}
  }

  // Mock AutocompleteService
  class MockAutocompleteService {
    getPlacePredictions(
      request: { input: string; types?: string[] },
      callback: (predictions: any[], status: string) => void
    ) {
      setTimeout(() => {
        if (request.input.toLowerCase().includes('san francisco')) {
          callback(mockAutocompletePredictions, 'OK')
        } else {
          callback([], 'ZERO_RESULTS')
        }
      }, 0)
    }
  }

  // Mock PlacesService
  class MockPlacesService {
    constructor(map: MockMap) {}

    getDetails(
      request: { placeId: string },
      callback: (place: any, status: string) => void
    ) {
      setTimeout(() => {
        if (request.placeId === 'ChIJIQBpAG2ahYAR_6128GcTUEo') {
          callback(mockPlaceDetails, 'OK')
        } else {
          callback(null, 'NOT_FOUND')
        }
      }, 0)
    }
  }

  // Create the mock google.maps namespace
  const googleMaps = {
    Map: MockMap,
    Marker: MockMarker,
    OverlayView: MockOverlayView,
    LatLng: MockLatLng,
    LatLngBounds: MockLatLngBounds,
    Size: vi.fn((width, height) => ({ width, height })),
    Point: vi.fn((x, y) => ({ x, y })),
    MapTypeId: {
      ROADMAP: 'roadmap',
      SATELLITE: 'satellite',
      HYBRID: 'hybrid',
      TERRAIN: 'terrain',
    },
    SymbolPath: {
      CIRCLE: 0,
      FORWARD_CLOSED_ARROW: 1,
      FORWARD_OPEN_ARROW: 2,
      BACKWARD_CLOSED_ARROW: 3,
      BACKWARD_OPEN_ARROW: 4,
    },
    places: {
      AutocompleteService: MockAutocompleteService,
      PlacesService: MockPlacesService,
      PlacesServiceStatus: {
        OK: 'OK',
        ZERO_RESULTS: 'ZERO_RESULTS',
        NOT_FOUND: 'NOT_FOUND',
        INVALID_REQUEST: 'INVALID_REQUEST',
      },
    },
    event: {
      addListener: vi.fn((instance, eventName, handler) => ({
        remove: vi.fn(),
      })),
      addListenerOnce: vi.fn((instance, eventName, handler) => {
        // Simulate immediate callback for 'tilesloaded' event
        if (eventName === 'tilesloaded') {
          setTimeout(handler, 0)
        }
        return { remove: vi.fn() }
      }),
      removeListener: vi.fn(),
      clearInstanceListeners: vi.fn(),
    },
  }

  return googleMaps
}

/**
 * Setup Google Maps mocks for tests
 */
export function setupGoogleMapsMocks() {
  // Create mock Google Maps namespace
  const googleMaps = createGoogleMapsMock()

  // Attach to window object
  if (typeof window !== 'undefined') {
    ;(window as any).google = {
      maps: googleMaps,
    }
  }

  // Mock fetch for Google Maps API endpoints
  const originalFetch = global.fetch

  global.fetch = vi.fn((url: string | Request, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.url

    // Mock Geocoding API
    if (urlString.includes('maps.googleapis.com/maps/api/geocode')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          // Check if coordinates are valid (San Francisco area)
          if (urlString.includes('37.7') && urlString.includes('-122.4')) {
            return mockGeocodingResponse
          }
          return mockGeocodingErrorResponse
        },
      } as Response)
    }

    // Mock Distance Matrix API
    if (urlString.includes('maps.googleapis.com/maps/api/distancematrix')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          // Check if it's a long distance request
          if (urlString.includes('Los Angeles')) {
            return mockDistanceMatrixLongDurationResponse
          }
          return mockDistanceMatrixResponse
        },
      } as Response)
    }

    // Mock Static Maps API (just return a success response)
    if (urlString.includes('maps.googleapis.com/maps/api/staticmap')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: async () => new Blob(['mock-image'], { type: 'image/png' }),
      } as Response)
    }

    // Fall back to original fetch for other URLs
    return originalFetch(url, options)
  }) as any

  return { googleMaps, originalFetch }
}

/**
 * Cleanup Google Maps mocks after tests
 */
export function cleanupGoogleMapsMocks(originalFetch?: typeof fetch) {
  if (typeof window !== 'undefined') {
    delete (window as any).google
  }

  if (originalFetch) {
    global.fetch = originalFetch
  }
}

/**
 * Mock navigator.geolocation for location tests
 */
export function setupGeolocationMock(
  coords: { latitude: number; longitude: number } = { latitude: 37.7749, longitude: -122.4194 }
) {
  const mockGeolocation = {
    getCurrentPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback) => {
      setTimeout(() => {
        success({
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        })
      }, 0)
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  }

  Object.defineProperty(global.navigator, 'geolocation', {
    writable: true,
    value: mockGeolocation,
  })

  return mockGeolocation
}

/**
 * Mock localStorage for caching tests
 */
export function setupLocalStorageMock() {
  const store: Record<string, string> = {}

  const mockLocalStorage = {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key])
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  }

  Object.defineProperty(global, 'localStorage', {
    writable: true,
    value: mockLocalStorage,
  })

  return { mockLocalStorage, store }
}