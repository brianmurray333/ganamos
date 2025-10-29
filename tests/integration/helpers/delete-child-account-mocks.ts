import { vi } from 'vitest'

/**
 * Test data constants for child account deletion tests
 */
export const TEST_USERS = {
  parent: 'parent-user-123',
  child: 'child-user-456',
  other: 'other-user-999',
}

export const TEST_EMAILS = {
  child: 'child@ganamos.app',
  nonChild: 'adult@example.com',
}

export const TEST_CONNECTION_ID = 'connection-789'

/**
 * Helper to create a mock session response
 */
export function createMockSession(userId: string) {
  return {
    data: { session: { user: { id: userId } } },
    error: null,
  }
}

/**
 * Helper to create a mock "no session" response
 */
export function createMockNoSession() {
  return {
    data: { session: null },
    error: null,
  }
}

/**
 * Helper to create mock connected account data
 */
export function createMockConnectedAccount(
  connectionId: string = TEST_CONNECTION_ID,
  primaryUserId: string = TEST_USERS.parent,
  connectedUserId: string = TEST_USERS.child
) {
  return {
    id: connectionId,
    primary_user_id: primaryUserId,
    connected_user_id: connectedUserId,
  }
}

/**
 * Helper to create mock profile data
 */
export function createMockProfile(overrides: {
  id?: string
  email?: string
  status?: string
  balance?: number
} = {}) {
  return {
    id: TEST_USERS.child,
    email: TEST_EMAILS.child,
    ...overrides,
  }
}

/**
 * Helper to create a mock Supabase client with default structure
 */
export function createMockSupabaseClient() {
  return {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  }
}

/**
 * Helper to create a mock Admin Supabase client
 */
export function createMockAdminSupabaseClient() {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn(),
      },
    },
  }
}

/**
 * Helper to create a mock query builder for successful connected_accounts fetch
 */
export function mockConnectedAccountsQuery(
  mockSupabaseClient: any,
  connectionData: any,
  error: any = null
) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: connectionData,
            error,
          }),
        }),
      }),
    }),
  }
}

/**
 * Helper to create a mock query builder for profile fetch
 */
export function mockProfileQuery(mockSupabaseClient: any, profileData: any, error: any = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: profileData,
          error,
        }),
      }),
    }),
  }
}

/**
 * Helper to create a mock update builder
 */
export function mockUpdateBuilder() {
  return vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
  })
}

/**
 * Helper to create a mock delete builder
 */
export function mockDeleteBuilder(error: any = null) {
  return vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: {}, error }),
  })
}

/**
 * Helper to setup a successful deletion flow with multiple `from` calls
 * This handles the common pattern of:
 * 1. Query connected_accounts
 * 2. Query profiles
 * 3. Update profiles (soft-delete)
 * 4. Delete connected_accounts
 */
export function setupSuccessfulDeletionFlow(
  mockSupabaseClient: any,
  options: {
    connectionData?: any
    profileData?: any
    updateMock?: any
    deleteMock?: any
  } = {}
) {
  const {
    connectionData = createMockConnectedAccount(),
    profileData = createMockProfile(),
    updateMock = mockUpdateBuilder(),
    deleteMock = mockDeleteBuilder(),
  } = options

  let callCount = 0
  const mockFrom = vi.fn((tableName: string) => {
    callCount++
    if (callCount === 1) {
      // First call: connected_accounts query
      return mockConnectedAccountsQuery(mockSupabaseClient, connectionData)
    } else if (callCount === 2) {
      // Second call: profiles query
      return mockProfileQuery(mockSupabaseClient, profileData)
    } else if (callCount === 3) {
      // Third call: profiles update (soft-delete)
      return { update: updateMock }
    } else {
      // Fourth call: connected_accounts delete
      return { delete: deleteMock }
    }
  })

  mockSupabaseClient.from = mockFrom
  return { mockFrom, updateMock, deleteMock }
}

/**
 * Helper to create a test request for delete-child-account API
 */
export function createDeleteRequest(childAccountId: string, baseUrl = 'http://localhost:3000') {
  return new Request(`${baseUrl}/api/delete-child-account`, {
    method: 'POST',
    body: JSON.stringify({ childAccountId }),
  })
}

/**
 * Helper to create a test request for soft-delete-child-account API
 */
export function createSoftDeleteRequest(childAccountId: string, baseUrl = 'http://localhost:3000') {
  return new Request(`${baseUrl}/api/soft-delete-child-account`, {
    method: 'POST',
    body: JSON.stringify({ childAccountId }),
  })
}

/**
 * Helper to verify soft-delete update was called with correct metadata
 */
export function expectSoftDeleteUpdateCalled(updateMock: any, parentUserId: string) {
  expect(updateMock).toHaveBeenCalled()
  const updateCall = updateMock.mock.calls[0][0]
  expect(updateCall).toHaveProperty('status', 'deleted')
  expect(updateCall).toHaveProperty('deleted_by', parentUserId)
  expect(updateCall).toHaveProperty('deleted_at')
  expect(updateCall).toHaveProperty('updated_at')
  expect(updateCall.deleted_at).toBeTruthy()
  expect(updateCall.updated_at).toBeTruthy()
}

/**
 * Helper to verify connected_accounts delete was called correctly
 */
export function expectConnectionDeleteCalled(deleteMock: any, connectionId: string) {
  expect(deleteMock).toHaveBeenCalled()
  const deleteEqCall = deleteMock.mock.results[0].value.eq
  expect(deleteEqCall).toHaveBeenCalledWith('id', connectionId)
}

/**
 * Helper to verify update was scoped to specific user ID
 */
export function expectUpdateScopedToUser(updateMock: any, userId: string) {
  const updateEqCall = updateMock.mock.results[0].value.eq
  expect(updateEqCall).toHaveBeenCalledWith('id', userId)
}
