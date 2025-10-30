import { vi } from 'vitest'

/**
 * Test fixture utilities for device registration testing
 * Provides reusable mock data and helper functions following the testing patterns
 * established in the codebase (e.g., bitcoin-price-mocks.ts)
 */

// Valid pet types matching the database CHECK constraint
export const VALID_PET_TYPES = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle'] as const
export type PetType = typeof VALID_PET_TYPES[number]

// Mock user data
export const createMockUser = (overrides: Partial<{ id: string; email: string }> = {}) => ({
  id: overrides.id || 'test-user-123',
  email: overrides.email || 'test@example.com',
  user_metadata: {
    full_name: 'Test User',
  },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
})

// Mock device data
export const createMockDevice = (overrides: Partial<{
  id: string
  user_id: string
  pairing_code: string
  pet_name: string
  pet_type: PetType
  status: 'paired' | 'disconnected' | 'offline'
  last_seen_at: string
  created_at: string
  updated_at: string
}> = {}) => ({
  id: overrides.id || 'device-uuid-123',
  user_id: overrides.user_id || 'test-user-123',
  pairing_code: overrides.pairing_code || 'ABC123',
  pet_name: overrides.pet_name || 'Fluffy',
  pet_type: overrides.pet_type || 'cat',
  status: overrides.status || 'paired',
  last_seen_at: overrides.last_seen_at || new Date().toISOString(),
  created_at: overrides.created_at || new Date().toISOString(),
  updated_at: overrides.updated_at || new Date().toISOString(),
})

// Mock request body
export const createMockRequestBody = (overrides: Partial<{
  deviceCode: string
  petName: string
  petType: string
}> = {}) => ({
  deviceCode: overrides.deviceCode || 'ABC123',
  petName: overrides.petName || 'Fluffy',
  petType: overrides.petType || 'cat',
})

// Mock Supabase response structures
export const createMockSupabaseResponse = <T>(
  data: T | null,
  error: { message: string; code?: string } | null = null
) => ({
  data,
  error,
  count: null,
  status: error ? 400 : 200,
  statusText: error ? 'Bad Request' : 'OK',
})

// Mock authentication responses
export const mockAuthSuccess = (mockSupabaseClient: any, user = createMockUser()) => {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  })
}

export const mockAuthFailure = (mockSupabaseClient: any) => {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Unauthorized' },
  })
}

// Mock database query responses
export const mockDeviceNotFound = (mockSupabaseClient: any) => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    }),
  }
  // Use mockReturnValueOnce for each from() call to support multiple queries
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceFound = (mockSupabaseClient: any, device = createMockDevice()) => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: device,
      error: null,
    }),
  }
  // Use mockReturnValueOnce for each from() call to support multiple queries
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceUpdateSuccess = (mockSupabaseClient: any) => {
  const mockQueryBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  }
  // Use mockReturnValueOnce for each from() call to support multiple queries
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceInsertSuccess = (mockSupabaseClient: any, device = createMockDevice()) => {
  const mockQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: device,
      error: null,
    }),
  }
  // Use mockReturnValueOnce for each from() call to support multiple queries
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDatabaseError = (mockSupabaseClient: any, errorMessage = 'Database error') => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: errorMessage, code: 'DB_ERROR' },
    }),
  }
  // Use mockReturnValueOnce for each from() call to support multiple queries
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

// Helper to create complete mock request
export const createMockRequest = (body: any) => ({
  json: vi.fn().mockResolvedValue(body),
}) as any

// Assertion helpers
export const expectAuthChecked = (mockSupabaseClient: any) => {
  expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
}

export const expectDeviceQueried = (mockSupabaseClient: any, pairingCode: string) => {
  const fromCall = mockSupabaseClient.from.mock.calls.find((call: any) => call[0] === 'devices')
  expect(fromCall).toBeDefined()
}

export const expectDeviceCreated = (mockSupabaseClient: any, expectedData: Partial<ReturnType<typeof createMockDevice>>) => {
  const fromCall = mockSupabaseClient.from.mock.calls.find((call: any) => call[0] === 'devices')
  expect(fromCall).toBeDefined()
}

export const expectDeviceUpdated = (mockSupabaseClient: any, deviceId: string) => {
  const fromCall = mockSupabaseClient.from.mock.calls.find((call: any) => call[0] === 'devices')
  expect(fromCall).toBeDefined()
}

// Response validation helpers
export const expectSuccessResponse = (response: Response, expectedMessage?: string) => {
  expect(response.status).toBe(200)
  return response.json().then((data) => {
    expect(data.success).toBe(true)
    if (expectedMessage) {
      expect(data.message).toContain(expectedMessage)
    }
    return data
  })
}

export const expectErrorResponse = (response: Response, expectedStatus: number, expectedError?: string) => {
  expect(response.status).toBe(expectedStatus)
  return response.json().then((data) => {
    expect(data.success).toBe(false)
    if (expectedError) {
      expect(data.error).toContain(expectedError)
    }
    return data
  })
}