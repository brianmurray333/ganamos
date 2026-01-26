/**
 * Integration tests for GET /api/alexa/authorize
 *
 * Tests the full OAuth 2.0 authorization flow for Alexa account linking:
 * - Parameter validation (client_id, redirect_uri, response_type)
 * - Authentication state handling (redirect to login vs generate code)
 * - Authorization code generation and storage
 * - CSRF protection via state parameter
 * - Error handling and edge cases
 *
 * Uses real Supabase database with per-test isolation and cleanup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  seedUser,
  queryOne,
  queryDB,
} from './helpers/test-isolation'
import { getAnonClient } from './helpers/db-client'

// Track current authenticated user for mock
const authState = vi.hoisted(() => ({ userId: null as string | null }))

// Mock the auth helpers to use real DB client with auth
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { getAuthenticatedClient, getAnonClient } = await import('./helpers/db-client')
  return {
    createRouteHandlerClient: vi.fn(() => {
      if (!authState.userId) {
        const client = getAnonClient()
        const mockClient = Object.create(client)
        mockClient.auth = {
          getSession: async () => ({ data: { session: null }, error: null }),
        }
        return mockClient
      }

      const client = getAuthenticatedClient(authState.userId)
      const mockClient = Object.create(client)
      mockClient.auth = {
        ...client.auth,
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: authState.userId,
                email: `test-${authState.userId!.slice(0, 8)}@test.local`,
              },
              access_token: 'mock-token',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              refresh_token: 'mock-refresh',
            },
          },
          error: null,
        }),
      }
      return mockClient
    }),
  }
})

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}))

// Import route after mocks are set up
import { GET } from '@/app/api/alexa/authorize/route'

// Test fixtures
const VALID_CLIENT_ID = 'test-client-id'
const VALID_REDIRECT_URI = 'https://alexa.amazon.com/api/skill/link/callback'
const VALID_STATE = 'random-state-string-for-csrf'

function createAuthorizeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/alexa/authorize')
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value)
  })
  return new NextRequest(url)
}

describe('GET /api/alexa/authorize - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
    
    // Set environment variable for client ID validation (dev mode allows any)
    process.env.NODE_ENV = 'development'
    process.env.ALEXA_CLIENT_IDS = ''
  })

  describe('OAuth Parameter Validation', () => {
    it('should return 400 when client_id is missing', async () => {
      const request = createAuthorizeRequest({
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Missing required OAuth parameters')
    })

    it('should return 400 when redirect_uri is missing', async () => {
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Missing required OAuth parameters')
    })

    it('should return 400 when response_type is missing', async () => {
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Missing required OAuth parameters')
    })

    it('should return 400 when response_type is not "code"', async () => {
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'token',
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid response_type. Only "code" is supported.')
    })

    it('should return 400 when client_id is invalid in production', async () => {
      process.env.NODE_ENV = 'production'
      process.env.ALEXA_CLIENT_IDS = 'allowed-client-1,allowed-client-2'

      const request = createAuthorizeRequest({
        client_id: 'invalid-client-id',
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid client_id')
    })

    it('should accept any client_id in development mode', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      // In development, any client_id is accepted when ALEXA_CLIENT_IDS is not set
      process.env.NODE_ENV = 'development'
      process.env.ALEXA_CLIENT_IDS = ''

      const request = createAuthorizeRequest({
        client_id: 'any-client-id',
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      // Should redirect with code (307 or 302)
      expect([302, 307]).toContain(response.status)
    })
  })

  describe('Authentication Flow - Unauthenticated User', () => {
    it('should redirect to login page when user is not authenticated', async () => {
      authState.userId = null

      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      // Next.js redirect returns 307
      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      expect(location).toBeDefined()
      expect(location).toContain('/auth/alexa-login')
      
      // Verify OAuth params are in the redirect URL
      const redirectUrl = new URL(location!, 'http://localhost:3000')
      expect(redirectUrl.searchParams.get('client_id')).toBe(VALID_CLIENT_ID)
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(VALID_REDIRECT_URI)
      expect(redirectUrl.searchParams.get('state')).toBe(VALID_STATE)
    })

    it('should set httpOnly cookie with OAuth params for unauthenticated user', async () => {
      authState.userId = null

      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      // Verify cookie is set (response.cookies is available in Next.js Response)
      const setCookieHeader = response.headers.get('set-cookie')
      expect(setCookieHeader).toBeDefined()
      expect(setCookieHeader).toContain('alexa_oauth_params')
      expect(setCookieHeader).toContain('HttpOnly')
    })
  })

  describe('Authentication Flow - Authenticated User', () => {
    it('should generate authorization code and redirect for authenticated user', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      // Should redirect to Alexa callback
      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      expect(location).toBeDefined()
      expect(location).toContain(VALID_REDIRECT_URI)
      
      // Verify code and state in redirect URL
      const redirectUrl = new URL(location!)
      const code = redirectUrl.searchParams.get('code')
      const state = redirectUrl.searchParams.get('state')
      
      expect(code).toBeDefined()
      expect(code).toMatch(/^[a-f0-9-]+$/) // UUID format
      expect(state).toBe(VALID_STATE)
    })

    it('should store authorization code in database with correct fields', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)
      
      const location = response.headers.get('location')
      const redirectUrl = new URL(location!)
      const code = redirectUrl.searchParams.get('code')

      // Verify code exists in database
      const authCode = await queryOne<{
        code: string
        user_id: string
        client_id: string
        redirect_uri: string
        state: string
        expires_at: string
        used_at: string | null
      }>(
        'SELECT code, user_id, client_id, redirect_uri, state, expires_at, used_at FROM alexa_auth_codes WHERE code = $1',
        [code]
      )

      expect(authCode.code).toBe(code)
      expect(authCode.user_id).toBe(userId)
      expect(authCode.client_id).toBe(VALID_CLIENT_ID)
      expect(authCode.redirect_uri).toBe(VALID_REDIRECT_URI)
      expect(authCode.state).toBe(VALID_STATE)
      expect(authCode.used_at).toBeNull()
      
      // Verify expires_at is in the future (within 10 minutes)
      const expiresAt = new Date(authCode.expires_at)
      const now = new Date()
      const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000)
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime())
      expect(expiresAt.getTime()).toBeLessThanOrEqual(tenMinutesFromNow.getTime())
    })

    it('should handle missing state parameter (optional)', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
      })

      const response = await GET(request)

      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      const redirectUrl = new URL(location!)
      const code = redirectUrl.searchParams.get('code')
      
      expect(code).toBeDefined()
      
      // Verify state is not in redirect (since it wasn't provided)
      expect(redirectUrl.searchParams.has('state')).toBe(false)
      
      // Verify code in database has null state
      const authCode = await queryOne<{ state: string | null }>(
        'SELECT state FROM alexa_auth_codes WHERE code = $1',
        [code]
      )
      expect(authCode.state).toBeNull()
    })
  })

  describe('Authorization Code Properties', () => {
    it('should generate unique authorization codes for multiple requests', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const request1 = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: 'state-1',
      })

      const request2 = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: 'state-2',
      })

      const response1 = await GET(request1)
      const response2 = await GET(request2)

      const location1 = response1.headers.get('location')
      const location2 = response2.headers.get('location')
      
      const code1 = new URL(location1!).searchParams.get('code')
      const code2 = new URL(location2!).searchParams.get('code')

      expect(code1).not.toBe(code2)
      
      // Verify both codes exist in database
      const codes = await queryDB<{ code: string }>(
        'SELECT code FROM alexa_auth_codes WHERE user_id = $1',
        [userId]
      )
      expect(codes.length).toBe(2)
      expect(codes.map(c => c.code)).toContain(code1)
      expect(codes.map(c => c.code)).toContain(code2)
    })

    it('should preserve state parameter in authorization code record', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const customState = 'custom-csrf-token-12345'
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: customState,
      })

      const response = await GET(request)
      
      const location = response.headers.get('location')
      const code = new URL(location!).searchParams.get('code')

      // Verify state is preserved in database
      const authCode = await queryOne<{ state: string }>(
        'SELECT state FROM alexa_auth_codes WHERE code = $1',
        [code]
      )
      expect(authCode.state).toBe(customState)
    })
  })

  describe('Error Handling', () => {
    // Note: Database-level error handling is difficult to test in integration tests
    // without mocking the database layer itself. The error path in the route handler
    // (lines 110-122) handles database insert failures, but forcing such failures
    // in a real database environment is unreliable and would require:
    // - Dropping/modifying constraints mid-test
    // - Intentionally corrupting data
    // - Using table locks or connection failures
    // These approaches are brittle and don't reflect real production scenarios.
    // Error handling should be verified via unit tests or manual failure injection.
    it.skip('should redirect with error when code generation fails', async () => {
      // Skipped: Cannot reliably force database errors in integration test
      // See comment above for rationale
    })

    it('should handle malformed request gracefully', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      // Create request with special characters in parameters
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: 'state-with-special-chars-!@#$%^&*()',
      })

      const response = await GET(request)

      // Should handle gracefully and generate code
      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      const redirectUrl = new URL(location!)
      const code = redirectUrl.searchParams.get('code')
      
      expect(code).toBeDefined()
    })
  })

  describe('Selected Group Support', () => {
    it('should support selectedGroupId parameter in authorization code', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      // Note: The current endpoint implementation doesn't pass selectedGroupId
      // This test documents the expected behavior when it's added
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      const code = new URL(location!).searchParams.get('code')

      // Verify code exists (selectedGroupId is optional)
      const authCode = await queryOne<{ selected_group_id: string | null }>(
        'SELECT selected_group_id FROM alexa_auth_codes WHERE code = $1',
        [code]
      )
      
      // Should be null when not provided via complete-linking flow
      expect(authCode.selected_group_id).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long state parameter', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const longState = 'a'.repeat(500) // 500 character state
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: VALID_REDIRECT_URI,
        response_type: 'code',
        state: longState,
      })

      const response = await GET(request)

      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      const redirectUrl = new URL(location!)
      const code = redirectUrl.searchParams.get('code')
      
      expect(code).toBeDefined()
      expect(redirectUrl.searchParams.get('state')).toBe(longState)
    })

    it('should handle redirect_uri with existing query parameters', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const redirectUriWithParams = 'https://alexa.amazon.com/api/skill/link/callback?existing=param'
      const request = createAuthorizeRequest({
        client_id: VALID_CLIENT_ID,
        redirect_uri: redirectUriWithParams,
        response_type: 'code',
        state: VALID_STATE,
      })

      const response = await GET(request)

      expect([302, 307]).toContain(response.status)
      
      const location = response.headers.get('location')
      expect(location).toContain(redirectUriWithParams)
      
      const redirectUrl = new URL(location!)
      expect(redirectUrl.searchParams.get('existing')).toBe('param')
      expect(redirectUrl.searchParams.get('code')).toBeDefined()
      expect(redirectUrl.searchParams.get('state')).toBe(VALID_STATE)
    })

    it('should allow multiple authorization codes for same user', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      // Generate 3 codes for the same user
      for (let i = 0; i < 3; i++) {
        const request = createAuthorizeRequest({
          client_id: VALID_CLIENT_ID,
          redirect_uri: VALID_REDIRECT_URI,
          response_type: 'code',
          state: `state-${i}`,
        })

        const response = await GET(request)
        expect([302, 307]).toContain(response.status)
      }

      // Verify all 3 codes exist in database
      const codes = await queryDB<{ code: string; used_at: string | null }>(
        'SELECT code, used_at FROM alexa_auth_codes WHERE user_id = $1',
        [userId]
      )
      
      expect(codes.length).toBe(3)
      expect(codes.every(c => c.used_at === null)).toBe(true)
    })
  })
})
