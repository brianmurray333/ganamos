import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST as disconnectAccount } from '@/app/api/disconnect-account/route'
import {
  TEST_USERS,
  TEST_CONNECTION_ID,
  createMockSession,
  createMockNoSession,
  createMockConnectedAccount,
  createMockSupabaseClient,
  setupSuccessfulDisconnectionFlow,
  setupUnauthorizedDisconnectionFlow,
  setupDeletionErrorFlow,
  createDisconnectRequest,
  createInvalidDisconnectRequest,
  expectConnectionDeleteCalled,
  expectOnlyConnectionTableAccessed,
  expectJsonResponse,
} from '../helpers/disconnect-account-mocks'

// Mock Supabase clients
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

describe('POST /api/disconnect-account - Integration Tests', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSupabaseClient = createMockSupabaseClient()
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
  })

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange: No session
      mockSupabaseClient.auth.getSession.mockResolvedValue(createMockNoSession())

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 401, { error: 'Unauthorized' })
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 401 when session is null', async () => {
      // Arrange: Null session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 401, { error: 'Unauthorized' })
    })

    it('should return 401 when getSession returns error', async () => {
      // Arrange: Session error
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session error' },
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 401, { error: 'Unauthorized' })
    })
  })

  describe('Request Validation', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should return 400 when connectedAccountId is missing', async () => {
      // Arrange: Invalid request body
      const request = createInvalidDisconnectRequest()

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 400, {
        error: 'Connected account ID is required',
      })
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 400 when connectedAccountId is null', async () => {
      // Arrange
      const request = new Request('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: JSON.stringify({ connectedAccountId: null }),
      })

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 400, {
        error: 'Connected account ID is required',
      })
    })

    it('should return 400 when connectedAccountId is empty string', async () => {
      // Arrange
      const request = new Request('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: JSON.stringify({ connectedAccountId: '' }),
      })

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 400, {
        error: 'Connected account ID is required',
      })
    })
  })

  describe('Authorization', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should return 403 when connection does not exist', async () => {
      // Arrange: Connection not found
      setupUnauthorizedDisconnectionFlow(mockSupabaseClient, 'not_found')

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 403, {
        error: "You don't have permission to disconnect this account",
      })
    })

    it('should return 403 when user is not the primary owner', async () => {
      // Arrange: Different primary user ID in connection
      const connectionData = createMockConnectedAccount(
        TEST_CONNECTION_ID,
        TEST_USERS.otherUser, // Different owner
        TEST_USERS.connectedUser
      )

      setupUnauthorizedDisconnectionFlow(mockSupabaseClient, 'wrong_owner')

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 403, {
        error: "You don't have permission to disconnect this account",
      })
    })

    it('should return 403 when connectedAccountId does not match any connection', async () => {
      // Arrange: Query returns null (no matching connection)
      setupUnauthorizedDisconnectionFlow(mockSupabaseClient)

      const request = createDisconnectRequest('non-existent-account-id')

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 403, {
        error: "You don't have permission to disconnect this account",
      })
    })
  })

  describe('Successful Disconnection', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should successfully disconnect account when authorized', async () => {
      // Arrange: Successful flow
      const connectionData = createMockConnectedAccount()
      const { mockFrom, deleteMock } = setupSuccessfulDisconnectionFlow(
        mockSupabaseClient,
        { connectionData }
      )

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 200, {
        success: true,
        message: 'Account disconnected successfully',
      })

      // Verify connection deletion was called with correct ID
      expectConnectionDeleteCalled(deleteMock, connectionData.id)

      // Verify query sequence
      expect(mockFrom).toHaveBeenCalledTimes(2)
      expect(mockFrom).toHaveBeenNthCalledWith(1, 'connected_accounts')
      expect(mockFrom).toHaveBeenNthCalledWith(2, 'connected_accounts')
    })

    it('should use correct query filters for authorization check', async () => {
      // Arrange
      const connectionData = createMockConnectedAccount(
        TEST_CONNECTION_ID,
        TEST_USERS.primaryUser,
        TEST_USERS.connectedUser
      )

      let capturedQueries: any = null
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        const selectFn = vi.fn().mockReturnValue({
          eq: vi.fn((field1: string, value1: string) => {
            return {
              eq: vi.fn((field2: string, value2: string) => {
                // Capture the query filters
                capturedQueries = { field1, value1, field2, value2 }
                return {
                  single: vi.fn().mockResolvedValue({
                    data: connectionData,
                    error: null,
                  }),
                }
              }),
            }
          }),
        })

        return {
          select: selectFn,
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify filters match expected primary_user_id and connected_user_id
      expect(capturedQueries).toEqual({
        field1: 'primary_user_id',
        value1: TEST_USERS.primaryUser,
        field2: 'connected_user_id',
        value2: TEST_USERS.connectedUser,
      })
    })

    it('should delete connection by exact connection ID', async () => {
      // Arrange
      const connectionId = 'specific-connection-id-xyz'
      const connectionData = createMockConnectedAccount(
        connectionId,
        TEST_USERS.primaryUser,
        TEST_USERS.connectedUser
      )

      const { deleteMock } = setupSuccessfulDisconnectionFlow(
        mockSupabaseClient,
        { connectionData }
      )

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify delete used exact connection ID from query result
      expectConnectionDeleteCalled(deleteMock, connectionId)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should return 500 when database delete operation fails', async () => {
      // Arrange: Delete error
      const { deleteError } = setupDeletionErrorFlow(mockSupabaseClient)

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 500, {
        error: 'Failed to disconnect account',
      })
    })

    it('should return 500 when unexpected error occurs', async () => {
      // Arrange: Throw error during processing
      mockSupabaseClient.from = vi.fn().mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      await expectJsonResponse(response, 500, {
        error: 'An unexpected error occurred',
      })
    })

    it('should handle malformed JSON request body', async () => {
      // Arrange: Invalid JSON
      const request = new Request('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: 'invalid-json{',
      })

      // Act
      const response = await disconnectAccount(request)

      // Assert
      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toHaveProperty('error')
    })
  })

  describe('Data Integrity', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should only access connected_accounts table', async () => {
      // Arrange
      const connectionData = createMockConnectedAccount()
      const { mockFrom } = setupSuccessfulDisconnectionFlow(
        mockSupabaseClient,
        { connectionData }
      )

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify no access to profiles, transactions, or other tables
      expectOnlyConnectionTableAccessed(mockFrom)
    })

    it('should not modify user profiles during disconnection', async () => {
      // Arrange
      const connectionData = createMockConnectedAccount()
      const mockUpdate = vi.fn()

      let callCount = 0
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: connectionData,
                    error: null,
                  }),
                }),
              }),
            }),
          }
        } else {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
            }),
            update: mockUpdate, // Should never be called
          }
        }
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify no update operations occurred
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('should preserve user account data after disconnection', async () => {
      // Arrange: Track all operations
      const operations: string[] = []
      const connectionData = createMockConnectedAccount()

      let callCount = 0
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          operations.push('query:connected_accounts')
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: connectionData,
                    error: null,
                  }),
                }),
              }),
            }),
          }
        } else {
          operations.push('delete:connected_accounts')
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
            }),
          }
        }
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify only connection deletion occurred, no profile modifications
      expect(operations).toEqual([
        'query:connected_accounts',
        'delete:connected_accounts',
      ])
    })
  })

  describe('Data Isolation', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should not affect other users connections', async () => {
      // Arrange: Verify no access to other user IDs
      const connectionData = createMockConnectedAccount()
      const { mockFrom, deleteMock } = setupSuccessfulDisconnectionFlow(
        mockSupabaseClient,
        { connectionData }
      )

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify other user IDs never appeared in any call
      const allMockCalls = JSON.stringify(mockFrom.mock.calls)
      expect(allMockCalls).not.toContain(TEST_USERS.otherUser)
      expect(allMockCalls).not.toContain(TEST_USERS.unauthorizedUser)

      // Verify delete was scoped to specific connection ID only
      const deleteEqCall = deleteMock.mock.results[0].value.eq
      expect(deleteEqCall).toHaveBeenCalledWith('id', connectionData.id)
      expect(deleteEqCall).toHaveBeenCalledTimes(1)
    })

    it('should only delete the specific connection record', async () => {
      // Arrange: Multiple connections exist but only one should be deleted
      const targetConnection = createMockConnectedAccount(
        'target-connection-id',
        TEST_USERS.primaryUser,
        TEST_USERS.connectedUser
      )

      const otherConnection = createMockConnectedAccount(
        'other-connection-id',
        TEST_USERS.primaryUser,
        TEST_USERS.otherUser
      )

      const { deleteMock } = setupSuccessfulDisconnectionFlow(
        mockSupabaseClient,
        { connectionData: targetConnection }
      )

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify only target connection ID was deleted
      const deleteEqCall = deleteMock.mock.results[0].value.eq
      expect(deleteEqCall).toHaveBeenCalledWith('id', 'target-connection-id')
      expect(deleteEqCall).not.toHaveBeenCalledWith('id', 'other-connection-id')
    })

    it('should enforce primary_user_id ownership in query', async () => {
      // Arrange: Capture all query parameters
      let queryCalls: any[] = []
      const connectionData = createMockConnectedAccount()

      mockSupabaseClient.from = vi.fn((tableName: string) => {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field: string, value: string) => {
              queryCalls.push({ field, value })
              return {
                eq: vi.fn((field2: string, value2: string) => {
                  queryCalls.push({ field: field2, value: value2 })
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: connectionData,
                      error: null,
                    }),
                  }
                }),
              }
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }
      })

      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      await disconnectAccount(request)

      // Assert: Verify query enforced primary_user_id = authenticated user
      expect(queryCalls).toContainEqual({
        field: 'primary_user_id',
        value: TEST_USERS.primaryUser,
      })
      expect(queryCalls).toContainEqual({
        field: 'connected_user_id',
        value: TEST_USERS.connectedUser,
      })
    })
  })

  describe('Response Format', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue(
        createMockSession(TEST_USERS.primaryUser)
      )
    })

    it('should return JSON with success true on successful disconnection', async () => {
      // Arrange
      setupSuccessfulDisconnectionFlow(mockSupabaseClient)
      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      expect(response.headers.get('content-type')).toContain('application/json')
      const json = await response.json()
      expect(json).toEqual({
        success: true,
        message: 'Account disconnected successfully',
      })
    })

    it('should return JSON with error message on failure', async () => {
      // Arrange: Unauthorized attempt
      setupUnauthorizedDisconnectionFlow(mockSupabaseClient)
      const request = createDisconnectRequest(TEST_USERS.connectedUser)

      // Act
      const response = await disconnectAccount(request)

      // Assert
      expect(response.headers.get('content-type')).toContain('application/json')
      const json = await response.json()
      expect(json).toHaveProperty('error')
      expect(json.error).toBe("You don't have permission to disconnect this account")
    })
  })
})