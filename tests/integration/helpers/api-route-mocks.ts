import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Shared test utilities for API route integration tests
 * 
 * This file provides reusable mock creators for:
 * - Next.js request objects
 * - Supabase client instances
 * - Common session patterns
 * 
 * Used across multiple API route test files to ensure consistency
 * and reduce duplication.
 */

/**
 * Helper to create a mock NextRequest for API route testing
 * 
 * @param body - The JSON body to be returned by request.json()
 * @param method - HTTP method (defaults to 'POST')
 * @returns A mocked NextRequest object
 * 
 * @example
 * const request = createMockRequest({ userId: '123' })
 * const response = await POST(request)
 */
export function createMockRequest(body: any, method: string = 'POST'): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    method,
  } as any
}

/**
 * Helper to create a mock Supabase client with common methods
 * 
 * The mock client includes chainable query methods (from, select, eq, etc.)
 * and can be extended with custom overrides for specific test cases.
 * 
 * @param overrides - Additional methods or overrides to add to the mock client
 * @returns A mocked Supabase client object
 * 
 * @example
 * const mockClient = createMockSupabaseClient({
 *   insert: vi.fn(() => mockClient),
 * })
 * mockClient.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null })
 */
export function createMockSupabaseClient(overrides = {}) {
  const mockClient = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    insert: vi.fn(() => mockClient),
    update: vi.fn(() => mockClient),
    delete: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
    ...overrides,
  }
  return mockClient
}

/**
 * Helper to create a mock session object for authenticated requests
 * 
 * @param userId - The user ID for the session
 * @param email - Optional email (defaults to test pattern)
 * @returns A mock session object matching Supabase session structure
 * 
 * @example
 * const session = createMockSession('user-123', 'test@example.com')
 * mockClient.auth.getSession.mockResolvedValue({ data: { session }, error: null })
 */
export function createMockSession(userId: string, email?: string) {
  return {
    user: { 
      id: userId,
      email: email || `test-${userId}@example.com`,
    },
    access_token: 'mock-access-token',
    token_type: 'bearer' as const,
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    refresh_token: 'mock-refresh-token',
  }
}

/**
 * Helper to create a mock "no session" response
 * 
 * @returns A mock Supabase response with null session
 * 
 * @example
 * mockClient.auth.getSession.mockResolvedValue(createMockNoSessionResponse())
 */
export function createMockNoSessionResponse() {
  return {
    data: { session: null },
    error: null,
  }
}

/**
 * Helper to create a mock session response with error
 * 
 * @param errorMessage - Error message to include
 * @returns A mock Supabase response with error
 * 
 * @example
 * mockClient.auth.getSession.mockResolvedValue(createMockSessionError('Auth failed'))
 */
export function createMockSessionError(errorMessage: string = 'Session authentication failed') {
  return {
    data: { session: null },
    error: new Error(errorMessage),
  }
}

/**
 * Helper to create a successful mock Supabase response
 * 
 * @param data - The data to return
 * @returns A mock Supabase response structure
 */
export function createMockSuccessResponse<T>(data: T) {
  return {
    data,
    error: null,
  }
}

/**
 * Helper to create a failed mock Supabase response
 * 
 * @param errorMessage - Error message
 * @param errorCode - Optional Postgres error code
 * @returns A mock Supabase error response structure
 */
export function createMockErrorResponse(errorMessage: string, errorCode?: string) {
  return {
    data: null,
    error: {
      message: errorMessage,
      ...(errorCode && { code: errorCode }),
    },
  }
}
