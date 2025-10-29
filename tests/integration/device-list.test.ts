import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/device/list/route'
import { createMockUser, mockAuthenticatedClient, mockUnauthenticatedClient, mockExpiredTokenClient } from '../utils/auth'
import { createMockDevice, createMockDevices, createMockConnection } from '../utils/fixtures'
import { mockSuccessfulQuery, mockFailedQuery, mockEmptyQuery } from '../utils/database'

// Mock Next.js dependencies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

// Mock Supabase auth helpers
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

describe('GET /api/device/list', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication Layer', () => {
    it('returns 401 when user is not authenticated', async () => {
      // Arrange: Mock unauthenticated client
      mockSupabaseClient = mockUnauthenticatedClient()
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call the endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 401 with error
      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
    })

    it('returns 401 when token is invalid or expired', async () => {
      // Arrange: Mock expired token client
      mockSupabaseClient = mockExpiredTokenClient()
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call the endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 401 with error
      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
    })

    it('returns 401 when auth.getUser returns null user', async () => {
      // Arrange: Mock client with null user but no explicit error
      mockSupabaseClient = {
        auth: {
          getUser: vi.fn(() => Promise.resolve({
            data: { user: null },
            error: null,
          })),
        },
        from: vi.fn(() => mockEmptyQuery()),
      }
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call the endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 401 even without explicit error
      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Unauthorized',
      })
    })
  })

  describe('Authorization Layer', () => {
    it('returns own devices when no activeUserId is specified', async () => {
      // Arrange: Mock authenticated user with devices
      const user = createMockUser({ id: 'user-123' })
      const devices = createMockDevices(2, { user_id: 'user-123' })
      
      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'devices') {
          return mockSuccessfulQuery(devices)
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint without activeUserId parameter
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return user's devices
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        devices,
      })
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
    })

    it('returns connected account devices when valid activeUserId is provided', async () => {
      // Arrange: Mock primary user accessing connected account's devices
      const primaryUser = createMockUser({ id: 'primary-user-id' })
      const connectedUserId = 'connected-user-id'
      const connection = createMockConnection({
        primary_user_id: 'primary-user-id',
        connected_user_id: connectedUserId,
      })
      const devices = createMockDevices(3, { user_id: connectedUserId })

      mockSupabaseClient = mockAuthenticatedClient(primaryUser)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'connected_accounts') {
          return mockSuccessfulQuery(connection)
        }
        if (tableName === 'devices') {
          return mockSuccessfulQuery(devices)
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint with activeUserId parameter
      const request = new Request(`http://localhost:3000/api/device/list?activeUserId=${connectedUserId}`)
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return connected user's devices
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        devices,
      })
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('connected_accounts')
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
    })

    it('returns 403 when activeUserId lacks permission (no connection)', async () => {
      // Arrange: Mock user attempting to access unconnected account
      const user = createMockUser({ id: 'user-123' })
      const unauthorizedUserId = 'unauthorized-user-id'

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'connected_accounts') {
          // Return null data indicating no connection exists
          return mockEmptyQuery()
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint with unauthorized activeUserId
      const request = new Request(`http://localhost:3000/api/device/list?activeUserId=${unauthorizedUserId}`)
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 403 with error
      expect(response.status).toBe(403)
      expect(data).toEqual({
        success: false,
        error: "Unauthorized to view this account's devices",
      })
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('connected_accounts')
    })

    it('validates connected_accounts relationship before returning devices', async () => {
      // Arrange: Mock proper connection validation flow
      const primaryUser = createMockUser({ id: 'primary-user-id' })
      const connectedUserId = 'connected-user-id'
      const connection = createMockConnection({
        primary_user_id: 'primary-user-id',
        connected_user_id: connectedUserId,
      })
      const devices = createMockDevices(1, { user_id: connectedUserId })

      mockSupabaseClient = mockAuthenticatedClient(primaryUser)
      const fromSpy = vi.fn((tableName: string) => {
        if (tableName === 'connected_accounts') {
          return mockSuccessfulQuery(connection)
        }
        if (tableName === 'devices') {
          return mockSuccessfulQuery(devices)
        }
        return mockEmptyQuery()
      })
      mockSupabaseClient.from = fromSpy

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint with connected account's ID
      const request = new Request(`http://localhost:3000/api/device/list?activeUserId=${connectedUserId}`)
      const response = await GET(request)

      // Assert: Should query connected_accounts before devices
      expect(fromSpy).toHaveBeenCalledWith('connected_accounts')
      expect(fromSpy).toHaveBeenCalledWith('devices')
      expect(response.status).toBe(200)
    })
  })

  describe('Data Retrieval Layer', () => {
    it('filters devices by user_id correctly', async () => {
      // Arrange: Mock user with specific devices
      const user = createMockUser({ id: 'user-456' })
      const userDevices = createMockDevices(2, { user_id: 'user-456' })

      mockSupabaseClient = mockAuthenticatedClient(user)
      const devicesQuery = mockSuccessfulQuery(userDevices)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'devices') {
          return devicesQuery
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should filter by user_id
      expect(response.status).toBe(200)
      expect(data.devices).toHaveLength(2)
      expect(data.devices.every((d: any) => d.user_id === 'user-456')).toBe(true)
      expect(devicesQuery.eq).toHaveBeenCalledWith('user_id', 'user-456')
    })

    it('orders devices by created_at DESC (most recent first)', async () => {
      // Arrange: Mock devices with different creation times
      const user = createMockUser({ id: 'user-789' })
      const devices = [
        createMockDevice({ id: 'device-3', created_at: '2024-01-03T00:00:00Z', user_id: 'user-789' }),
        createMockDevice({ id: 'device-2', created_at: '2024-01-02T00:00:00Z', user_id: 'user-789' }),
        createMockDevice({ id: 'device-1', created_at: '2024-01-01T00:00:00Z', user_id: 'user-789' }),
      ]

      mockSupabaseClient = mockAuthenticatedClient(user)
      const devicesQuery = mockSuccessfulQuery(devices)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'devices') {
          return devicesQuery
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should order by created_at descending
      expect(response.status).toBe(200)
      expect(devicesQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(data.devices[0].id).toBe('device-3') // Most recent first
      expect(data.devices[2].id).toBe('device-1') // Oldest last
    })

    it('includes all device fields in response', async () => {
      // Arrange: Mock device with all fields
      const user = createMockUser({ id: 'user-complete' })
      const device = createMockDevice({
        id: 'device-complete',
        user_id: 'user-complete',
        pairing_code: 'PAIR123',
        pet_name: 'Whiskers',
        pet_type: 'cat',
        status: 'paired',
        last_seen_at: '2024-01-15T12:00:00Z',
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-15T12:00:00Z',
      })

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'devices') {
          return mockSuccessfulQuery([device])
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should include all device fields
      expect(response.status).toBe(200)
      expect(data.devices[0]).toEqual(device)
      expect(data.devices[0]).toHaveProperty('id')
      expect(data.devices[0]).toHaveProperty('user_id')
      expect(data.devices[0]).toHaveProperty('pairing_code')
      expect(data.devices[0]).toHaveProperty('pet_name')
      expect(data.devices[0]).toHaveProperty('pet_type')
      expect(data.devices[0]).toHaveProperty('status')
      expect(data.devices[0]).toHaveProperty('last_seen_at')
      expect(data.devices[0]).toHaveProperty('created_at')
      expect(data.devices[0]).toHaveProperty('updated_at')
    })

    it('handles user with zero devices (returns empty array)', async () => {
      // Arrange: Mock user with no devices
      const user = createMockUser({ id: 'user-no-devices' })

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'devices') {
          return mockSuccessfulQuery([]) // Empty array
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return empty devices array
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        devices: [],
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles invalid activeUserId format gracefully', async () => {
      // Arrange: Mock user with malformed activeUserId
      const user = createMockUser({ id: 'user-123' })
      const invalidUserId = 'invalid-format-!@#$'

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'connected_accounts') {
          return mockEmptyQuery() // No connection found
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint with invalid activeUserId
      const request = new Request(`http://localhost:3000/api/device/list?activeUserId=${invalidUserId}`)
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 403 (no valid connection)
      expect(response.status).toBe(403)
      expect(data).toEqual({
        success: false,
        error: "Unauthorized to view this account's devices",
      })
    })

    it('handles non-existent activeUserId (UUID that does not exist)', async () => {
      // Arrange: Mock user trying to access non-existent user's devices
      const user = createMockUser({ id: 'user-123' })
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'connected_accounts') {
          return mockEmptyQuery() // No connection exists
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint with non-existent activeUserId
      const request = new Request(`http://localhost:3000/api/device/list?activeUserId=${nonExistentUserId}`)
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 403 (unauthorized)
      expect(response.status).toBe(403)
      expect(data).toEqual({
        success: false,
        error: "Unauthorized to view this account's devices",
      })
    })

    it('returns 500 when database query fails', async () => {
      // Arrange: Mock database error
      const user = createMockUser({ id: 'user-123' })

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn((tableName: string) => {
        if (tableName === 'devices') {
          return mockFailedQuery('Database connection failed')
        }
        return mockEmptyQuery()
      })

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should return 500 with error
      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to fetch devices',
      })
    })
  })

  describe('Response Format Validation', () => {
    it('returns consistent success response format', async () => {
      // Arrange: Mock successful request
      const user = createMockUser()
      const devices = createMockDevices(1)

      mockSupabaseClient = mockAuthenticatedClient(user)
      mockSupabaseClient.from = vi.fn(() => mockSuccessfulQuery(devices))

      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should match expected format
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('devices')
      expect(data.success).toBe(true)
      expect(Array.isArray(data.devices)).toBe(true)
      expect(data).not.toHaveProperty('error')
    })

    it('returns consistent error response format', async () => {
      // Arrange: Mock failed request
      mockSupabaseClient = mockUnauthenticatedClient()
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)

      // Act: Call endpoint
      const request = new Request('http://localhost:3000/api/device/list')
      const response = await GET(request)
      const data = await response.json()

      // Assert: Should match expected error format
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
      expect(data).not.toHaveProperty('devices')
    })
  })
})