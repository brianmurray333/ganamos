import type { Database } from '@/lib/database.types'
import { vi } from 'vitest'

type Device = Database['public']['Tables']['devices']['Row']
type DeviceInsert = Database['public']['Tables']['devices']['Insert']

/**
 * Create a test device with default or overridden values
 * Follows the stale-while-revalidate pattern used in the codebase
 */
export const createTestDevice = (overrides: Partial<Device> = {}): Device => {
  const now = new Date().toISOString()
  
  return {
    id: 'test-device-id-' + Math.random().toString(36).substring(7),
    user_id: 'test-user-id',
    pairing_code: 'ABC123',
    pet_name: 'TestPet',
    pet_type: 'cat',
    status: 'paired',
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

/**
 * Create test device insert data
 */
export const createTestDeviceInsert = (
  overrides: Partial<DeviceInsert> = {}
): DeviceInsert => {
  return {
    user_id: 'test-user-id',
    pairing_code: 'ABC123',
    pet_name: 'TestPet',
    pet_type: 'cat',
    status: 'paired',
    last_seen_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock Supabase response for device queries
 * Matches the pattern used in tests/setup.ts
 */
export const createMockSupabaseResponse = <T>(
  data: T | null,
  error: any = null
) => ({
  data,
  error,
  count: null,
  status: error ? 400 : 200,
  statusText: error ? 'Bad Request' : 'OK',
})

/**
 * Create mock authenticated user
 */
export const createMockUser = (overrides: Partial<any> = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  ...overrides,
})

/**
 * Valid pet types for validation testing
 */
export const VALID_PET_TYPES = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle'] as const

/**
 * Test device registration request payload
 */
export const createDeviceRegistrationRequest = (
  overrides: Partial<{
    deviceCode: string
    petName: string
    petType: string
  }> = {}
) => ({
  deviceCode: 'ABC123',
  petName: 'TestPet',
  petType: 'cat',
  ...overrides,
})

/**
 * Mock Supabase auth error
 */
export const createAuthError = (message = 'Unauthorized') => ({
  message,
  status: 401,
  name: 'AuthApiError',
})

/**
 * Mock Supabase database error
 */
export const createDbError = (message = 'Database error', code = '23505') => ({
  message,
  code,
  details: null,
  hint: null,
})

/**
 * Helper to setup mock Supabase client for device queries
 * Returns mock functions for chaining
 */
export const setupDeviceQueryMock = (mockSupabase: any, deviceData: any = null, error: any = null) => {
  const mockSelect = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const mockSingle = vi.fn().mockResolvedValue(
    createMockSupabaseResponse(deviceData, error)
  )

  mockSupabase.from.mockReturnValue({
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
  })

  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
  mockEq.mockReturnValue({ single: mockSingle })

  return { mockSelect, mockEq, mockSingle }
}

/**
 * Helper to setup mock Supabase client for device insertion
 */
export const setupDeviceInsertMock = (mockSupabase: any, deviceData: any) => {
  const mockInsert = vi.fn().mockReturnThis()
  
  mockSupabase.from.mockReturnValue({
    ...mockSupabase.from(),
    insert: mockInsert,
  })

  mockInsert.mockReturnValue({
    select: () => ({
      single: () => Promise.resolve(createMockSupabaseResponse(deviceData)),
    }),
  })

  return mockInsert
}

/**
 * Helper to setup mock authenticated user
 */
export const setupMockAuth = (mockSupabase: any, user: any = null, error: any = null) => {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user },
    error,
  })
}

