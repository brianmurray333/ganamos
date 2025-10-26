import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  usePathname: () => '/test-path',
  useParams: () => ({}),
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock fetch for Google Maps API endpoints
global.fetch = vi.fn((url: string | URL) => {
  const urlString = typeof url === 'string' ? url : url.toString()

  // Mock Google Geocoding API
  if (urlString.includes('maps.googleapis.com/maps/api/geocode')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'San Francisco, CA 94103, USA',
            address_components: [
              { types: ['locality'], long_name: 'San Francisco', short_name: 'SF' },
              { types: ['administrative_area_level_1'], long_name: 'California', short_name: 'CA' },
              { types: ['administrative_area_level_2'], long_name: 'San Francisco County', short_name: 'San Francisco County' },
              { types: ['country'], long_name: 'United States', short_name: 'US' }
            ]
          }
        ]
      })
    } as Response)
  }

  // Mock Google Distance Matrix API
  if (urlString.includes('maps.googleapis.com/maps/api/distancematrix')) {
    const isWalking = urlString.includes('mode=walking')
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        rows: [
          {
            elements: [
              {
                duration: {
                  text: isWalking ? '45 mins' : '15 mins',
                  value: isWalking ? 2700 : 900
                },
                distance: {
                  text: isWalking ? '3.2 km' : '3.2 km',
                  value: 3200
                }
              }
            ]
          }
        ]
      })
    } as Response)
  }

  // Default mock for other fetch calls
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => ''
  } as Response)
})

// Mock navigator.geolocation
Object.defineProperty(global.navigator, 'geolocation', {
  writable: true,
  value: {
    getCurrentPosition: vi.fn((success, error) => {
      // Simulate successful geolocation with San Francisco coordinates
      success({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      })
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn()
  }
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
})