import { vi } from 'vitest'
import { createMockSession, createMockUser, TEST_USER_IDS } from './test-data'
import type { createMockSupabaseClient } from './supabase-mock'

type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>

/**
 * Authentication mock helpers
 * Configure mock Supabase client for different auth scenarios
 */

/**
 * Configure mock for authenticated session
 */
export function mockAuthenticatedSession(
  mockClient: MockSupabaseClient,
  userId: string = TEST_USER_IDS.PRIMARY
) {
  const session = createMockSession(userId)
  mockClient.auth.getSession.mockResolvedValue({
    data: { session },
    error: null,
  })
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: session.user },
    error: null,
  })
  return session
}

/**
 * Configure mock for unauthenticated session (no user logged in)
 */
export function mockUnauthenticatedSession(mockClient: MockSupabaseClient) {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  })
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: null,
  })
}

/**
 * Configure mock for authentication error
 */
export function mockAuthError(mockClient: MockSupabaseClient, message: string = 'Authentication failed') {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: { message, status: 401 },
  })
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message, status: 401 },
  })
}

/**
 * Configure mock for successful authentication (mockReturnValueOnce variant)
 * Use when you need to chain multiple different auth responses
 */
export function mockAuthSuccessOnce(
  mockClient: MockSupabaseClient,
  userId: string = TEST_USER_IDS.PRIMARY
) {
  const session = createMockSession(userId)
  mockClient.auth.getSession.mockResolvedValueOnce({
    data: { session },
    error: null,
  })
  return session
}

/**
 * Configure mock for authentication failure (mockReturnValueOnce variant)
 */
export function mockAuthFailureOnce(mockClient: MockSupabaseClient) {
  mockClient.auth.getSession.mockResolvedValueOnce({
    data: { session: null },
    error: null,
  })
}

/**
 * Create authenticated session response object (for direct use)
 */
export function createAuthenticatedSessionResponse(userId: string = TEST_USER_IDS.PRIMARY) {
  return {
    data: { session: createMockSession(userId) },
    error: null,
  }
}

/**
 * Create unauthenticated session response object (for direct use)
 */
export function createUnauthenticatedSessionResponse() {
  return {
    data: { session: null },
    error: null,
  }
}

/**
 * Create getUser response object (for direct use)
 */
export function createGetUserResponse(userId: string = TEST_USER_IDS.PRIMARY) {
  return {
    data: { user: createMockUser(userId) },
    error: null,
  }
}

/**
 * Create unauthenticated getUser response object (for direct use)
 */
export function createUnauthenticatedUserResponse() {
  return {
    data: { user: null },
    error: { message: 'Not authenticated', status: 401 },
  }
}

// ============================================================================
// Cookie Store Mocks
// ============================================================================

/**
 * Creates a mock Next.js cookie store
 */
export function createMockCookieStore() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  }
}

/**
 * Resets all mocks in a cookie store
 */
export function resetMockCookieStore(mockCookieStore: ReturnType<typeof createMockCookieStore>) {
  mockCookieStore.get.mockReset()
  mockCookieStore.set.mockReset()
  mockCookieStore.delete.mockReset()
  mockCookieStore.has.mockReset()
  mockCookieStore.getAll.mockReset().mockReturnValue([])
}
