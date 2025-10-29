import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/maps/route'

describe('/api/maps endpoint', () => {
  const originalEnv = process.env.GOOGLE_MAPS_API_KEY

  afterEach(() => {
    if (originalEnv) {
      process.env.GOOGLE_MAPS_API_KEY = originalEnv
    } else {
      delete process.env.GOOGLE_MAPS_API_KEY
    }
  })

  describe('successful responses', () => {
    beforeEach(() => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'
    })

    it('should return JavaScript content type', async () => {
      const response = await GET()
      
      expect(response.headers.get('Content-Type')).toBe('application/javascript')
    })

    it('should return 200 status code', async () => {
      const response = await GET()
      
      expect(response.status).toBe(200)
    })

    it('should return valid JavaScript code', async () => {
      const response = await GET()
      const text = await response.text()
      
      // Should be a self-executing function
      expect(text).toContain('(function()')
      expect(text).toContain('window.google')
      expect(text).toContain('document.createElement')
      expect(text).toContain('script.src')
    })

    it('should embed API key in the response', async () => {
      const response = await GET()
      const text = await response.text()
      
      expect(text).toContain('test-api-key-12345')
      expect(text).toContain('maps.googleapis.com/maps/api/js')
    })

    it('should include places library in script URL', async () => {
      const response = await GET()
      const text = await response.text()
      
      expect(text).toContain('libraries=places')
    })

    it('should check for existing Google Maps instance', async () => {
      const response = await GET()
      const text = await response.text()
      
      // Should check if already loaded
      expect(text).toContain('window.google && window.google.maps')
      expect(text).toContain('Already loaded')
    })

    it('should include error handling', async () => {
      const response = await GET()
      const text = await response.text()
      
      expect(text).toContain('script.onerror')
      expect(text).toContain('console.error')
    })

    it('should set async and defer attributes', async () => {
      const response = await GET()
      const text = await response.text()
      
      expect(text).toContain('script.async = true')
      expect(text).toContain('script.defer = true')
    })

    it('should append script to document head', async () => {
      const response = await GET()
      const text = await response.text()
      
      expect(text).toContain('document.head.appendChild(script)')
    })

    it('should set Cache-Control header', async () => {
      const response = await GET()
      
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })

    it('should include CORS headers in development', async () => {
      process.env.NODE_ENV = 'development'
      
      const response = await GET()
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
      
      delete process.env.NODE_ENV
    })

    it('should not include CORS headers in production', async () => {
      process.env.NODE_ENV = 'production'
      
      const response = await GET()
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      
      delete process.env.NODE_ENV
    })
  })

  describe('error handling', () => {
    it('should handle missing API key gracefully', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      
      const response = await GET()
      
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/javascript')
    })

    it('should return error logging JavaScript when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      
      const response = await GET()
      const text = await response.text()
      
      expect(text).toContain('console.error')
      expect(text).toContain('Google Maps API key not configured')
    })

    it('should include CORS headers even on error', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      
      const response = await GET()
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    })
  })

  describe('security', () => {
    beforeEach(() => {
      process.env.GOOGLE_MAPS_API_KEY = 'secret-api-key-should-be-embedded'
    })

    it('should embed server-side API key in JavaScript', async () => {
      const response = await GET()
      const text = await response.text()
      
      // API key should be in the response (secure proxy pattern)
      expect(text).toContain('secret-api-key-should-be-embedded')
    })

    it('should not expose raw API key in headers', async () => {
      const response = await GET()
      
      // API key should not be in headers
      const headers = Array.from(response.headers.keys())
      const headerValues = Array.from(response.headers.values())
      
      expect(headers.some(h => h.toLowerCase().includes('key'))).toBe(false)
      expect(headerValues.some(v => v.includes('secret-api-key'))).toBe(false)
    })
  })

  describe('JavaScript validity', () => {
    beforeEach(() => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    })

    it('should return syntactically valid JavaScript', async () => {
      const response = await GET()
      const text = await response.text()
      
      // Basic syntax check - should not throw
      expect(() => {
        new Function(text)
      }).not.toThrow()
    })

    it('should be executable JavaScript', async () => {
      const response = await GET()
      const text = await response.text()
      
      // Should be immediately invocable
      expect(text.trim().startsWith('(')).toBe(true)
      expect(text.trim().endsWith('();')).toBe(true)
    })
  })
})