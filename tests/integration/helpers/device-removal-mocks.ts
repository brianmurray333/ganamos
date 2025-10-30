import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Test data constants for device removal tests
 */
export const TEST_USERS = {
  primary: {
    id: 'user-123',
    email: 'test@example.com',
  },
  secondary: {
    id: 'user-abc-123',
    email: 'another@example.com',
  },
  alternate: {
    id: 'user-xyz-789',
    email: 'owner@example.com',
  },
}

export const TEST_DEVICES = {
  primary: 'device-456',
  secondary: 'device-xyz-789',
  alternate: 'device-abc-123',
  unauthorized: 'device-owned-by-another-user',
}

export const BASE_URL = 'http://localhost:3000/api/device/remove'

/**
 * Helper to create a mock authenticated user response
 */
export function createMockAuthUser(userId: string, email: string) {
  return {
    data: {
      user: {
        id: userId,
        email: email,
      },
    },
    error: null,
  }
}

/**
 * Helper to create a mock unauthenticated response
 */
export function createMockNoAuth() {
  return {
    data: { user: null },
    error: null,
  }
}

/**
 * Helper to create a mock auth error response
 */
export function createMockAuthError(message: string, code: string) {
  return {
    data: { user: null },
    error: { message, code },
  }
}

/**
 * Helper to create a mock auth response with both user and error (edge case)
 */
export function createMockAuthWithError(userId: string, email: string, errorMessage: string) {
  return {
    data: {
      user: {
        id: userId,
        email: email,
      },
    },
    error: { message: errorMessage },
  }
}

/**
 * Helper to create a mock Supabase client with basic structure
 */
export function createMockSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  }
}

/**
 * Helper to create a successful delete query chain
 * Returns the mocks for verification in tests
 */
export function createSuccessfulDeleteMocks() {
  const mockDelete = vi.fn().mockReturnThis()
  const mockFirstEq = vi.fn().mockReturnThis()
  const mockSecondEq = vi.fn().mockResolvedValue({
    data: null,
    error: null,
  })

  mockDelete.mockReturnValue({
    eq: mockFirstEq,
  })

  mockFirstEq.mockReturnValue({
    eq: mockSecondEq,
  })

  return { mockDelete, mockFirstEq, mockSecondEq }
}

/**
 * Helper to create a failed delete query chain
 */
export function createFailedDeleteMocks(errorMessage: string, errorCode?: string) {
  const mockDelete = vi.fn().mockReturnThis()
  const mockFirstEq = vi.fn().mockReturnThis()
  const mockSecondEq = vi.fn().mockResolvedValue({
    data: null,
    error: {
      message: errorMessage,
      ...(errorCode && { code: errorCode }),
    },
  })

  mockDelete.mockReturnValue({
    eq: mockFirstEq,
  })

  mockFirstEq.mockReturnValue({
    eq: mockSecondEq,
  })

  return { mockDelete, mockFirstEq, mockSecondEq }
}

/**
 * Helper to setup the Supabase from() mock to return delete chain
 */
export function setupDeleteQueryMock(mockSupabaseClient: any, deleteMocks: ReturnType<typeof createSuccessfulDeleteMocks | typeof createFailedDeleteMocks>) {
  mockSupabaseClient.from.mockReturnValue({
    delete: deleteMocks.mockDelete,
  })
}

/**
 * Helper to create a test request for device removal API
 */
export function createDeviceRemovalRequest(deviceId: string | null | undefined, baseUrl: string = BASE_URL) {
  return new NextRequest(baseUrl, {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  })
}

/**
 * Helper to create a test request with custom headers
 */
export function createDeviceRemovalRequestWithHeaders(
  deviceId: string,
  headers: Record<string, string>,
  baseUrl: string = BASE_URL
) {
  return new NextRequest(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deviceId }),
  })
}

/**
 * Helper to create a test request with malformed JSON
 */
export function createMalformedJsonRequest(body: string, baseUrl: string = BASE_URL) {
  return new NextRequest(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  })
}

/**
 * Helper to create a test request with empty body
 */
export function createEmptyBodyRequest(baseUrl: string = BASE_URL) {
  return new NextRequest(baseUrl, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * Helper to verify delete query was called with correct parameters
 */
export function expectDeleteQueryCalledCorrectly(
  mockFrom: any,
  mockDelete: any,
  mockFirstEq: any,
  mockSecondEq: any,
  deviceId: string,
  userId: string
) {
  expect(mockFrom).toHaveBeenCalledWith('devices')
  expect(mockDelete).toHaveBeenCalled()
  expect(mockFirstEq).toHaveBeenCalledWith('id', deviceId)
  expect(mockSecondEq).toHaveBeenCalledWith('user_id', userId)
}

/**
 * Helper to verify database operations were NOT called
 */
export function expectNoDatabaseOperations(mockFrom: any) {
  expect(mockFrom).not.toHaveBeenCalled()
}

/**
 * Helper to setup a full successful authentication and deletion flow
 */
export function setupSuccessfulFlow(
  mockSupabaseClient: any,
  user: { id: string; email: string }
) {
  // Setup auth
  mockSupabaseClient.auth.getUser.mockResolvedValue(
    createMockAuthUser(user.id, user.email)
  )

  // Setup delete query
  const deleteMocks = createSuccessfulDeleteMocks()
  setupDeleteQueryMock(mockSupabaseClient, deleteMocks)

  return deleteMocks
}

/**
 * Helper to setup authentication failure
 */
export function setupAuthFailure(mockSupabaseClient: any) {
  mockSupabaseClient.auth.getUser.mockResolvedValue(createMockNoAuth())
}

/**
 * Helper to setup delete failure
 */
export function setupDeleteFailure(
  mockSupabaseClient: any,
  user: { id: string; email: string },
  errorMessage: string,
  errorCode?: string
) {
  // Setup auth
  mockSupabaseClient.auth.getUser.mockResolvedValue(
    createMockAuthUser(user.id, user.email)
  )

  // Setup failed delete query
  const deleteMocks = createFailedDeleteMocks(errorMessage, errorCode)
  setupDeleteQueryMock(mockSupabaseClient, deleteMocks)

  return deleteMocks
}
