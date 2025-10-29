import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/device/remove/route'
import { NextRequest } from 'next/server'

// Mock external dependencies
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

// Import mocked functions for assertions
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Import test helpers
import {
  TEST_USERS,
  TEST_DEVICES,
  VALID_USER,
  MOCK_DEVICE,
  createMockRequest,
  createMockSupabaseClient,
  createMockDeleteChain,
  setupSuccessfulDeletion,
  setupFailedDeletion,
  expectDeleteCalled,
} from './helpers/device-removal-mocks'

// Re-export for backward compatibility in tests
const VALID_USER_ID = TEST_USERS.valid
const VALID_DEVICE_ID = TEST_DEVICES.valid
const OTHER_USER_ID = TEST_USERS.other
const OTHER_DEVICE_ID = TEST_DEVICES.other

describe('POST /api/device/remove - Device Removal Integration Tests', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock Supabase client
    mockSupabaseClient = createMockSupabaseClient()
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
    vi.mocked(cookies).mockReturnValue({} as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated (no user)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 401 when authentication error occurs', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT token' },
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
    })

    it('should authenticate valid user before processing deletion', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })

      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      })

      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      await POST(request)

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
    })
  })

  describe('Input Validation', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })
    })

    it('should return 400 when deviceId is missing', async () => {
      const request = createMockRequest({})

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 400 when deviceId is null', async () => {
      const request = createMockRequest({
        deviceId: null,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })
    })

    it('should return 400 when deviceId is undefined', async () => {
      const request = createMockRequest({
        deviceId: undefined,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })
    })

    it('should return 400 when deviceId is empty string', async () => {
      const request = createMockRequest({
        deviceId: '',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Device ID is required',
      })
    })

    it('should accept valid UUID format deviceId', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
    })
  })

  describe('Successful Device Removal', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })
    })

    it('should successfully remove device with 200 response', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        message: 'Device unpaired successfully',
      })
    })

    it('should call delete with correct device id', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      const deleteMethod = vi.fn().mockReturnValue(initialDeleteChain)
      
      mockSupabaseClient.from.mockReturnValue({
        delete: deleteMethod,
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      await POST(request)

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
      expect(deleteMethod).toHaveBeenCalled()
      expect(initialDeleteChain.eq).toHaveBeenCalledWith('id', VALID_DEVICE_ID)
    })

    it('should enforce ownership by checking user_id', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      await POST(request)

      // Verify both .eq() calls: first for id, second for user_id
      expect(initialDeleteChain.eq).toHaveBeenCalledWith('id', VALID_DEVICE_ID)
      expect(deleteChain.eq).toHaveBeenCalledWith('user_id', VALID_USER_ID)
    })

    it('should return success message with proper structure', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('message')
      expect(data.success).toBe(true)
      expect(data.message).toBe('Device unpaired successfully')
      expect(data.error).toBeUndefined()
    })
  })

  describe('Authorization and Ownership', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })
    })

    it('should include user_id in delete query for ownership enforcement', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      await POST(request)

      // Verify the second .eq() call is for user_id (ownership check)
      expect(deleteChain.eq).toHaveBeenCalledWith('user_id', VALID_USER_ID)
    })

    it('should not delete device if ownership validation fails (simulated RLS)', async () => {
      // Simulate RLS preventing deletion by returning no rows affected
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      // Simulate RLS policy blocking - no error but no rows deleted
      deleteChain.eq.mockResolvedValue({
        error: null,
        data: [], // No rows affected
        count: 0,
      })

      const request = createMockRequest({
        deviceId: OTHER_DEVICE_ID, // Different device owned by another user
      })

      const response = await POST(request)

      // Should still return success (RLS silently blocks)
      expect(response.status).toBe(200)
      
      // Verify ownership check was applied
      expect(deleteChain.eq).toHaveBeenCalledWith('user_id', VALID_USER_ID)
    })

    it('should use authenticated user id from session', async () => {
      const differentUser = {
        id: 'different-user-id',
        email: 'different@example.com',
      }

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: differentUser },
        error: null,
      })

      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      await POST(request)

      // Should use the authenticated user's ID, not any ID from request
      expect(deleteChain.eq).toHaveBeenCalledWith('user_id', differentUser.id)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })
    })

    it('should return 500 when database deletion fails', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: {
          message: 'Database connection failed',
          code: 'PGRST301',
        },
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to remove device',
      })
    })

    it('should handle database constraint errors', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: {
          message: 'Foreign key constraint violation',
          code: '23503',
        },
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to remove device',
      })
    })

    it('should return 500 with generic error message on unexpected errors', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Unexpected database error')
      )

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Internal server error',
      })
    })

    it('should handle JSON parsing errors', async () => {
      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: new Headers(),
        method: 'POST',
        url: 'http://localhost:3457/api/device/remove',
      } as any

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Internal server error',
      })
    })

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      const dbError = {
        message: 'Connection timeout',
        code: 'TIMEOUT',
      }

      deleteChain.eq.mockResolvedValue({
        error: dbError,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      await POST(request)

      expect(consoleSpy).toHaveBeenCalledWith('Error deleting device:', dbError)

      consoleSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })
    })

    it('should handle valid UUID v4 format', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const uuidV4 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      const request = createMockRequest({
        deviceId: uuidV4,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(initialDeleteChain.eq).toHaveBeenCalledWith('id', uuidV4)
    })

    it('should handle malformed UUID gracefully (database will reject)', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      // Database would reject malformed UUID
      deleteChain.eq.mockResolvedValue({
        error: {
          message: 'invalid input syntax for type uuid',
          code: '22P02',
        },
      })

      const request = createMockRequest({
        deviceId: 'not-a-valid-uuid',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })

    it('should handle device that does not exist (no error, just no rows affected)', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
        data: [],
        count: 0,
      })

      const request = createMockRequest({
        deviceId: 'non-existent-device-id',
      })

      const response = await POST(request)

      // Still returns success (idempotent operation)
      expect(response.status).toBe(200)
    })

    it('should handle whitespace-only deviceId', async () => {
      const request = createMockRequest({
        deviceId: '   ',
      })

      const response = await POST(request)
      const data = await response.json()

      // Whitespace-only string is truthy, so passes validation
      // But would fail at database level
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const whitespaceRequest = createMockRequest({
        deviceId: '   ',
      })

      const whitespaceResponse = await POST(whitespaceRequest)

      // Accepts whitespace deviceId (endpoint doesn't trim)
      expect(whitespaceResponse.status).toBe(200)
    })

    it('should handle concurrent deletion attempts (idempotent)', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request1 = createMockRequest({ deviceId: VALID_DEVICE_ID })
      const request2 = createMockRequest({ deviceId: VALID_DEVICE_ID })

      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ])

      // Both should succeed (idempotent)
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
    })
  })

  describe('Response Structure Validation', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: null,
      })
    })

    it('should return consistent success response structure', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toMatchObject({
        success: expect.any(Boolean),
        message: expect.any(String),
      })
      expect(data.success).toBe(true)
      expect(data.error).toBeUndefined()
    })

    it('should return consistent error response structure', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toMatchObject({
        success: expect.any(Boolean),
        error: expect.any(String),
      })
      expect(data.success).toBe(false)
      expect(data.message).toBeUndefined()
    })

    it('should return proper HTTP status codes', async () => {
      const testCases = [
        {
          setup: () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
              data: { user: null },
              error: null,
            })
          },
          deviceId: VALID_DEVICE_ID,
          expectedStatus: 401,
          description: 'unauthorized',
        },
        {
          setup: () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
              data: { user: VALID_USER },
              error: null,
            })
          },
          deviceId: null,
          expectedStatus: 400,
          description: 'missing deviceId',
        },
      ]

      for (const testCase of testCases) {
        testCase.setup()
        const request = createMockRequest({ deviceId: testCase.deviceId })
        const response = await POST(request)
        
        expect(response.status).toBe(testCase.expectedStatus)
      }
    })

    it('should set correct content-type header', async () => {
      const deleteChain = {
        eq: vi.fn().mockReturnThis(),
      }
      const initialDeleteChain = {
        eq: vi.fn().mockReturnValue(deleteChain),
      }
      mockSupabaseClient.from.mockReturnValue({
        delete: vi.fn().mockReturnValue(initialDeleteChain),
      })

      deleteChain.eq.mockResolvedValue({
        error: null,
      })

      const request = createMockRequest({
        deviceId: VALID_DEVICE_ID,
      })

      const response = await POST(request)

      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })
})