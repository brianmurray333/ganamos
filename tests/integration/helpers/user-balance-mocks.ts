import { vi } from 'vitest'

/**
 * User Balance API Mock Utilities
 * 
 * Provides reusable mock factories for testing the /api/user/balance endpoint.
 * These mocks simulate Supabase client behavior without making real database calls.
 */

// Type definitions for mock data
export interface MockSession {
  user: {
    id: string
    email: string
  }
}

export interface MockProfile {
  balance: number
}

/**
 * Create a mock session object for authenticated requests
 */
export function createMockSession(userId: string = 'test-user-id'): MockSession {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
    },
  }
}

/**
 * Create a mock Supabase client for balance endpoint testing
 * 
 * @param options Configuration for the mock behavior
 * @param options.session - Mock session to return (null for unauthenticated)
 * @param options.profile - Mock profile data to return
 * @param options.profileError - Error to return from profile query
 */
export function createMockSupabaseClient(options: {
  session?: MockSession | null
  profile?: MockProfile | null
  profileError?: Error | null
}) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: options.session },
      }),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: options.profile,
        error: options.profileError,
      }),
    })),
  }
}

/**
 * Create a chainable mock Supabase client for verifying method calls
 * 
 * This version is useful for tests that need to verify the exact chain
 * of methods called on the Supabase client (from -> select -> eq -> single).
 * 
 * @param options Configuration for the mock behavior
 * @param options.session - Mock session to return
 * @param options.profile - Mock profile data to return
 * @param options.profileError - Error to return from profile query
 */
export function createChainableMockSupabaseClient(options: {
  session: MockSession
  profile?: MockProfile | null
  profileError?: Error | null
}) {
  const selectSpy = vi.fn().mockReturnThis()
  const eqSpy = vi.fn().mockReturnThis()
  const singleSpy = vi.fn().mockResolvedValue({
    data: options.profile,
    error: options.profileError,
  })

  const chainMock = {
    select: selectSpy,
    eq: eqSpy,
    single: singleSpy,
  }

  const fromSpy = vi.fn((table: string) => chainMock)

  return {
    mockSupabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: options.session },
        }),
      },
      from: fromSpy,
    },
    spies: {
      from: fromSpy,
      select: selectSpy,
      eq: eqSpy,
      single: singleSpy,
    },
  }
}

/**
 * Create mock for unauthenticated request (401 scenario)
 */
export function createUnauthenticatedMock() {
  return createMockSupabaseClient({
    session: null,
  })
}

/**
 * Create mock for successful balance fetch
 */
export function createSuccessfulBalanceMock(balance: number = 1000, userId: string = 'test-user-id') {
  return createMockSupabaseClient({
    session: createMockSession(userId),
    profile: { balance },
  })
}

/**
 * Create mock for database error scenario
 */
export function createDatabaseErrorMock(errorMessage: string = 'Database connection failed') {
  return createMockSupabaseClient({
    session: createMockSession(),
    profile: null,
    profileError: new Error(errorMessage),
  })
}

/**
 * Create mock for zero balance (new user)
 */
export function createZeroBalanceMock() {
  return createSuccessfulBalanceMock(0)
}

/**
 * Create mock for large balance value
 */
export function createLargeBalanceMock(balance: number = 1000000000) {
  return createSuccessfulBalanceMock(balance)
}
