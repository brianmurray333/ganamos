import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Test Fixtures for Device Registration
 * Provides reusable mock data and helper functions
 */

// Mock User Data
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id-123',
  email: 'test@example.com',
  ...overrides,
})

export const createAlternateUser = () => ({
  id: 'alternate-user-id-456',
  email: 'alternate@example.com',
})

// Mock Device Data
export const createMockDevice = (overrides = {}) => ({
  id: 'device-id-789',
  user_id: 'test-user-id-123',
  pairing_code: 'ABC123',
  pet_name: 'Fluffy',
  pet_type: 'cat',
  status: 'paired',
  last_seen_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// Valid Pet Types
export const VALID_PET_TYPES = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle'] as const
export const INVALID_PET_TYPE = 'elephant'

// Mock Request Bodies
export const createValidRequestBody = (overrides = {}) => ({
  deviceCode: 'ABC123',
  petName: 'Fluffy',
  petType: 'cat',
  ...overrides,
})

export const createInvalidRequestBody = {
  missingDeviceCode: { petName: 'Fluffy', petType: 'cat' },
  missingPetName: { deviceCode: 'ABC123', petType: 'cat' },
  missingPetType: { deviceCode: 'ABC123', petName: 'Fluffy' },
  invalidPetType: { deviceCode: 'ABC123', petName: 'Fluffy', petType: INVALID_PET_TYPE },
}

/**
 * Request Helper
 */
export const createDeviceRegistrationRequest = (body: any) => {
  return new NextRequest('http://localhost:3000/api/device/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Mock Authentication Responses
 */
export const mockAuthSuccess = (mockSupabaseClient: any, user = createMockUser()) => {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  })
}

export const mockAuthFailure = (mockSupabaseClient: any, errorMessage = 'Unauthorized') => {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: errorMessage },
  })
}

export const mockAuthNoUser = (mockSupabaseClient: any) => {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: null,
  })
}

/**
 * Mock Database Query Responses
 */
export const mockDeviceQueryNotFound = (mockSupabaseClient: any) => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' }, // PGRST116 = Postgres not found
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceQueryFound = (
  mockSupabaseClient: any,
  device = createMockDevice()
) => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: device,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceQueryError = (mockSupabaseClient: any, errorMessage = 'Database error') => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'DB_ERROR', message: errorMessage },
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Mock Insert Operations
 */
export const mockDeviceInsertSuccess = (
  mockSupabaseClient: any,
  device = createMockDevice()
) => {
  const mockQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: device,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceInsertError = (mockSupabaseClient: any, errorMessage = 'Insert failed') => {
  const mockQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: errorMessage },
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Mock Update Operations
 */
export const mockDeviceUpdateSuccess = (mockSupabaseClient: any) => {
  const mockQueryBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

export const mockDeviceUpdateError = (mockSupabaseClient: any, errorMessage = 'Update failed') => {
  const mockQueryBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: errorMessage },
    }),
  }
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Complex Mock Scenarios
 */
export const mockNewDeviceRegistrationFlow = (mockSupabaseClient: any) => {
  // First call: check for existing device (not found)
  const checkQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    }),
  }
  
  // Second call: insert new device (success)
  const insertQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: createMockDevice(),
      error: null,
    }),
  }
  
  mockSupabaseClient.from
    .mockReturnValueOnce(checkQueryBuilder)
    .mockReturnValueOnce(insertQueryBuilder)
  
  return { checkQueryBuilder, insertQueryBuilder }
}

export const mockRePairingFlow = (mockSupabaseClient: any, existingDevice = createMockDevice()) => {
  // First call: check for existing device (found with same user_id)
  const checkQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: existingDevice,
      error: null,
    }),
  }
  
  // Second call: update existing device (success)
  const updateQueryBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  }
  
  mockSupabaseClient.from
    .mockReturnValueOnce(checkQueryBuilder)
    .mockReturnValueOnce(updateQueryBuilder)
  
  return { checkQueryBuilder, updateQueryBuilder }
}

export const mockDuplicateDeviceConflict = (mockSupabaseClient: any) => {
  const existingDevice = createMockDevice({
    user_id: 'alternate-user-id-456', // Different user
    pet_name: 'Mittens',
  })
  
  const checkQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: existingDevice,
      error: null,
    }),
  }
  
  mockSupabaseClient.from.mockReturnValue(checkQueryBuilder)
  return { checkQueryBuilder, existingDevice }
}

/**
 * Assertion Helpers
 */
export const expectAuthGetUserCalled = (mockSupabaseClient: any) => {
  expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
}

export const expectDeviceQueryCalled = (
  mockSupabaseClient: any,
  pairingCode: string
) => {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
  const queryBuilder = mockSupabaseClient.from.mock.results[0].value
  expect(queryBuilder.select).toHaveBeenCalledWith('id, user_id, pet_name')
  expect(queryBuilder.eq).toHaveBeenCalledWith('pairing_code', pairingCode.toUpperCase())
}

export const expectDeviceInsertCalled = (
  mockSupabaseClient: any,
  expectedData: Partial<ReturnType<typeof createMockDevice>>
) => {
  const queryBuilder = mockSupabaseClient.from.mock.results[
    mockSupabaseClient.from.mock.calls.length - 1
  ].value
  expect(queryBuilder.insert).toHaveBeenCalledWith(
    expect.objectContaining(expectedData)
  )
  expect(queryBuilder.select).toHaveBeenCalled()
  expect(queryBuilder.single).toHaveBeenCalled()
}

export const expectDeviceUpdateCalled = (
  mockSupabaseClient: any,
  expectedData: Partial<ReturnType<typeof createMockDevice>>
) => {
  const queryBuilder = mockSupabaseClient.from.mock.results[
    mockSupabaseClient.from.mock.calls.length - 1
  ].value
  expect(queryBuilder.update).toHaveBeenCalledWith(
    expect.objectContaining(expectedData)
  )
}

export const expectSuccessResponse = (response: Response, data: any) => {
  expect(response.status).toBe(200)
  expect(data.success).toBe(true)
  expect(data.message).toBeDefined()
  expect(data.deviceId).toBeDefined()
}

export const expectErrorResponse = (
  response: Response,
  expectedStatus: number,
  expectedError: string
) => {
  expect(response.status).toBe(expectedStatus)
  expect(response).toBeDefined()
}