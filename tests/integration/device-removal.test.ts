import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/device/remove/route'
import { NextRequest } from 'next/server'
import {
  TEST_USERS,
  TEST_DEVICES,
  createMockAuthUser,
  createMockNoAuth,
  createMockAuthError,
  createMockAuthWithError,
  createSuccessfulDeleteMocks,
  createFailedDeleteMocks,
  setupDeleteQueryMock,
  createDeviceRemovalRequest,
  createDeviceRemovalRequestWithHeaders,
  createMalformedJsonRequest,
  expectDeleteQueryCalledCorrectly,
  expectNoDatabaseOperations,
  setupSuccessfulFlow,
  setupAuthFailure,
  setupDeleteFailure,
} from './helpers/device-removal-mocks'

// Mock the Supabase client factory
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(() => mockSupabaseClient),
}))

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

describe('Device Removal API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Successful Device Removal', () => {
    it('should remove device when user owns it and return 200', async () => {
      // Setup successful flow using helper
      const deleteMocks = setupSuccessfulFlow(mockSupabaseClient, TEST_USERS.primary)

      // Create request using helper
      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        message: 'Device unpaired successfully',
      })

      expectDeleteQueryCalledCorrectly(
        mockSupabaseClient.from,
        deleteMocks.mockDelete,
        deleteMocks.mockFirstEq,
        deleteMocks.mockSecondEq,
        TEST_DEVICES.primary,
        TEST_USERS.primary.id
      )
    })

    it('should handle successful deletion with different device IDs', async () => {
      // Setup successful flow with different user/device
      const deleteMocks = setupSuccessfulFlow(mockSupabaseClient, TEST_USERS.secondary)

      const request = createDeviceRemovalRequest(TEST_DEVICES.secondary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(deleteMocks.mockSecondEq).toHaveBeenCalledWith('user_id', TEST_USERS.secondary.id)
    })
  })

  describe('Authentication Failures', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Setup auth failure using helper
      setupAuthFailure(mockSupabaseClient)

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })

      // Should not attempt database operations
      expectNoDatabaseOperations(mockSupabaseClient.from)
    })

    it('should return 401 when authentication fails with error', async () => {
      // Use helper to create auth error
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthError('Invalid token', 'INVALID_JWT')
      )

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
    })

    it('should return 401 when user exists but has error', async () => {
      // Use helper for edge case: user + error
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthWithError(TEST_USERS.primary.id, TEST_USERS.primary.email, 'Token expired')
      )

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Input Validation', () => {
    it('should return 400 when deviceId is missing', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      const request = new NextRequest('http://localhost:3000/api/device/remove', {
        method: 'POST',
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })

      expectNoDatabaseOperations(mockSupabaseClient.from)
    })

    it('should return 400 when deviceId is null', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      const request = createDeviceRemovalRequest(null)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })
    })

    it('should return 400 when deviceId is empty string', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      const request = createDeviceRemovalRequest('')

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })
    })

    it('should return 400 when deviceId is undefined', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      const request = createDeviceRemovalRequest(undefined)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Device ID is required')
    })
  })

  describe('Authorization and Ownership Enforcement', () => {
    it('should enforce user_id ownership in delete query', async () => {
      const deleteMocks = setupSuccessfulFlow(mockSupabaseClient, TEST_USERS.primary)

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      await POST(request)

      // Verify both ownership conditions are applied
      expect(deleteMocks.mockFirstEq).toHaveBeenCalledWith('id', TEST_DEVICES.primary)
      expect(deleteMocks.mockSecondEq).toHaveBeenCalledWith('user_id', TEST_USERS.primary.id)
    })

    it('should include both device ID and user ID in query chain', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.alternate.id, TEST_USERS.alternate.email)
      )

      const eqCalls: Array<{ field: string; value: string }> = []
      
      const mockFirstEq = vi.fn((field, value) => {
        eqCalls.push({ field, value })
        return {
          eq: mockSecondEq,
        }
      })

      const mockSecondEq = vi.fn((field, value) => {
        eqCalls.push({ field, value })
        return Promise.resolve({
          data: null,
          error: null,
        })
      })

      const mockDelete = vi.fn().mockReturnValue({
        eq: mockFirstEq,
      })

      mockSupabaseClient.from.mockReturnValue({
        delete: mockDelete,
      })

      const request = createDeviceRemovalRequest(TEST_DEVICES.alternate)

      await POST(request)

      // Verify the query chain includes both filters
      expect(eqCalls).toHaveLength(2)
      expect(eqCalls[0]).toEqual({ field: 'id', value: TEST_DEVICES.alternate })
      expect(eqCalls[1]).toEqual({ field: 'user_id', value: TEST_USERS.alternate.id })
    })

    it('should return success even if no rows are deleted (RLS enforcement)', async () => {
      const deleteMocks = setupSuccessfulFlow(mockSupabaseClient, TEST_USERS.primary)

      const request = createDeviceRemovalRequest(TEST_DEVICES.unauthorized)

      const response = await POST(request)
      const data = await response.json()

      // Should still return success since query succeeded (no error)
      // RLS/ownership enforcement means no rows were affected, but no error thrown
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Device unpaired successfully')
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when database deletion fails', async () => {
      const deleteMocks = setupDeleteFailure(
        mockSupabaseClient,
        TEST_USERS.primary,
        'Database connection failed',
        'CONNECTION_ERROR'
      )

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to remove device',
      })
    })

    it('should return 500 when unexpected exception occurs during deletion', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      // Simulate unexpected error during request processing
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Internal server error',
      })
    })

    it('should handle database timeout errors', async () => {
      setupDeleteFailure(
        mockSupabaseClient,
        TEST_USERS.primary,
        'Query timeout',
        'TIMEOUT'
      )

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to remove device')
    })

    it('should handle malformed JSON in request body', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      // Create request with invalid JSON using helper
      const request = createMalformedJsonRequest('invalid-json{')

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('Response Structure Validation', () => {
    it('should return proper success response structure', async () => {
      const deleteMocks = setupSuccessfulFlow(mockSupabaseClient, TEST_USERS.primary)

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      // Verify response has expected structure
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('message')
      expect(typeof data.success).toBe('boolean')
      expect(typeof data.message).toBe('string')
      expect(data.success).toBe(true)
      expect(data.message).toBe('Device unpaired successfully')
    })

    it('should return proper error response structure for unauthorized', async () => {
      setupAuthFailure(mockSupabaseClient)

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
      expect(data.error).toBe('Unauthorized')
    })

    it('should return proper error response structure for validation failure', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      const request = new NextRequest('http://localhost:3000/api/device/remove', {
        method: 'POST',
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
      expect(data.error).toBe('Device ID is required')
    })

    it('should return proper error response structure for database failure', async () => {
      setupDeleteFailure(
        mockSupabaseClient,
        TEST_USERS.primary,
        'Database error'
      )

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })

    it('should not leak sensitive error details in production', async () => {
      const deleteMocks = createFailedDeleteMocks('Internal server error with sensitive details')
      
      // Manually add sensitive data to the error
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createMockAuthUser(TEST_USERS.primary.id, TEST_USERS.primary.email)
      )

      const mockDelete = vi.fn().mockReturnThis()
      const mockFirstEq = vi.fn().mockReturnThis()
      const mockSecondEq = vi.fn().mockResolvedValue({
        data: null,
        error: { 
          message: 'Internal server error with sensitive details',
          hint: 'Check database credentials',
          details: 'Connection string: postgres://user:password@host/db',
        },
      })

      mockSupabaseClient.from.mockReturnValue({
        delete: mockDelete,
      })

      mockDelete.mockReturnValue({
        eq: mockFirstEq,
      })

      mockFirstEq.mockReturnValue({
        eq: mockSecondEq,
      })

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      // Should return generic error message, not expose internal details
      expect(data.error).toBe('Failed to remove device')
      expect(data).not.toHaveProperty('hint')
      expect(data).not.toHaveProperty('details')
    })
  })

  describe('Integration with Frontend', () => {
    it('should match frontend expected request format from pet-settings page', async () => {
      const deleteMocks = setupSuccessfulFlow(mockSupabaseClient, TEST_USERS.primary)

      // Simulate exact frontend request format from handleUnpair function
      const request = createDeviceRemovalRequestWithHeaders(
        TEST_DEVICES.primary,
        { 'Content-Type': 'application/json' }
      )

      const response = await POST(request)
      const data = await response.json()

      // Frontend expects success boolean and message string
      expect(data.success).toBe(true)
      expect(typeof data.message).toBe('string')
    })

    it('should return response compatible with frontend error handling', async () => {
      setupAuthFailure(mockSupabaseClient)

      const request = createDeviceRemovalRequest(TEST_DEVICES.primary)

      const response = await POST(request)
      const data = await response.json()

      // Frontend checks result.success and displays result.error in toast
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })
  })
})
