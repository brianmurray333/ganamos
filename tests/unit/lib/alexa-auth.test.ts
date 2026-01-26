import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateAccessToken } from '@/lib/alexa-auth'
import * as jose from 'jose'
import * as supabaseLib from '@/lib/supabase'
import {
  mockJWTVerifySuccess,
  mockJWTVerifyFailure,
  mockValidAccessTokenPayload,
  mockSupabaseTokenFound,
  mockSupabaseTokenNotFound,
  mockSupabaseQueryError,
  createMockSupabaseClient,
  setupSuccessfulValidation,
} from '@/tests/unit/helpers/alexa-auth-helpers'

// Mock jose library
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  SignJWT: vi.fn(),
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

describe('validateAccessToken', () => {
  let mockSupabaseClient: any
  let consoleErrorSpy: any

  const MOCK_USER_ID = 'user-123'
  const MOCK_CLIENT_ID = 'client-abc'
  const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImNsaWVudF9pZCI6ImNsaWVudC1hYmMiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDM2MDB9.signature'

  beforeEach(() => {
    // Set up environment variable
    process.env.ALEXA_JWT_SECRET = 'test-secret-key-for-jwt'

    // Mock console.error to suppress error logs in tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Create mock Supabase client with query builder chain
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: vi.fn().mockReturnThis(),
    }

    // Mock createServerSupabaseClient to return our mock client
    vi.mocked(supabaseLib.createServerSupabaseClient).mockReturnValue(
      mockSupabaseClient
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy.mockRestore()
    delete process.env.ALEXA_JWT_SECRET
  })

  describe('Valid Token Scenarios', () => {
    it('should return userId and clientId for valid access token', async () => {
      // Mock successful JWT verification
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      // Mock successful database lookup
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toEqual({
        userId: MOCK_USER_ID,
        clientId: MOCK_CLIENT_ID,
      })
      expect(jose.jwtVerify).toHaveBeenCalledWith(
        MOCK_TOKEN,
        expect.any(Uint8Array)
      )
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        'alexa_linked_accounts'
      )
      expect(mockSupabaseClient.select).toHaveBeenCalledWith(
        'user_id, access_token'
      )
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID)
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'access_token',
        MOCK_TOKEN
      )
    })

    it('should update last_used_at timestamp on successful validation', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      await validateAccessToken(MOCK_TOKEN)

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        last_used_at: expect.any(String),
      })
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID)
    })

    it('should return null if last_used_at update throws error', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      // Update operation throws an error
      mockSupabaseClient.update.mockImplementation(() => {
        throw new Error('Update failed')
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      // Should return null because update threw an error caught by outer try-catch
      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token validation failed:',
        expect.any(Error)
      )
    })
  })

  describe('Invalid JWT Format', () => {
    it('should return null for malformed JWT token', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Invalid compact JWS')
      )

      const result = await validateAccessToken('invalid.jwt.token')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token validation failed:',
        expect.any(Error)
      )
    })

    it('should return null for empty string token', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Invalid compact JWS')
      )

      const result = await validateAccessToken('')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should return null for token with invalid base64 encoding', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Failed to parse token')
      )

      const result = await validateAccessToken('not-a-valid-base64-!!!token')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should return null for token without proper JWT structure', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Invalid token format')
      )

      const result = await validateAccessToken('just-a-random-string')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('JWT Validation Failures', () => {
    it('should return null for expired token', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('"exp" claim timestamp check failed')
      )

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token validation failed:',
        expect.any(Error)
      )
    })

    it('should return null for token with invalid signature', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('signature verification failed')
      )

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should return null when JWT verification fails with wrong secret', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('key does not match')
      )

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('Invalid Token Type', () => {
    it('should return null for refresh token (type=refresh)', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'refresh', // Wrong type
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Invalid token type:',
        'refresh'
      )
      // Database should not be queried
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return null for token with unknown type', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'unknown', // Unknown type
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Invalid token type:',
        'unknown'
      )
    })

    it('should return null for token with missing type claim', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          // type is missing
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('Database Lookup Failures', () => {
    it('should return null when token not found in database', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      // Token not found in database
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No rows returned' },
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token not found in database:',
        expect.any(Object)
      )
    })

    it('should return null when database query returns error', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: '500' },
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should return null when data is null even without explicit error', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
    })
  })

  describe('Token Revocation Scenarios', () => {
    it('should return null for revoked token (deleted from database)', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      // Token was revoked - not in database
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Token revoked', code: 'PGRST116' },
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token not found in database:',
        expect.any(Object)
      )
    })

    it('should return null when user linked account is deleted', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      // Linked account deleted (cascade delete)
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Foreign key violation' },
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long token strings', async () => {
      const longToken = 'a'.repeat(10000)
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Token too long')
      )

      const result = await validateAccessToken(longToken)

      expect(result).toBeNull()
    })

    it('should handle tokens with special characters', async () => {
      const specialToken = 'token-with-$pecial-ch@rs-áéíóú-🔑'
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Invalid characters')
      )

      const result = await validateAccessToken(specialToken)

      expect(result).toBeNull()
    })

    it('should handle concurrent validation calls independently', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      // Call validation concurrently
      const results = await Promise.all([
        validateAccessToken(MOCK_TOKEN),
        validateAccessToken(MOCK_TOKEN),
        validateAccessToken(MOCK_TOKEN),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toEqual({
          userId: MOCK_USER_ID,
          clientId: MOCK_CLIENT_ID,
        })
      })
    })

    it('should handle token with missing userId claim', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          // sub (userId) is missing
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      const result = await validateAccessToken(MOCK_TOKEN)

      // Will fail at database lookup with undefined userId
      expect(result).toBeNull()
    })

    it('should handle token with missing clientId claim', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          // client_id is missing
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      const result = await validateAccessToken(MOCK_TOKEN)

      // Should still return result but with undefined clientId
      expect(result).toEqual({
        userId: MOCK_USER_ID,
        clientId: undefined,
      })
    })
  })

  describe('Error Handling and Logging', () => {
    it('should catch and log network errors from Supabase', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockRejectedValue(
        new Error('Network error')
      )

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token validation failed:',
        expect.any(Error)
      )
    })

    it('should catch unexpected errors from jose library', async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error('Unexpected jose error')
      )

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token validation failed:',
        expect.objectContaining({
          message: 'Unexpected jose error',
        })
      )
    })

    it('should handle database connection timeout', async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockRejectedValue(
        new Error('Connection timeout')
      )

      const result = await validateAccessToken(MOCK_TOKEN)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('JWT Secret Configuration', () => {
    it('should use ALEXA_JWT_SECRET when configured', async () => {
      process.env.ALEXA_JWT_SECRET = 'alexa-specific-secret'

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      await validateAccessToken(MOCK_TOKEN)

      expect(jose.jwtVerify).toHaveBeenCalledWith(
        MOCK_TOKEN,
        expect.any(Uint8Array)
      )
    })

    it('should fallback to SUPABASE_JWT_SECRET when ALEXA_JWT_SECRET not set', async () => {
      delete process.env.ALEXA_JWT_SECRET
      process.env.SUPABASE_JWT_SECRET = 'supabase-fallback-secret'

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: {
          sub: MOCK_USER_ID,
          client_id: MOCK_CLIENT_ID,
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'HS256', typ: 'JWT' },
      } as any)

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          user_id: MOCK_USER_ID,
          access_token: MOCK_TOKEN,
        },
        error: null,
      })

      await validateAccessToken(MOCK_TOKEN)

      expect(jose.jwtVerify).toHaveBeenCalled()
    })
  })
})
