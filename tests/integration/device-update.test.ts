/**
 * Integration tests for POST /api/device/update
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
import { POST } from '@/app/api/device/update/route'

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({})),
}))

function createUpdateRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/device/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/device/update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const request = createUpdateRequest({
        deviceId: 'some-id',
        petName: 'NewName',
        petType: 'cat',
      })
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

      const request = createUpdateRequest({ petName: 'Name', petType: 'cat' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('should return 400 when petName is missing', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId)
      authState.userId = userId

      const request = createUpdateRequest({ deviceId, petType: 'cat' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Missing required fields')
    })

    it('should return 400 when petType is missing', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId)
      authState.userId = userId

      const request = createUpdateRequest({ deviceId, petName: 'Name' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Missing required fields')
    })

    it('should return 400 for invalid pet type', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId)
      authState.userId = userId

      const request = createUpdateRequest({
        deviceId,
        petName: 'Name',
        petType: 'dragon', // Invalid
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid pet type')
    })
  })

  describe('Valid Pet Types', () => {
    const validPetTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl']

    it.each(validPetTypes)('should accept %s as valid pet type', async (petType) => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId)
      authState.userId = userId

      const request = createUpdateRequest({
        deviceId,
        petName: 'ValidPet',
        petType,
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Device Updates', () => {
    it('should successfully update own device', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { petName: 'OldName', petType: 'cat' })
      authState.userId = userId

      const request = createUpdateRequest({
        deviceId,
        petName: 'NewName',
        petType: 'dog',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.device.pet_name).toBe('NewName')
      expect(data.device.pet_type).toBe('dog')
      expect(data.message).toBe('Pet settings updated successfully')

      // Verify in database
      const serviceClient = getServiceClient()
      const { data: device } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single()

      expect(device?.pet_name).toBe('NewName')
      expect(device?.pet_type).toBe('dog')
    })

    it('should trim whitespace from pet name', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId)
      authState.userId = userId

      const request = createUpdateRequest({
        deviceId,
        petName: '  Fluffy  ',
        petType: 'cat',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.device.pet_name).toBe('Fluffy')
    })

    it('should not update another users device', async () => {
      const { id: userId1 } = await seedUser()
      const { id: userId2 } = await seedUser()
      const { id: deviceId } = await seedDevice(userId2, { petName: 'OtherPet', petType: 'cat' })
      authState.userId = userId1 // Logged in as user1

      const request = createUpdateRequest({
        deviceId, // user2's device
        petName: 'HackedName',
        petType: 'dog',
      })
      const response = await POST(request)

      // Route returns 500 when .single() fails (no rows returned)
      // This is actually a bug in the route - it should return 404
      expect(response.status).toBe(500)

      // Verify original device unchanged
      const serviceClient = getServiceClient()
      const { data: device } = await serviceClient
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single()

      expect(device?.pet_name).toBe('OtherPet')
      expect(device?.pet_type).toBe('cat')
    })

    it('should return error for non-existent device', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const fakeDeviceId = crypto.randomUUID()
      const request = createUpdateRequest({
        deviceId: fakeDeviceId,
        petName: 'Name',
        petType: 'cat',
      })
      const response = await POST(request)

      // Route returns 500 when .single() fails (no rows returned)
      expect(response.status).toBe(500)
    })

    it('should update updated_at timestamp', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId)
      authState.userId = userId

      // Get original timestamp
      const serviceClient = getServiceClient()
      const { data: before } = await serviceClient
        .from('devices')
        .select('updated_at')
        .eq('id', deviceId)
        .single()

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 50))

      const request = createUpdateRequest({
        deviceId,
        petName: 'Updated',
        petType: 'cat',
      })
      await POST(request)

      const { data: after } = await serviceClient
        .from('devices')
        .select('updated_at')
        .eq('id', deviceId)
        .single()

      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(before!.updated_at).getTime()
      )
    })
  })
})
