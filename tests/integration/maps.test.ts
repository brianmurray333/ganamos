import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, OPTIONS } from '@/app/api/maps/route'

describe('/api/maps endpoint', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('GET request', () => {
    it('should return JavaScript loader with valid API key', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/javascript')
      expect(text).toContain('window.google')
      expect(text).toContain('maps.googleapis.com/maps/api/js')
      expect(text).toContain('test-api-key-12345')
      expect(text).toContain('libraries=places')
    })

    it('should include IIFE pattern that checks for existing Google Maps', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('(function()')
      expect(text).toContain('window.google && window.google.maps && window.google.maps.places')
      expect(text).toContain('document.createElement(\'script\')')
      expect(text).toContain('document.head.appendChild')
    })

    it('should include error handling in script', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('script.onerror')
      expect(text).toContain('Failed to load Google Maps API')
    })

    it('should set 1-hour cache control header', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'

      const response = await GET()

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })

    it('should include CORS headers in development mode', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      process.env.NODE_ENV = 'development'

      const response = await GET()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should not include CORS headers in production mode', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      process.env.NODE_ENV = 'production'

      const response = await GET()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('should return console.error when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/javascript')
      expect(text).toContain('console.error')
      expect(text).toContain('Google Maps API key not configured')
    })

    it('should return console.error with CORS headers on missing API key', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    })

    it('should handle errors gracefully and return valid JavaScript', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'

      // Mock console.error to suppress error output in tests
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await GET()
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/javascript')
      expect(typeof text).toBe('string')

      consoleErrorSpy.mockRestore()
    })

    it('should include script async and defer attributes', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('script.async = true')
      expect(text).toContain('script.defer = true')
    })
  })

  describe('OPTIONS request', () => {
    it('should return CORS preflight response', async () => {
      const response = await OPTIONS()

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })
  })
})