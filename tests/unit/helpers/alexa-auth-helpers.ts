/**
 * Test helpers for Alexa authentication unit tests
 */
import { vi } from 'vitest'

export interface MockJWTPayload {
  sub?: string
  client_id?: string
  type?: 'access' | 'refresh' | string
  iat?: number
  exp?: number
}

/**
 * Mock a successful JWT verification with custom payload
 */
export function mockJWTVerifySuccess(
  jwtVerifyMock: any,
  payload: MockJWTPayload
) {
  const now = Math.floor(Date.now() / 1000)
  jwtVerifyMock.mockResolvedValue({
    payload: {
      iat: now,
      exp: now + 3600,
      ...payload,
    },
    protectedHeader: { alg: 'HS256', typ: 'JWT' },
  })
}

/**
 * Mock a JWT verification failure with error
 */
export function mockJWTVerifyFailure(jwtVerifyMock: any, errorMessage: string) {
  jwtVerifyMock.mockRejectedValue(new Error(errorMessage))
}

/**
 * Mock a successful access token payload
 */
export function mockValidAccessTokenPayload(userId: string, clientId: string): MockJWTPayload {
  return {
    sub: userId,
    client_id: clientId,
    type: 'access',
  }
}

/**
 * Mock a successful Supabase token lookup
 */
export function mockSupabaseTokenFound(
  mockSupabaseClient: any,
  userId: string,
  token: string
) {
  mockSupabaseClient.single.mockResolvedValue({
    data: {
      user_id: userId,
      access_token: token,
    },
    error: null,
  })
}

/**
 * Mock a failed Supabase token lookup
 */
export function mockSupabaseTokenNotFound(
  mockSupabaseClient: any,
  errorMessage: string,
  errorCode?: string
) {
  mockSupabaseClient.single.mockResolvedValue({
    data: null,
    error: { message: errorMessage, code: errorCode },
  })
}

/**
 * Mock a Supabase query error (throws exception)
 */
export function mockSupabaseQueryError(
  mockSupabaseClient: any,
  errorMessage: string
) {
  mockSupabaseClient.single.mockRejectedValue(new Error(errorMessage))
}

/**
 * Create a mock Supabase client with query builder chain
 */
export function createMockSupabaseClient() {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    update: vi.fn().mockReturnThis(),
  }
}

/**
 * Setup successful token validation mocks
 */
export function setupSuccessfulValidation(
  jwtVerifyMock: any,
  mockSupabaseClient: any,
  userId: string,
  clientId: string,
  token: string
) {
  mockJWTVerifySuccess(jwtVerifyMock, mockValidAccessTokenPayload(userId, clientId))
  mockSupabaseTokenFound(mockSupabaseClient, userId, token)
}
