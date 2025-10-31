import { vi, expect } from 'vitest'

/**
 * Test data constants for disconnect-account integration tests
 */
export const TEST_USERS = {
  primaryUser: 'primary-user-123',
  connectedUser: 'connected-user-456',
  otherUser: 'other-user-789',
  unauthorizedUser: 'unauthorized-user-999',
}

export const TEST_EMAILS = {
  primary: 'primary@example.com',
  connected: 'connected@example.com',
  other: 'other@example.com',
}

export const TEST_CONNECTION_ID = 'connection-abc-123'

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
 * Helper to create a mock "no session" response (unauthenticated)
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
  primaryUserId: string = TEST_USERS.primaryUser,
  connectedUserId: string = TEST_USERS.connectedUser
) {
  return {
    id: connectionId,
    primary_user_id: primaryUserId,
    connected_user_id: connectedUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
 * Helper to create a mock query builder for connected_accounts fetch
 */
export function mockConnectedAccountsQuery(
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
 * Helper to create a mock delete builder
 */
export function mockDeleteBuilder(error: any = null) {
  return vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: {}, error }),
  })
}

/**
 * Helper to setup a successful disconnection flow
 * This handles the two-step pattern:
 * 1. Query connected_accounts (authorization check)
 * 2. Delete from connected_accounts
 */
export function setupSuccessfulDisconnectionFlow(
  mockSupabaseClient: any,
  options: {
    connectionData?: any
    deleteMock?: any
  } = {}
) {
  const {
    connectionData = createMockConnectedAccount(),
    deleteMock = mockDeleteBuilder(),
  } = options

  let callCount = 0
  const mockFrom = vi.fn((tableName: string) => {
    callCount++
    if (callCount === 1) {
      // First call: connected_accounts query (authorization check)
      return mockConnectedAccountsQuery(connectionData)
    } else {
      // Second call: connected_accounts delete
      return { delete: deleteMock }
    }
  })

  mockSupabaseClient.from = mockFrom
  return { mockFrom, deleteMock }
}

/**
 * Helper to setup unauthorized disconnection flow (connection not found)
 */
export function setupUnauthorizedDisconnectionFlow(
  mockSupabaseClient: any,
  errorType: 'not_found' | 'wrong_owner' = 'not_found'
) {
  const mockFrom = vi.fn((tableName: string) => {
    // Return query that finds no connection
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: errorType === 'not_found' 
                ? { code: 'PGRST116', message: 'No rows returned' }
                : null,
            }),
          }),
        }),
      }),
    }
  })

  mockSupabaseClient.from = mockFrom
  return { mockFrom }
}

/**
 * Helper to setup database error during deletion
 */
export function setupDeletionErrorFlow(
  mockSupabaseClient: any,
  connectionData: any = createMockConnectedAccount()
) {
  const deleteError = { message: 'Database error during deletion', code: 'DB_ERROR' }
  const mockDelete = mockDeleteBuilder(deleteError)

  let callCount = 0
  const mockFrom = vi.fn((tableName: string) => {
    callCount++
    if (callCount === 1) {
      return mockConnectedAccountsQuery(connectionData)
    } else {
      return { delete: mockDelete }
    }
  })

  mockSupabaseClient.from = mockFrom
  return { mockFrom, mockDelete, deleteError }
}

/**
 * Helper to create a test request for disconnect-account API
 */
export function createDisconnectRequest(
  connectedAccountId: string,
  baseUrl = 'http://localhost:3000'
) {
  return new Request(`${baseUrl}/api/disconnect-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectedAccountId }),
  })
}

/**
 * Helper to create invalid request (missing connectedAccountId)
 */
export function createInvalidDisconnectRequest(baseUrl = 'http://localhost:3000') {
  return new Request(`${baseUrl}/api/disconnect-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}), // Missing connectedAccountId
  })
}

/**
 * Helper to verify connection delete was called correctly
 */
export function expectConnectionDeleteCalled(
  deleteMock: any,
  connectionId: string
) {
  expect(deleteMock).toHaveBeenCalled()
  const deleteEqCall = deleteMock.mock.results[0].value.eq
  expect(deleteEqCall).toHaveBeenCalledWith('id', connectionId)
}

/**
 * Helper to verify only connected_accounts table was accessed
 */
export function expectOnlyConnectionTableAccessed(mockFrom: any) {
  const allFromCalls = mockFrom.mock.calls.map((call: any) => call[0])
  
  // Should only access 'connected_accounts' table
  expect(allFromCalls).toEqual(['connected_accounts', 'connected_accounts'])
  
  // Verify no access to profiles, transactions, activities, or other tables
  expect(allFromCalls).not.toContain('profiles')
  expect(allFromCalls).not.toContain('transactions')
  expect(allFromCalls).not.toContain('activities')
  expect(allFromCalls).not.toContain('posts')
}

/**
 * Helper to verify response status and JSON body
 */
export async function expectJsonResponse(
  response: Response,
  expectedStatus: number,
  expectedBody?: Record<string, any>
) {
  expect(response.status).toBe(expectedStatus)
  
  if (expectedBody) {
    const json = await response.json()
    expect(json).toMatchObject(expectedBody)
  }
}