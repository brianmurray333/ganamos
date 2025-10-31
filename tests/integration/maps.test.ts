import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET, OPTIONS } from '@/app/api/maps/route'

/**
 * Integration tests for GET /api/maps endpoint
 * 
 * The /api/maps endpoint implements a JavaScript proxy pattern to securely
 * load the Google Maps API client-side without exposing the API key.
 * It returns executable JavaScript (not JSON) that dynamically injects
 * the Google Maps script with Places library.
 * 
 * Test Coverage:
 * - API key validation and security
 * - JavaScript proxy pattern correctness
 * - HTTP headers (Content-Type, Cache-Control, CORS)
 * - Places library integration
 * - Error handling with graceful degradation
 * - CORS preflight (OPTIONS) handling
 */
describe('GET /api/maps', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('API key validation', () => {
    it('should return JavaScript loader when API key is configured', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()

      expect(response.status).toBe(200)
      
      const text = await response.text()
      // Verify it's a function expression
      expect(text).toContain('function()')
      expect(text).toContain('window.google')
      expect(text).toContain('document.createElement')
      expect(text).toContain('script.src')
    })

    it('should include API key in script URL', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-67890'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('test-api-key-67890')
      expect(text).toContain('maps.googleapis.com/maps/api/js')
    })

    it('should return console.error JavaScript when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      // Still returns 200 status (graceful degradation)
      expect(response.status).toBe(200)
      
      const text = await response.text()
      expect(text).toContain('console.error')
      expect(text).toContain('Google Maps API key not configured')
    })

    it('should not expose API key in error response', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()
      const text = await response.text()

      // Verify no sensitive data leakage
      expect(text).not.toContain('GOOGLE_MAPS_API_KEY')
      expect(text).not.toContain('process.env')
    })

    it('should log error to console when API key is missing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      delete process.env.GOOGLE_MAPS_API_KEY
      await GET()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Google Maps API key not found')
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Places library integration', () => {
    it('should include places library in script URL', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('libraries=places')
    })

    it('should check for existing Places API before loading', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      // Verify it checks window.google.maps.places
      expect(text).toContain('window.google')
      expect(text).toContain('window.google.maps')
      expect(text).toContain('window.google.maps.places')
      expect(text).toContain('return') // Early return if already loaded
    })
  })

  describe('HTTP headers', () => {
    it('should set Content-Type to application/javascript', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()

      expect(response.headers.get('Content-Type')).toBe('application/javascript')
    })

    it('should set Cache-Control for 1 hour (3600 seconds)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })

    it('should include CORS headers in development mode', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'
      process.env.NODE_ENV = 'development'

      const response = await GET()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should not include CORS headers in production mode for success response', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'
      process.env.NODE_ENV = 'production'

      const response = await GET()

      // Should still have Cache-Control
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
      
      // CORS headers should not be present in production success response
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('should include CORS headers even on error responses', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should set Content-Type to application/javascript even on error', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      expect(response.headers.get('Content-Type')).toBe('application/javascript')
    })
  })

  describe('JavaScript proxy pattern', () => {
    it('should return IIFE (Immediately-Invoked Function Expression)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      // IIFE pattern: (function() { ... })();
      expect(text).toMatch(/\(function\(\)\s*\{/)
      expect(text).toMatch(/\}\)\(\);?\s*$/)
    })

    it('should create script element dynamically', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain("document.createElement('script')")
      expect(text).toContain('script.src')
      expect(text).toContain('script.async')
      expect(text).toContain('script.defer')
    })

    it('should append script to document.head', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('document.head.appendChild')
    })

    it('should include onerror handler for script loading failures', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      expect(text).toContain('script.onerror')
      expect(text).toContain('Failed to load Google Maps API')
    })

    it('should return valid executable JavaScript', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      // Should not throw syntax error when parsed
      expect(() => {
        new Function(text)
      }).not.toThrow()
    })

    it('should construct correct Google Maps API URL', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'

      const response = await GET()
      const text = await response.text()

      // Verify URL structure
      expect(text).toContain('https://maps.googleapis.com/maps/api/js')
      expect(text).toContain('?key=')
      expect(text).toContain('&libraries=places')
    })
  })

  describe('error handling', () => {
    it('should handle exceptions gracefully', async () => {
      // Simulate an error by making process.env access throw
      Object.defineProperty(process.env, 'GOOGLE_MAPS_API_KEY', {
        get() {
          throw new Error('Environment variable access error')
        },
        configurable: true
      })

      const response = await GET()

      // Should still return 200 with error handling JS
      expect(response.status).toBe(200)
      
      const text = await response.text()
      expect(text).toContain('console.error')
      expect(text).toContain('Error loading Google Maps API')
    })

    it('should return valid JavaScript even on error', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()
      const text = await response.text()

      // Should be valid JS that can be executed without throwing
      expect(() => {
        new Function(text)
      }).not.toThrow()
    })

    it('should log error to console on exception', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      // Force an error
      Object.defineProperty(process.env, 'GOOGLE_MAPS_API_KEY', {
        get() {
          throw new Error('Test error')
        },
        configurable: true
      })

      await GET()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in maps API route:', expect.any(Error))
      
      consoleErrorSpy.mockRestore()
    })

    it('should not expose error stack traces in response', async () => {
      Object.defineProperty(process.env, 'GOOGLE_MAPS_API_KEY', {
        get() {
          throw new Error('Test error with sensitive stack trace')
        },
        configurable: true
      })

      const response = await GET()
      const text = await response.text()

      // Should not leak internal error details
      expect(text).not.toContain('stack trace')
      expect(text).not.toContain('Error: Test error')
    })
  })

  describe('security considerations', () => {
    it('should not expose server-side environment variables', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'secret-key-12345'
      process.env.DATABASE_URL = 'postgresql://secret'
      process.env.SECRET_TOKEN = 'super-secret'

      const response = await GET()
      const text = await response.text()

      // API key should be in the script, but no other env vars
      expect(text).toContain('secret-key-12345')
      expect(text).not.toContain('DATABASE_URL')
      expect(text).not.toContain('SECRET_TOKEN')
      expect(text).not.toContain('postgresql')
    })

    it('should sanitize API key in error scenarios', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()
      const text = await response.text()

      // Should not reveal the missing key name or environment details
      expect(text).not.toContain('GOOGLE_MAPS_API_KEY')
      expect(text).not.toContain('undefined')
    })
  })
})

describe('OPTIONS /api/maps', () => {
  it('should return 200 status for CORS preflight', async () => {
    const response = await OPTIONS()

    expect(response.status).toBe(200)
  })

  it('should include CORS headers for preflight request', async () => {
    const response = await OPTIONS()

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
  })

  it('should return empty body for preflight request', async () => {
    const response = await OPTIONS()

    const text = await response.text()
    expect(text).toBe('')
  })

  it('should support preflight for cross-origin requests', async () => {
    const response = await OPTIONS()

    // Verify all necessary CORS headers are present
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS')
  })
})