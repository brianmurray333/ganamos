import { describe, it, expect, beforeEach } from 'vitest'
import { OPTIONS } from '@/app/api/bitcoin-price/route'
import {
  expectCorsHeaders,
  expectNoCorsHeaders,
} from './helpers/bitcoin-price-mocks'

/**
 * Unit tests for OPTIONS /api/bitcoin-price
 * 
 * Tests CORS preflight handling for cross-origin API usage
 * Critical for security and integration bugs prevention
 */
describe('OPTIONS /api/bitcoin-price - CORS Preflight Handler', () => {
  beforeEach(() => {
    // Reset environment to production by default
    process.env.NODE_ENV = 'production'
  })

  describe('Development Mode CORS Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should return 200 status code in development mode', async () => {
      const response = await OPTIONS()

      expect(response.status).toBe(200)
    })

    it('should include CORS headers in development mode', async () => {
      const response = await OPTIONS()

      expectCorsHeaders(response)
    })

    it('should include Access-Control-Allow-Origin header with wildcard', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should include Access-Control-Allow-Methods with GET and OPTIONS', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    })

    it('should include Access-Control-Allow-Headers with Content-Type', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should return null response body in development mode', async () => {
      const response = await OPTIONS()

      const text = await response.text()
      expect(text).toBe('')
    })

    it('should have all three CORS headers present simultaneously', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy()
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeTruthy()
    })
  })

  describe('Production Mode CORS Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production'
    })

    it('should return 204 No Content status code in production mode', async () => {
      const response = await OPTIONS()

      expect(response.status).toBe(204)
    })

    it('should not include CORS headers in production mode', async () => {
      const response = await OPTIONS()

      expectNoCorsHeaders(response)
    })

    it('should not include Access-Control-Allow-Origin header in production', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('should not include Access-Control-Allow-Methods header in production', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
    })

    it('should not include Access-Control-Allow-Headers header in production', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
    })

    it('should return null response body in production mode', async () => {
      const response = await OPTIONS()

      const text = await response.text()
      expect(text).toBe('')
    })

    it('should have no CORS headers present at all', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
    })
  })

  describe('Environment Switching Behavior', () => {
    it('should switch from production to development behavior when NODE_ENV changes', async () => {
      // Start in production
      process.env.NODE_ENV = 'production'
      const prodResponse = await OPTIONS()
      expect(prodResponse.status).toBe(204)
      expectNoCorsHeaders(prodResponse)

      // Switch to development
      process.env.NODE_ENV = 'development'
      const devResponse = await OPTIONS()
      expect(devResponse.status).toBe(200)
      expectCorsHeaders(devResponse)
    })

    it('should switch from development to production behavior when NODE_ENV changes', async () => {
      // Start in development
      process.env.NODE_ENV = 'development'
      const devResponse = await OPTIONS()
      expect(devResponse.status).toBe(200)
      expectCorsHeaders(devResponse)

      // Switch to production
      process.env.NODE_ENV = 'production'
      const prodResponse = await OPTIONS()
      expect(prodResponse.status).toBe(204)
      expectNoCorsHeaders(prodResponse)
    })

    it('should default to production behavior when NODE_ENV is undefined', async () => {
      delete process.env.NODE_ENV
      const response = await OPTIONS()

      expect(response.status).toBe(204)
      expectNoCorsHeaders(response)
    })

    it('should default to production behavior when NODE_ENV is empty string', async () => {
      process.env.NODE_ENV = ''
      const response = await OPTIONS()

      expect(response.status).toBe(204)
      expectNoCorsHeaders(response)
    })

    it('should default to production behavior when NODE_ENV is test', async () => {
      process.env.NODE_ENV = 'test'
      const response = await OPTIONS()

      expect(response.status).toBe(204)
      expectNoCorsHeaders(response)
    })

    it('should use development behavior only when NODE_ENV is exactly "development"', async () => {
      process.env.NODE_ENV = 'Development' // Case mismatch
      const response = await OPTIONS()

      // Should default to production (case-sensitive check)
      expect(response.status).toBe(204)
      expectNoCorsHeaders(response)
    })
  })

  describe('Response Body Validation', () => {
    it('should return empty response body in development mode', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const body = await response.text()
      expect(body).toBe('')
      expect(body.length).toBe(0)
    })

    it('should return empty response body in production mode', async () => {
      process.env.NODE_ENV = 'production'
      const response = await OPTIONS()

      const body = await response.text()
      expect(body).toBe('')
      expect(body.length).toBe(0)
    })

    it('should not include Content-Type header in response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      // OPTIONS responses typically don't have Content-Type since body is null
      expect(response.headers.get('Content-Type')).toBeNull()
    })
  })

  describe('CORS Preflight Compliance', () => {
    it('should allow GET method in preflight response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const allowedMethods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(allowedMethods).toContain('GET')
    })

    it('should allow OPTIONS method in preflight response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const allowedMethods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(allowedMethods).toContain('OPTIONS')
    })

    it('should not allow POST method in preflight response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const allowedMethods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(allowedMethods).not.toContain('POST')
    })

    it('should not allow PUT method in preflight response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const allowedMethods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(allowedMethods).not.toContain('PUT')
    })

    it('should not allow DELETE method in preflight response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const allowedMethods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(allowedMethods).not.toContain('DELETE')
    })

    it('should allow Content-Type header in preflight response', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const allowedHeaders = response.headers.get('Access-Control-Allow-Headers') || ''
      expect(allowedHeaders).toContain('Content-Type')
    })

    it('should allow wildcard origin for development', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('Security and Integration Validation', () => {
    it('should not leak CORS headers in production to prevent security issues', async () => {
      process.env.NODE_ENV = 'production'
      const response = await OPTIONS()

      // Critical security check: No CORS headers in production
      const headers = Array.from(response.headers.keys())
      const corsHeaders = headers.filter(h => h.toLowerCase().startsWith('access-control'))
      expect(corsHeaders).toHaveLength(0)
    })

    it('should maintain consistent status codes across environments', async () => {
      // Development should always return 200
      process.env.NODE_ENV = 'development'
      const devResponse = await OPTIONS()
      expect(devResponse.status).toBe(200)

      // Production should always return 204
      process.env.NODE_ENV = 'production'
      const prodResponse = await OPTIONS()
      expect(prodResponse.status).toBe(204)
    })

    it('should handle preflight requests without crashing', async () => {
      process.env.NODE_ENV = 'development'
      
      // Should not throw
      await expect(OPTIONS()).resolves.toBeDefined()
    })

    it('should return Response object with proper type', async () => {
      const response = await OPTIONS()

      expect(response).toBeInstanceOf(Response)
      expect(typeof response.status).toBe('number')
      expect(response.headers).toBeDefined()
    })
  })

  describe('Cross-Origin Resource Sharing (CORS) Behavior', () => {
    it('should enable cross-origin requests in development', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      // Wildcard origin allows any cross-origin request
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.status).toBe(200)
    })

    it('should restrict cross-origin requests in production', async () => {
      process.env.NODE_ENV = 'production'
      const response = await OPTIONS()

      // No CORS headers means same-origin only
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(response.status).toBe(204)
    })

    it('should support simple CORS requests via GET method allowance', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const methods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(methods.split(',').map(m => m.trim())).toContain('GET')
    })

    it('should support preflight CORS requests via OPTIONS method allowance', async () => {
      process.env.NODE_ENV = 'development'
      const response = await OPTIONS()

      const methods = response.headers.get('Access-Control-Allow-Methods') || ''
      expect(methods.split(',').map(m => m.trim())).toContain('OPTIONS')
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle rapid environment switches without errors', async () => {
      for (let i = 0; i < 10; i++) {
        process.env.NODE_ENV = i % 2 === 0 ? 'development' : 'production'
        const response = await OPTIONS()
        
        if (process.env.NODE_ENV === 'development') {
          expect(response.status).toBe(200)
        } else {
          expect(response.status).toBe(204)
        }
      }
    })

    it('should handle null NODE_ENV gracefully', async () => {
      // @ts-ignore - Testing null case
      process.env.NODE_ENV = null
      const response = await OPTIONS()

      // Should default to production behavior
      expect(response.status).toBe(204)
    })

    it('should handle numeric NODE_ENV values', async () => {
      // @ts-ignore - Testing invalid type
      process.env.NODE_ENV = 123
      const response = await OPTIONS()

      // Should default to production behavior (not 'development' string)
      expect(response.status).toBe(204)
    })

    it('should handle whitespace in NODE_ENV', async () => {
      process.env.NODE_ENV = '  development  '
      const response = await OPTIONS()

      // Should default to production (strict match required)
      expect(response.status).toBe(204)
    })

    it('should handle case variations in NODE_ENV', async () => {
      const variations = ['DEVELOPMENT', 'Development', 'DevelopMent', 'dEvElOpMeNt']
      
      for (const nodeEnv of variations) {
        process.env.NODE_ENV = nodeEnv
        const response = await OPTIONS()
        
        // Only exact 'development' should trigger dev mode
        expect(response.status).toBe(204)
        expectNoCorsHeaders(response)
      }
    })
  })

  describe('Response Consistency', () => {
    it('should return consistent responses across multiple calls in development', async () => {
      process.env.NODE_ENV = 'development'
      
      const responses = await Promise.all([
        OPTIONS(),
        OPTIONS(),
        OPTIONS(),
      ])

      responses.forEach(response => {
        expect(response.status).toBe(200)
        expectCorsHeaders(response)
      })
    })

    it('should return consistent responses across multiple calls in production', async () => {
      process.env.NODE_ENV = 'production'
      
      const responses = await Promise.all([
        OPTIONS(),
        OPTIONS(),
        OPTIONS(),
      ])

      responses.forEach(response => {
        expect(response.status).toBe(204)
        expectNoCorsHeaders(response)
      })
    })
  })
})