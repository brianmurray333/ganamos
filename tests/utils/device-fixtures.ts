import { vi } from 'vitest'

/**
 * Device type union for type safety
 */
export type PetType = 'cat' | 'dog' | 'rabbit' | 'squirrel' | 'turtle'

/**
 * Device status type
 */
export type DeviceStatus = 'paired' | 'disconnected' | 'offline'

/**
 * Device fixture interface matching database schema
 */
export interface DeviceFixture {
  id: string
  user_id: string
  pairing_code: string
  pet_name: string
  pet_type: PetType
  status: DeviceStatus
  last_seen_at: string
  created_at: string
  updated_at: string
}

/**
 * User fixture interface for testing
 */
export interface UserFixture {
  id: string
  email: string
  name: string
  balance: number
}

/**
 * Create a test device with optional overrides
 */
export const createTestDevice = (overrides: Partial<DeviceFixture> = {}): DeviceFixture => {
  const now = new Date().toISOString()
  
  return {
    id: `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
 * Create a test user with optional overrides
 */
export const createTestUser = (overrides: Partial<UserFixture> = {}): UserFixture => {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    email: 'test@example.com',
    name: 'Test User',
    balance: 0,
    ...overrides,
  }
}

/**
 * Create mock Supabase response for successful operations
 */
export const createMockSupabaseResponse = <T>(data: T, error = null) => {
  return {
    data,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  }
}

/**
 * Create mock Supabase error response
 */
export const createMockSupabaseError = (message: string, code?: string) => {
  return {
    data: null,
    error: {
      message,
      code: code || 'ERROR',
      details: message,
      hint: null,
    },
    count: null,
    status: 400,
    statusText: 'Bad Request',
  }
}

/**
 * Mock authenticated user response
 */
export const mockAuthenticatedUser = (userId: string = 'test-user-id') => {
  return {
    data: {
      user: {
        id: userId,
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      },
    },
    error: null,
  }
}

/**
 * Mock unauthenticated user response (401)
 */
export const mockUnauthenticatedUser = () => {
  return {
    data: { user: null },
    error: {
      message: 'Auth session missing',
      status: 401,
    },
  }
}

/**
 * Create a mock Supabase query chain for device operations
 */
export const createDeviceQueryMock = (response: any) => {
  const queryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }
  
  return queryChain
}

/**
 * Valid pet types for validation testing
 */
export const VALID_PET_TYPES: PetType[] = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']

/**
 * Invalid pet types for validation testing
 */
export const INVALID_PET_TYPES = ['bird', 'fish', 'hamster', 'snake', 'lizard', '', 'invalid']

/**
 * Test pairing codes (various formats)
 */
export const TEST_PAIRING_CODES = {
  valid: 'ABC123',
  lowercase: 'abc123',
  mixed: 'AbC123',
  withSpaces: 'AB C123',
  numeric: '123456',
  short: 'AB1',
  long: 'ABCDEF123456',
}

/**
 * Create registration request payload
 */
export const createRegistrationPayload = (
  overrides: {
    deviceCode?: string
    petName?: string
    petType?: PetType | string
  } = {}
) => {
  return {
    deviceCode: overrides.deviceCode ?? 'ABC123',
    petName: overrides.petName ?? 'TestPet',
    petType: overrides.petType ?? 'cat',
  }
}

/**
 * Expected success response structure
 */
export const createSuccessResponse = (message: string, device?: DeviceFixture) => {
  return {
    message,
    ...(device && { device }),
  }
}

/**
 * Expected error response structure
 */
export const createErrorResponse = (error: string) => {
  return {
    error,
  }
}

/**
 * Setup mock for device registration endpoint
 */
export const setupDeviceRegistrationMocks = (
  supabaseMock: any,
  authResponse: any,
  deviceQueryResponse: any,
  insertOrUpdateResponse?: any
) => {
  // Mock auth.getUser
  supabaseMock.auth.getUser.mockResolvedValue(authResponse)
  
  // Mock device query (for duplicate check)
  const queryChain = createDeviceQueryMock(deviceQueryResponse)
  
  // Mock insert/update operations if provided
  if (insertOrUpdateResponse) {
    queryChain.insert.mockReturnThis()
    queryChain.update.mockReturnThis()
    queryChain.single.mockResolvedValue(insertOrUpdateResponse)
  }
  
  supabaseMock.from.mockReturnValue(queryChain)
  
  return queryChain
}

/**
 * Reset all mocks to clean state
 */
export const resetAllMocks = (supabaseMock: any) => {
  supabaseMock.auth.getUser.mockReset()
  supabaseMock.from.mockReset()
}