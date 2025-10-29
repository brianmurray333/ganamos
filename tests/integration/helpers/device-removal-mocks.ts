import { vi } from 'vitest'

/**
 * Test data constants for device removal tests
 */
export const TEST_USERS = {
  valid: 'user-123-valid-uuid',
  other: 'user-789-other-uuid',
}

export const TEST_DEVICES = {
  valid: 'device-456-valid-uuid',
  other: 'device-999-other-uuid',
}

export const VALID_USER = {
  id: TEST_USERS.valid,
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
}

export const MOCK_DEVICE = {
  id: TEST_DEVICES.valid,
  user_id: TEST_USERS.valid,
  pairing_code: 'ABC123',
  pet_name: 'Fluffy',
  pet_type: 'cat',
  status: 'paired',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

/**
 * Helper to create mock request with JSON body
 */
export function createMockRequest(body: any) {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    method: 'POST',
    url: 'http://localhost:3457/api/device/remove',
  } as any
}

/**
 * Helper to create mock authentication response
 */
export function createMockAuthResponse(user: any = VALID_USER, error: any = null) {
  return {
    data: { user },
    error,
  }
}

/**
 * Helper to create a mock Supabase delete chain
 * This handles the common pattern: from('devices').delete().eq('id', deviceId).eq('user_id', userId)
 */
export function createMockDeleteChain(options: {
  error?: any
  data?: any[]
  count?: number
} = {}) {
  const { error = null, data = [], count = 0 } = options

  const deleteChain = {
    eq: vi.fn().mockReturnThis(),
  }
  
  const initialDeleteChain = {
    eq: vi.fn().mockReturnValue(deleteChain),
  }

  // Final resolution of the chain
  deleteChain.eq.mockResolvedValue({
    error,
    data,
    count,
  })

  return { deleteChain, initialDeleteChain }
}

/**
 * Helper to create a basic mock Supabase client (for beforeEach setup)
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
 * Helper to create a fully configured mock Supabase client with delete behavior
 */
export function createFullMockSupabaseClient(options: {
  authUser?: any
  authError?: any
  deleteError?: any
  deleteData?: any[]
  deleteCount?: number
} = {}) {
  const {
    authUser = VALID_USER,
    authError = null,
    deleteError = null,
    deleteData = [],
    deleteCount = 0,
  } = options

  const { deleteChain, initialDeleteChain } = createMockDeleteChain({
    error: deleteError,
    data: deleteData,
    count: deleteCount,
  })

  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authUser },
        error: authError,
      }),
    },
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(initialDeleteChain),
    }),
  }

  return { mockClient, deleteChain, initialDeleteChain }
}

/**
 * Helper to setup mock for successful device deletion
 */
export function setupSuccessfulDeletion(mockSupabaseClient: any, user: any = VALID_USER) {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  })

  const { deleteChain, initialDeleteChain } = createMockDeleteChain()

  mockSupabaseClient.from.mockReturnValue({
    delete: vi.fn().mockReturnValue(initialDeleteChain),
  })

  return { deleteChain, initialDeleteChain }
}

/**
 * Helper to setup mock for failed device deletion
 */
export function setupFailedDeletion(
  mockSupabaseClient: any,
  deleteError: any,
  user: any = VALID_USER
) {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  })

  const { deleteChain, initialDeleteChain } = createMockDeleteChain({
    error: deleteError,
  })

  mockSupabaseClient.from.mockReturnValue({
    delete: vi.fn().mockReturnValue(initialDeleteChain),
  })

  return { deleteChain, initialDeleteChain }
}

/**
 * Helper to verify delete was called with correct parameters
 */
export function expectDeleteCalled(
  mockSupabaseClient: any,
  initialDeleteChain: any,
  deleteChain: any,
  deviceId: string,
  userId: string
) {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
  expect(initialDeleteChain.eq).toHaveBeenCalledWith('id', deviceId)
  expect(deleteChain.eq).toHaveBeenCalledWith('user_id', userId)
}
