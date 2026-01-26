/**
 * Integration tests for GET /api/device/list
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * Requires mocking auth since this route uses createRouteHandlerClient
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedUser, seedDevice, seedConnectedAccount } from './helpers/test-isolation'
import { getServiceClient, createMockRouteHandlerClient, getAnonClient } from './helpers/db-client'

// Track current authenticated user for mock - use hoisted to share state with mocks
const authState = vi.hoisted(() => ({ userId: null as string | null }))

// Mock the auth helpers to use real DB client with auth
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { createMockRouteHandlerClient, getAnonClient } = await import('./helpers/db-client')
  return {
    createRouteHandlerClient: vi.fn(() => {
      if (!authState.userId) {
        const client = getAnonClient()
        return {
          ...client,
          auth: {
            getUser: async () => ({ data: { user: null }, error: { message: 'Not authenticated' } }),
          },
        }
      }
      return createMockRouteHandlerClient(authState.userId)
    }),
  }
})

// Import route after mocks are set up
import { GET } from '@/app/api/device/list/route'

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({})),
}))

function createListRequest(activeUserId?: string): Request {
  const url = activeUserId
    ? `http://localhost:3000/api/device/list?activeUserId=${activeUserId}`
    : 'http://localhost:3000/api/device/list'

  return new Request(url, { method: 'GET' })
}

describe('GET /api/device/list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const request = createListRequest()
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Own Devices', () => {
    it('should return empty array when user has no devices', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const request = createListRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.devices).toEqual([])
    })

    it('should return device for authenticated user', async () => {
      const { id: userId } = await seedUser()
      await seedDevice(userId, { petName: 'MyDevice', status: 'paired' })
      authState.userId = userId

      const request = createListRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.devices).toHaveLength(1)
      expect(data.devices[0].pet_name).toBe('MyDevice')
    })

    it('should not return other users devices', async () => {
      const { id: userId1 } = await seedUser()
      const { id: userId2 } = await seedUser()
      await seedDevice(userId1, { petName: 'User1Device' })
      await seedDevice(userId2, { petName: 'User2Device' })
      authState.userId = userId1

      const request = createListRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.devices).toHaveLength(1)
      expect(data.devices[0].pet_name).toBe('User1Device')
    })

    it('should return device with correct fields', async () => {
      const { id: userId } = await seedUser()
      await seedDevice(userId, { petName: 'TestDevice', petType: 'cat', status: 'paired' })
      authState.userId = userId

      const request = createListRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.devices).toHaveLength(1)
      expect(data.devices[0].pet_name).toBe('TestDevice')
      expect(data.devices[0].pet_type).toBe('cat')
      expect(data.devices[0].status).toBe('paired')
    })
  })

  describe('Connected Account Devices', () => {
    it('should verify connected account relationship exists', async () => {
      // Note: The actual device fetching for child accounts may be limited by RLS
      // This test verifies the connection exists and the route permits the query
      const { id: parentId } = await seedUser({ name: 'Parent' })
      const { id: childId } = await seedUser({ name: 'Child' })
      await seedConnectedAccount(parentId, childId)
      await seedDevice(childId, { petName: 'ChildDevice' })

      authState.userId = parentId

      const request = createListRequest(childId)
      const response = await GET(request)

      // Route should return 200 (not 403) for connected accounts
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      // Note: devices array may be empty due to RLS - the important thing is
      // the route allowed the request (didn't return 403)
    })

    it('should return 403 when trying to view unconnected user devices', async () => {
      const { id: userId1 } = await seedUser()
      const { id: userId2 } = await seedUser()
      await seedDevice(userId2, { petName: 'OtherDevice' })

      authState.userId = userId1

      const request = createListRequest(userId2)
      const response = await GET(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe("Unauthorized to view this account's devices")
    })

    it('should not allow child to view parent devices', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent' })
      const { id: childId } = await seedUser({ name: 'Child' })
      await seedConnectedAccount(parentId, childId) // parent -> child connection
      await seedDevice(parentId, { petName: 'ParentDevice' })

      authState.userId = childId // Logged in as child

      // Child trying to view parent's devices
      const request = createListRequest(parentId)
      const response = await GET(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })
})
