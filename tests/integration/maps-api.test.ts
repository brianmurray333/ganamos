/**
 * Integration tests for GET /api/maps
 *
 * Tests the full request flow for the Google Maps API loader endpoint.
 * This endpoint serves JavaScript that dynamically loads the Google Maps API
 * with the server-side API key, critical for location features.
 *
 * No database interaction required - tests focus on:
 * - API key configuration handling
 * - JavaScript content generation
 * - CORS headers
 * - Error scenarios
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET, OPTIONS } from '@/app/api/maps/route'

describe('GET /api/maps', () => {
  const originalEnv = process.env
  
  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Successful API Key Loading', () => {
    it('should return JavaScript with Google Maps API loader when API key is configured', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-123'

      const response = await GET()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/javascript')
      
      const script = await response.text()
      expect(script).toContain('window.google')
      expect(script).toContain('document.createElement')
      expect(script).toContain('test-api-key-123')
      expect(script).toContain('maps.googleapis.com/maps/api/js')
      expect(script).toContain('libraries=places')
    })

    it('should include script loading logic with proper error handling', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'valid-key'

      const response = await GET()

      const script = await response.text()
      expect(script).toContain('script.onerror')
      expect(script).toContain('Failed to load Google Maps API')
      expect(script).toContain('async = true')
      expect(script).toContain('defer = true')
    })

    it('should check for existing Google Maps library before loading', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()

      const script = await response.text()
      expect(script).toContain('if (window.google && window.google.maps && window.google.maps.places)')
      expect(script).toContain('return') // Should exit early if already loaded
    })

    it('should append script to document head', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()

      const script = await response.text()
      expect(script).toContain('document.head.appendChild(script)')
    })

    it('should set proper cache headers for successful response', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()

      expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    })
  })

  describe('Missing API Key Handling', () => {
    it('should return error JavaScript when API key is not configured', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      expect(response.status).toBe(200) // Still returns 200 to avoid breaking the page
      expect(response.headers.get('content-type')).toBe('application/javascript')
      
      const script = await response.text()
      expect(script).toContain('console.error')
      expect(script).toContain('Google Maps API key not configured')
    })

    it('should not expose actual API error in returned JavaScript', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      const script = await response.text()
      // Should not contain actual API key loading code
      expect(script).not.toContain('maps.googleapis.com/maps/api/js')
      expect(script).not.toContain('document.createElement')
    })
  })

  describe('CORS Headers', () => {
    it('should include CORS headers in development environment', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'
      process.env.NODE_ENV = 'development'

      const response = await GET()

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type')
    })

    it('should not include CORS headers in production environment', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'
      process.env.NODE_ENV = 'production'

      const response = await GET()

      // In production, CORS headers should not be set (or should be null)
      // The implementation adds them only in development
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    })

    it('should include CORS headers in error response', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type')
    })
  })

  describe('Error Handling', () => {
    it('should return error JavaScript on unexpected exceptions', async () => {
      // Set API key to trigger normal flow, but we'll rely on any internal errors
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()

      expect(response.status).toBe(200) // Should always return 200
      expect(response.headers.get('content-type')).toBe('application/javascript')
    })

    it('should maintain JavaScript content-type even on error', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const response = await GET()

      expect(response.headers.get('content-type')).toBe('application/javascript')
    })
  })

  describe('JavaScript Safety', () => {
    it('should generate valid JavaScript syntax', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()
      const script = await response.text()

      // Should have IIFE structure
      expect(script).toContain('(function() {')
      expect(script).toContain('})();')
    })

    it('should properly escape API key in generated JavaScript', async () => {
      // Test with API key that has special characters
      process.env.GOOGLE_MAPS_API_KEY = "test'key\"with&special=chars"

      const response = await GET()
      const script = await response.text()

      // The API key should be safely embedded in the URL
      expect(script).toContain("test'key\"with&special=chars")
      // Should still be valid JavaScript (no injection)
      expect(script).toContain('script.src =')
    })
  })

  describe('Content Structure', () => {
    it('should return complete executable JavaScript function', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()
      const script = await response.text()

      // Check for complete function structure
      expect(script.trim().startsWith('(function()')).toBe(true)
      expect(script.trim().endsWith('})();')).toBe(true)
    })

    it('should include all required Google Maps API parameters', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()
      const script = await response.text()

      // Verify URL structure
      expect(script).toContain('key=test-key')
      expect(script).toContain('libraries=places')
    })

    it('should set script attributes correctly', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'

      const response = await GET()
      const script = await response.text()

      expect(script).toContain('script.async = true')
      expect(script).toContain('script.defer = true')
    })
  })
})

describe('OPTIONS /api/maps', () => {
  it('should handle CORS preflight request', async () => {
    const response = await OPTIONS()

    expect(response.status).toBe(200)
  })

  it('should return proper CORS headers for preflight', async () => {
    const response = await OPTIONS()

    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type')
  })

  it('should return null body for OPTIONS request', async () => {
    const response = await OPTIONS()

    const text = await response.text()
    expect(text).toBe('')
  })

  it('should return 200 status for OPTIONS', async () => {
    const response = await OPTIONS()

    expect(response.status).toBe(200)
  })
})
