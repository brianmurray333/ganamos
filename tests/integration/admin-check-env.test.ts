import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/admin/check-env/route'
import { NextRequest } from 'next/server'

describe('GET /api/admin/check-env', () => {
  // Store original environment variables to restore after tests
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Set up test environment with all required variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-1234567890'
    process.env.SUPABASE_SECRET_API_KEY = 'test-secret-api-key'
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.NODE_ENV = 'test'
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'development'
    process.env.USE_MOCKS = 'true'
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('Authorization', () => {
    it('should allow access with x-vercel-cron header', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.error).toBeUndefined()
      expect(data.NEXT_PUBLIC_SUPABASE_URL).toBe(true)
    })

    it('should allow access with x-vercel-id header', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-id': 'vercel-cron-job-id',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.error).toBeUndefined()
      expect(data.NEXT_PUBLIC_SUPABASE_URL).toBe(true)
    })

    it('should allow access with valid Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.error).toBeUndefined()
      expect(data.NEXT_PUBLIC_SUPABASE_URL).toBe(true)
    })

    it('should return 401 when no authorization provided and CRON_SECRET is set', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 401 with invalid Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should allow access when CRON_SECRET is not set and no headers provided', async () => {
      // Remove CRON_SECRET to test fallback behavior
      delete process.env.CRON_SECRET

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.CRON_SECRET).toBe(false)
    })
  })

  describe('Environment Variable Validation', () => {
    it('should return all environment variables when present', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Boolean flags
      expect(data.NEXT_PUBLIC_SUPABASE_URL).toBe(true)
      expect(data.SUPABASE_SECRET_API_KEY).toBe(true)
      expect(data.RESEND_API_KEY).toBe(true)
      expect(data.CRON_SECRET).toBe(true)
      expect(data.VERCEL).toBe(true)

      // String values
      expect(data.NODE_ENV).toBe('test')
      expect(data.VERCEL_ENV).toBe('development')
      expect(data.USE_MOCKS).toBe('true')

      // Prefixes
      expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX).toBeDefined()
    })

    it('should return false for missing environment variables', async () => {
      // Remove some environment variables
      delete process.env.RESEND_API_KEY
      delete process.env.VERCEL
      delete process.env.SUPABASE_SECRET_API_KEY

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Present variables
      expect(data.NEXT_PUBLIC_SUPABASE_URL).toBe(true)
      expect(data.CRON_SECRET).toBe(true)

      // Missing variables
      expect(data.RESEND_API_KEY).toBe(false)
      expect(data.VERCEL).toBe(false)
      expect(data.SUPABASE_SECRET_API_KEY).toBe(false)
    })

    it('should return "not set" for missing USE_MOCKS', async () => {
      delete process.env.USE_MOCKS

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.USE_MOCKS).toBe('not set')
    })
  })

  describe('Prefix Extraction', () => {
    it('should extract first 30 characters of NEXT_PUBLIC_SUPABASE_URL', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321/some/very/long/path/that/exceeds/thirty/characters'

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX).toBe('http://localhost:54321/some/ve')
      expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX.length).toBe(30)
    })

    it('should handle short NEXT_PUBLIC_SUPABASE_URL without error', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'short'

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX).toBe('short')
    })

    it('should return undefined prefix when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX).toBeUndefined()
    })
  })

  describe('Response Structure', () => {
    it('should return correct response structure with all fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)

      // Verify all expected fields are present (based on actual API implementation)
      expect(data).toHaveProperty('NEXT_PUBLIC_SUPABASE_URL')
      expect(data).toHaveProperty('SUPABASE_SECRET_API_KEY')
      expect(data).toHaveProperty('RESEND_API_KEY')
      expect(data).toHaveProperty('CRON_SECRET')
      expect(data).toHaveProperty('NODE_ENV')
      expect(data).toHaveProperty('VERCEL')
      expect(data).toHaveProperty('VERCEL_ENV')
      expect(data).toHaveProperty('USE_MOCKS')
      expect(data).toHaveProperty('NEXT_PUBLIC_SUPABASE_URL_PREFIX')

      // Verify no error field in success response
      expect(data).not.toHaveProperty('error')
    })

    it('should return boolean types for flag fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(typeof data.NEXT_PUBLIC_SUPABASE_URL).toBe('boolean')
      expect(typeof data.SUPABASE_SECRET_API_KEY).toBe('boolean')
      expect(typeof data.RESEND_API_KEY).toBe('boolean')
      expect(typeof data.CRON_SECRET).toBe('boolean')
      expect(typeof data.VERCEL).toBe('boolean')
    })

    it('should return string types for value fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(typeof data.NODE_ENV).toBe('string')
      expect(typeof data.VERCEL_ENV).toBe('string')
      expect(typeof data.USE_MOCKS).toBe('string')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing NODE_ENV gracefully', async () => {
      delete process.env.NODE_ENV

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.NODE_ENV).toBeUndefined()
    })

    it('should handle missing VERCEL_ENV gracefully', async () => {
      delete process.env.VERCEL_ENV

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.VERCEL_ENV).toBeUndefined()
    })

    it('should handle completely empty environment', async () => {
      // Clear all environment variables
      process.env = {}

      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'true',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // All boolean flags should be false
      expect(data.NEXT_PUBLIC_SUPABASE_URL).toBe(false)
      expect(data.SUPABASE_SECRET_API_KEY).toBe(false)
      expect(data.RESEND_API_KEY).toBe(false)
      expect(data.CRON_SECRET).toBe(false)
      expect(data.VERCEL).toBe(false)

      // USE_MOCKS should be 'not set'
      expect(data.USE_MOCKS).toBe('not set')
    })
  })
})
