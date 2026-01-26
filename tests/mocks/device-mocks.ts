import { expect, vi } from 'vitest'
import { createMockDevice, createMockUser, createMockRequestBody, VALID_PET_TYPES } from './test-data'
import type { PetType } from './test-data'

// Re-export for convenience
export { createMockDevice, createMockUser, createMockRequestBody, VALID_PET_TYPES }
export type { PetType }

/**
 * Mock Behavior: Configure successful authentication
 */
export function mockAuthSuccess(
  mockSupabaseClient: { auth: { getSession: ReturnType<typeof vi.fn> } },
  user: ReturnType<typeof createMockUser>
) {
  mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
    data: {
      session: {
        user,
        access_token: 'mock-token',
        expires_at: Date.now() + 3600000,
      },
    },
    error: null,
  })
}

/**
 * Mock Behavior: Configure authentication failure
 */
export function mockAuthFailure(mockSupabaseClient: { auth: { getSession: ReturnType<typeof vi.fn> } }) {
  mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
    data: { session: null },
    error: null,
  })
}

/**
 * Mock Behavior: Configure device found in database
 */
export function mockDeviceFound(
  mockSupabaseClient: { from: ReturnType<typeof vi.fn> },
  device: ReturnType<typeof createMockDevice>
) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: device, error: null }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
}

/**
 * Mock Behavior: Configure device not found (PGRST116 error)
 */
export function mockDeviceNotFound(mockSupabaseClient: { from: ReturnType<typeof vi.fn> }) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'The result contains 0 rows',
        details: null,
        hint: null,
      },
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  // Also mock the second query (check for user's existing device) - also not found
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
}

/**
 * Mock Behavior: Configure successful device insert
 */
export function mockDeviceInsertSuccess(
  mockSupabaseClient: { from: ReturnType<typeof vi.fn> },
  device: ReturnType<typeof createMockDevice>
) {
  const mockQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: device, error: null }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
}

/**
 * Mock Behavior: Configure successful device update
 */
export function mockDeviceUpdateSuccess(
  mockSupabaseClient: { from: ReturnType<typeof vi.fn> },
  device: ReturnType<typeof createMockDevice>
) {
  const mockQueryBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: device, error: null }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
}

/**
 * Mock Behavior: Configure database error
 */
export function mockDatabaseError(
  mockSupabaseClient: { from: ReturnType<typeof vi.fn> },
  message: string = 'Database error',
  operation: 'select' | 'insert' | 'update' = 'select'
) {
  const error = {
    code: '23505',
    message,
    details: null,
    hint: null,
  }

  if (operation === 'insert') {
    const mockQueryBuilder = {
      insert: vi.fn().mockResolvedValue({ data: null, error }),
    }
    mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  } else if (operation === 'update') {
    const mockQueryBuilder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error }),
    }
    mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  } else {
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error }),
    }
    mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  }
}

/**
 * Mock Behavior: Configure connected account relationship
 */
export function mockConnectedAccountFound(
  mockSupabaseClient: { from: ReturnType<typeof vi.fn> },
  parentId: string,
  childId: string
) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { primary_user_id: parentId, connected_user_id: childId },
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
}

/**
 * Mock Behavior: Configure connected account not found
 */
export function mockConnectedAccountNotFound(mockSupabaseClient: { from: ReturnType<typeof vi.fn> }) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'The result contains 0 rows',
      },
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
}

/**
 * Assertion Helper: Verify authentication was checked
 */
export function expectDeviceAuthChecked(mockSupabaseClient: { auth: { getSession: ReturnType<typeof vi.fn> } }) {
  expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled()
}

/**
 * Assertion Helper: Verify successful device response structure
 */
export function expectDeviceSuccessResponse(response: Response, expectedMessage?: string) {
  expect(response.status).toBe(200)
  return response.json().then((data: { success: boolean; message: string; deviceId: string }) => {
    expect(data.success).toBe(true)
    expect(data.message).toBeDefined()
    if (expectedMessage) {
      expect(data.message).toContain(expectedMessage)
    }
    expect(data.deviceId).toBeDefined()
    return data
  })
}

/**
 * Assertion Helper: Verify device error response structure
 */
export function expectDeviceErrorResponse(response: Response, statusCode: number, errorMessage?: string) {
  expect(response.status).toBe(statusCode)
  return response.json().then((data: { success: boolean; error: string }) => {
    expect(data.success).toBe(false)
    expect(data.error).toBeDefined()
    if (errorMessage) {
      expect(data.error).toContain(errorMessage)
    }
    return data
  })
}
