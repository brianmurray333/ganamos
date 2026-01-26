/**
 * Integration tests for POST /api/device/remove
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * Requires mocking auth since this route uses createRouteHandlerClient
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedUser, seedDevice } from './helpers/test-isolation'
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
import { POST } from '@/app/api/device/remove/route'

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({})),
}))

function createRemoveRequest(deviceId?: string): Request {
  return new Request('http://localhost:3000/api/device/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deviceId ? { deviceId } : {}),
  })
}

describe('POST /api/device/remove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const request = createRemoveRequest('some-device-id')
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Request Validation', () => {
    it('should return 400 when deviceId is missing', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const request = createRemoveRequest()
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device ID is required')
    })
  })

  describe('Device Removal', () => {
    it('should successfully remove own device', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { petName: 'ToRemove' })
      authState.userId = userId

      // Verify device exists before removal
      const serviceClient = getServiceClient()
      const { data: beforeDevice } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single()
      expect(beforeDevice).not.toBeNull()

      const request = createRemoveRequest(deviceId)
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toBe('Device unpaired successfully')

      // Verify device was actually deleted from database
      const { data: afterDevice } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single()
      expect(afterDevice).toBeNull()
    })

    it('should not remove another users device', async () => {
      const { id: userId1 } = await seedUser()
      const { id: userId2 } = await seedUser()
      const { id: deviceId } = await seedDevice(userId2, { petName: 'OtherDevice' })
      authState.userId = userId1 // Logged in as user1

      const request = createRemoveRequest(deviceId) // Trying to remove user2's device
      const response = await POST(request)

      // The route returns 200 but doesn't actually delete (because of user_id filter)
      expect(response.status).toBe(200)

      // Verify device still exists
      const serviceClient = getServiceClient()
      const { data: device } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single()
      expect(device).not.toBeNull()
      expect(device?.pet_name).toBe('OtherDevice')
    })

    it('should handle removing non-existent device gracefully', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const fakeDeviceId = crypto.randomUUID()
      const request = createRemoveRequest(fakeDeviceId)
      const response = await POST(request)

      // Route returns success even if no rows affected
      expect(response.status).toBe(200)
    })

    it('should remove device and leave other users devices intact', async () => {
      const { id: userId1 } = await seedUser()
      const { id: userId2 } = await seedUser()
      const { id: deviceId1 } = await seedDevice(userId1, { petName: 'Device1' })
      const { id: deviceId2 } = await seedDevice(userId2, { petName: 'Device2' })
      authState.userId = userId1

      // Remove user1's device
      const request = createRemoveRequest(deviceId1)
      const response = await POST(request)
      expect(response.status).toBe(200)

      // Verify device1 was removed but device2 (other user) still exists
      const serviceClient = getServiceClient()
      const { data: device1 } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId1)
        .single()
      expect(device1).toBeNull()

      const { data: device2 } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId2)
        .single()
      expect(device2).not.toBeNull()
      expect(device2?.pet_name).toBe('Device2')
    })
  })
})
