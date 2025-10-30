import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/device/list/route'
import { NextRequest } from 'next/server'
import {
  TEST_USER_IDS,
  TEST_DEVICES,
  TEST_CONNECTED_ACCOUNTS,
  createDevice,
} from '@/tests/utils/fixtures'
import {
  createMockSession,
  createGetUserResponse,
  createUnauthenticatedUserResponse,
} from '@/tests/utils/auth'
import {
  createMockSupabaseClient,
  createSuccessResponse,
  createErrorResponse,
  createNotFoundResponse,
} from '@/tests/utils/database'

// Mock Supabase auth helpers
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

// Import mocked functions for assertions
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

/**
 * Helper to create a mock NextRequest with query parameters
 */
function createMockRequest(queryParams: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3457/api/device/list')
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  return {
    url: url.toString(),
    headers: new Headers(),
    method: 'GET',
  } as NextRequest
}

describe('GET /api/device/list', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create a fresh mock Supabase client for each test
    mockSupabaseClient = createMockSupabaseClient()
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createUnauthenticatedUserResponse()
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledTimes(1)
    })

    it('should return 401 when getUser returns error', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' },
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
    })
  })

  describe('Authorization - Own Devices', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createGetUserResponse(TEST_USER_IDS.PRIMARY)
      )
    })

    it('should return own devices when no activeUserId parameter provided', async () => {
      // Mock devices query response - order() returns the promise
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([TEST_DEVICES.PRIMARY_USER_DEVICE])
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices).toHaveLength(1)
      expect(data.devices[0]).toEqual(TEST_DEVICES.PRIMARY_USER_DEVICE)

      // Verify query was filtered by authenticated user's ID
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', TEST_USER_IDS.PRIMARY)
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('should return own devices when activeUserId matches authenticated user', async () => {
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([TEST_DEVICES.PRIMARY_USER_DEVICE])
      )

      const request = createMockRequest({ activeUserId: TEST_USER_IDS.PRIMARY })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices).toHaveLength(1)

      // Should NOT check connected_accounts since activeUserId === user.id
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('connected_accounts')
    })

    it('should return empty array when user has no devices', async () => {
      mockSupabaseClient.order.mockResolvedValue(createSuccessResponse([]))

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices).toEqual([])
    })

    it('should return multiple devices ordered by created_at DESC', async () => {
      const device1 = createDevice({
        id: 'device-1',
        created_at: new Date('2024-01-10').toISOString(),
      })
      const device2 = createDevice({
        id: 'device-2',
        created_at: new Date('2024-01-20').toISOString(),
      })
      const device3 = createDevice({
        id: 'device-3',
        created_at: new Date('2024-01-15').toISOString(),
      })

      // Mock returns in correct order (DESC by created_at)
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([device2, device3, device1])
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices).toHaveLength(3)
      expect(data.devices[0].id).toBe('device-2') // Newest first
      expect(data.devices[1].id).toBe('device-3')
      expect(data.devices[2].id).toBe('device-1') // Oldest last
    })
  })

  describe('Authorization - Connected Accounts', () => {
    beforeEach(() => {
      // Mock authenticated as primary user
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createGetUserResponse(TEST_USER_IDS.PRIMARY)
      )
    })

    it('should return connected account devices when valid relationship exists', async () => {
      // Mock connected_accounts query - returns valid connection (uses .single())
      mockSupabaseClient.single.mockResolvedValueOnce(
        createSuccessResponse(TEST_CONNECTED_ACCOUNTS.PRIMARY_TO_CHILD)
      )
      // Mock devices query for child account (uses .order())
      mockSupabaseClient.order.mockResolvedValueOnce(
        createSuccessResponse([TEST_DEVICES.CHILD_USER_DEVICE])
      )

      const request = createMockRequest({ activeUserId: TEST_USER_IDS.CONNECTED_CHILD })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices).toHaveLength(1)
      expect(data.devices[0]).toEqual(TEST_DEVICES.CHILD_USER_DEVICE)

      // Verify connected_accounts authorization check
      const fromCalls = mockSupabaseClient.from.mock.calls
      expect(fromCalls[0][0]).toBe('connected_accounts')
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('primary_user_id')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'connected_user_id',
        TEST_USER_IDS.CONNECTED_CHILD
      )
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'primary_user_id',
        TEST_USER_IDS.PRIMARY
      )

      // Verify devices query used activeUserId
      expect(fromCalls[1][0]).toBe('devices')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'user_id',
        TEST_USER_IDS.CONNECTED_CHILD
      )
    })

    it('should return 403 when connected_accounts relationship does not exist', async () => {
      // Mock connected_accounts query - returns no connection
      mockSupabaseClient.single.mockResolvedValue(createNotFoundResponse())

      const request = createMockRequest({ activeUserId: TEST_USER_IDS.UNRELATED })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        success: false,
        error: "Unauthorized to view this account's devices",
      })

      // Verify devices query was NOT made
      const fromCalls = mockSupabaseClient.from.mock.calls
      expect(fromCalls.length).toBe(1) // Only connected_accounts query
      expect(fromCalls[0][0]).toBe('connected_accounts')
    })

    it('should return 403 when user tries to access unrelated account', async () => {
      mockSupabaseClient.single.mockResolvedValue(createNotFoundResponse())

      const request = createMockRequest({ activeUserId: TEST_USER_IDS.UNRELATED })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
      expect(data.error).toBe("Unauthorized to view this account's devices")
    })

    it('should return 403 when connected_accounts query returns error', async () => {
      mockSupabaseClient.single.mockResolvedValue(
        createErrorResponse('Database error')
      )

      const request = createMockRequest({ activeUserId: TEST_USER_IDS.CONNECTED_CHILD })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
    })
  })

  describe('Data Retrieval', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createGetUserResponse(TEST_USER_IDS.PRIMARY)
      )
    })

    it('should include all device fields in response', async () => {
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([TEST_DEVICES.PRIMARY_USER_DEVICE])
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      const device = data.devices[0]

      // Verify all expected fields are present
      expect(device).toHaveProperty('id')
      expect(device).toHaveProperty('user_id')
      expect(device).toHaveProperty('pairing_code')
      expect(device).toHaveProperty('pet_name')
      expect(device).toHaveProperty('pet_type')
      expect(device).toHaveProperty('status')
      expect(device).toHaveProperty('last_seen_at')
      expect(device).toHaveProperty('created_at')
      expect(device).toHaveProperty('updated_at')
    })

    it('should use select(*) to retrieve all columns', async () => {
      mockSupabaseClient.order.mockResolvedValue(createSuccessResponse([]))

      const request = createMockRequest()
      await GET(request)

      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*')
    })

    it('should return 500 when devices query fails', async () => {
      mockSupabaseClient.order.mockResolvedValue(
        createErrorResponse('Database connection failed')
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to fetch devices',
      })
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createGetUserResponse(TEST_USER_IDS.PRIMARY)
      )
    })

    it('should handle empty activeUserId parameter (defaults to authenticated user)', async () => {
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([TEST_DEVICES.PRIMARY_USER_DEVICE])
      )

      const request = createMockRequest({ activeUserId: '' })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)

      // Should use authenticated user's ID (fallback)
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', TEST_USER_IDS.PRIMARY)
    })

    it('should handle malformed activeUserId gracefully', async () => {
      // Mock connected_accounts query returns no connection
      mockSupabaseClient.single.mockResolvedValue(createNotFoundResponse())

      const request = createMockRequest({ activeUserId: 'invalid-uuid-format' })
      const response = await GET(request)
      const data = await response.json()

      // Should return 403 since connection check will fail
      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
    })

    it('should return 500 when unexpected error occurs', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Unexpected database error')
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Internal server error',
      })
    })

    it('should handle devices with null optional fields', async () => {
      const deviceWithNulls = createDevice({
        pet_name: 'Test Pet',
        last_seen_at: null as any,
      })

      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([deviceWithNulls])
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices[0].last_seen_at).toBeNull()
    })
  })

  describe('Query Parameters', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createGetUserResponse(TEST_USER_IDS.PRIMARY)
      )
    })

    it('should correctly parse activeUserId from query string', async () => {
      // Mock connected_accounts query (uses .single())
      mockSupabaseClient.single.mockResolvedValueOnce(
        createSuccessResponse(TEST_CONNECTED_ACCOUNTS.PRIMARY_TO_CHILD)
      )
      // Mock devices query (uses .order())
      mockSupabaseClient.order.mockResolvedValueOnce(
        createSuccessResponse([TEST_DEVICES.CHILD_USER_DEVICE])
      )

      const request = createMockRequest({ activeUserId: TEST_USER_IDS.CONNECTED_CHILD })
      const response = await GET(request)

      expect(response.status).toBe(200)

      // Verify activeUserId was used in queries
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'connected_user_id',
        TEST_USER_IDS.CONNECTED_CHILD
      )
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'user_id',
        TEST_USER_IDS.CONNECTED_CHILD
      )
    })

    it('should ignore extra query parameters', async () => {
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([TEST_DEVICES.PRIMARY_USER_DEVICE])
      )

      const request = createMockRequest({
        activeUserId: TEST_USER_IDS.PRIMARY,
        extraParam: 'ignored',
        anotherParam: 'also-ignored',
      })
      const response = await GET(request)
      const data = await response.json()

      // Should still succeed and ignore extra params
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Response Format', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createGetUserResponse(TEST_USER_IDS.PRIMARY)
      )
    })

    it('should return success:true with devices array on success', async () => {
      mockSupabaseClient.order.mockResolvedValue(
        createSuccessResponse([TEST_DEVICES.PRIMARY_USER_DEVICE])
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('devices')
      expect(Array.isArray(data.devices)).toBe(true)
      expect(data).not.toHaveProperty('error')
    })

    it('should return success:false with error message on failure', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue(
        createUnauthenticatedUserResponse()
      )

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(typeof data.error).toBe('string')
      expect(data).not.toHaveProperty('devices')
    })

    it('should return empty array instead of null when no devices found', async () => {
      mockSupabaseClient.order.mockResolvedValue(createSuccessResponse(null))

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.devices).toEqual([])
      expect(Array.isArray(data.devices)).toBe(true)
    })
  })
})