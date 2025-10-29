import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/disconnect-account/route'
import {
  createMockRequest,
  createMockSupabaseClient,
  createMockSession,
  createMockNoSessionResponse,
  createMockSessionError,
  createMockSuccessResponse,
  createMockErrorResponse,
} from '@/tests/integration/helpers/api-route-mocks'

// Mock @supabase/auth-helpers-nextjs
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

// Import mocked function for assertions
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

// Test Fixtures
const PRIMARY_USER_ID = 'primary-user-123'
const CONNECTED_USER_ID = 'connected-user-456'
const UNAUTHORIZED_USER_ID = 'unauthorized-user-789'
const CONNECTION_ID = 'connection-abc-123'

const VALID_SESSION = createMockSession(PRIMARY_USER_ID)
const UNAUTHORIZED_SESSION = createMockSession(UNAUTHORIZED_USER_ID, 'unauthorized@example.com')

const MOCK_CONNECTION_DATA = {
  id: CONNECTION_ID,
  primary_user_id: PRIMARY_USER_ID,
  connected_user_id: CONNECTED_USER_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('POST /api/disconnect-account', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient = createMockSupabaseClient()
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 when session is missing', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
      })
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled()
    })

    it('should return 401 when session error occurs', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: new Error('Session authentication failed'),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
      })
    })
  })

  describe('Input Validation', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
    })

    it('should return 400 when connectedAccountId is missing', async () => {
      const request = createMockRequest({})

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'Connected account ID is required',
      })
      // Should not proceed to database queries
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 400 when connectedAccountId is null', async () => {
      const request = createMockRequest({
        connectedAccountId: null,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'Connected account ID is required',
      })
    })

    it('should return 400 when connectedAccountId is empty string', async () => {
      const request = createMockRequest({
        connectedAccountId: '',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'Connected account ID is required',
      })
    })
  })

  describe('Authorization', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
    })

    it('should return 403 when connection does not belong to user', async () => {
      // Mock connection query returning null (not found or not owned)
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: "You don't have permission to disconnect this account",
      })

      // Verify authorization query was executed correctly
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('connected_accounts')
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('primary_user_id', PRIMARY_USER_ID)
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('connected_user_id', CONNECTED_USER_ID)
      expect(mockSupabaseClient.single).toHaveBeenCalled()

      // Verify delete was NOT called
      expect(mockSupabaseClient.delete).not.toHaveBeenCalled()
    })

    it('should return 403 when connection query returns error', async () => {
      // Mock connection query returning error
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: 'PGRST116' },
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: "You don't have permission to disconnect this account",
      })
    })

    it('should return 403 when user tries to disconnect account they do not own', async () => {
      // Use unauthorized session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: UNAUTHORIZED_SESSION },
        error: null,
      })

      // Mock query returning null (connection not found for this user)
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: "You don't have permission to disconnect this account",
      })

      // Verify query used unauthorized user's ID
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('primary_user_id', UNAUTHORIZED_USER_ID)
    })
  })

  describe('Successful Disconnection', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
    })

    it('should successfully disconnect connected account', async () => {
      // Mock connection query returning valid connection
      mockSupabaseClient.single.mockResolvedValue({
        data: MOCK_CONNECTION_DATA,
        error: null,
      })

      // Mock successful deletion
      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        message: 'Account disconnected successfully',
      })

      // Verify authorization query was executed
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('connected_accounts')
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('primary_user_id', PRIMARY_USER_ID)
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('connected_user_id', CONNECTED_USER_ID)

      // Verify deletion was executed with correct ID
      expect(mockSupabaseClient.delete).toHaveBeenCalled()
      const deleteChain = mockSupabaseClient.delete()
      expect(deleteChain.eq).toHaveBeenCalledWith('id', CONNECTION_ID)
    })

    it('should enforce ownership via primary_user_id filter', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: MOCK_CONNECTION_DATA,
        error: null,
      })

      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      await POST(request)

      // Verify application-level authorization via primary_user_id filter
      // This complements the database-level RLS policy: auth.uid() = primary_user_id
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('primary_user_id', PRIMARY_USER_ID)
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('connected_user_id', CONNECTED_USER_ID)
    })
  })

  describe('Database Error Handling', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: MOCK_CONNECTION_DATA,
        error: null,
      })
    })

    it('should return 500 when deletion fails', async () => {
      // Mock deletion error
      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database constraint violation', code: '23503' },
        }),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to disconnect account',
      })
    })

    it('should return 500 when unexpected error occurs during deletion', async () => {
      // Mock unexpected deletion error
      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Internal server error' },
        }),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to disconnect account',
      })
    })
  })

  describe('RLS Policy Enforcement', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: MOCK_CONNECTION_DATA,
        error: null,
      })

      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })
    })

    it('should note that RLS DELETE policy enforces auth.uid() = primary_user_id at database level', async () => {
      // This test documents the dual-layer security approach:
      // 1. Application-level: .eq('primary_user_id', userId) query filter
      // 2. Database-level: RLS policy 'connected_accounts_delete_policy' 
      //    FOR DELETE USING (auth.uid() = primary_user_id)
      //
      // Both layers ensure only the primary user can delete connections.
      // The RLS policy provides defense-in-depth protection.

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      
      // Application-level enforcement verified via query filter
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('primary_user_id', PRIMARY_USER_ID)
      
      // Note: RLS policy enforcement happens at database level and cannot be 
      // directly tested in integration tests without database access.
      // Manual verification: See scripts/fix-connected-accounts-rls.sql
    })
  })

  describe('Error Response Consistency', () => {
    it('should return consistent error format for all error scenarios', async () => {
      // Test 400 error format
      const request400 = createMockRequest({})
      const response400 = await POST(request400)
      const data400 = await response400.json()
      expect(data400).toHaveProperty('error')
      expect(typeof data400.error).toBe('string')

      // Test 401 error format
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })
      const request401 = createMockRequest({ connectedAccountId: CONNECTED_USER_ID })
      const response401 = await POST(request401)
      const data401 = await response401.json()
      expect(data401).toHaveProperty('error')
      expect(typeof data401.error).toBe('string')

      // Test 403 error format
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })
      const request403 = createMockRequest({ connectedAccountId: CONNECTED_USER_ID })
      const response403 = await POST(request403)
      const data403 = await response403.json()
      expect(data403).toHaveProperty('error')
      expect(typeof data403.error).toBe('string')
    })

    it('should return success format with message on successful disconnection', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
      mockSupabaseClient.single.mockResolvedValue({
        data: MOCK_CONNECTION_DATA,
        error: null,
      })
      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('message')
      expect(data.success).toBe(true)
      expect(typeof data.message).toBe('string')
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
    })

    it('should handle malformed connectedAccountId gracefully', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      const request = createMockRequest({
        connectedAccountId: 'not-a-valid-uuid-format',
      })

      const response = await POST(request)
      const data = await response.json()

      // Should return 403 (not found/not authorized) rather than crashing
      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: "You don't have permission to disconnect this account",
      })
    })

    it('should handle unexpected JSON parsing errors', async () => {
      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: new Headers(),
        method: 'POST',
      } as any

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'An unexpected error occurred',
      })
    })

    it('should handle database timeout errors', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: MOCK_CONNECTION_DATA,
        error: null,
      })

      mockSupabaseClient.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'connection timeout', code: '57014' },
        }),
      })

      const request = createMockRequest({
        connectedAccountId: CONNECTED_USER_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to disconnect account',
      })
    })
  })
})