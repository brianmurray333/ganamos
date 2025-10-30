import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '@/app/api/device/update/route'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import {
  mockAuthenticatedUser,
  mockValidDevice,
  createMockDevice,
  invalidPetType,
} from '../fixtures/devices'

// Mock Supabase auth helpers
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => new Map()),
}))

describe('POST /api/device/update', () => {
  let mockSupabaseClient: any
  let mockRequest: Request

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create mock Supabase client with chainable methods
    mockSupabaseClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => mockSupabaseClient),
      update: vi.fn(() => mockSupabaseClient),
      eq: vi.fn(() => mockSupabaseClient),
      select: vi.fn(() => mockSupabaseClient),
      single: vi.fn(),
    }

    // Mock the Supabase client factory
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
  })

  describe('Authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 401 when authentication error occurs', async () => {
      // Mock authentication error
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Session expired' },
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Input Validation', () => {
    beforeEach(() => {
      // Mock authenticated user for validation tests
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockAuthenticatedUser },
        error: null,
      })
    })

    it('returns 400 when deviceId is missing', async () => {
      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('returns 400 when petName is missing', async () => {
      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('returns 400 when petType is missing', async () => {
      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('returns 400 when petType is invalid', async () => {
      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: invalidPetType,
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid pet type')
    })

    it('accepts all valid pet types', async () => {
      const validPetTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']
      
      for (const petType of validPetTypes) {
        // Mock successful database update
        mockSupabaseClient.single.mockResolvedValue({
          data: createMockDevice({ pet_type: petType as any }),
          error: null,
        })

        mockRequest = new Request('http://localhost:3000/api/device/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: 'device-123',
            petName: 'Fluffy',
            petType: petType,
          }),
        })

        const response = await POST(mockRequest)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.device.pet_type).toBe(petType)
      }
    })
  })

  describe('Input Sanitization', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockAuthenticatedUser },
        error: null,
      })
    })

    it('trims whitespace from pet name', async () => {
      const petNameWithWhitespace = '  Buddy  '
      const expectedTrimmedName = 'Buddy'

      mockSupabaseClient.single.mockResolvedValue({
        data: createMockDevice({ pet_name: expectedTrimmedName }),
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: petNameWithWhitespace,
          petType: 'dog',
        }),
      })

      await POST(mockRequest)

      // Verify update was called with trimmed name
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: expectedTrimmedName,
        })
      )
    })

    it('handles pet names with only whitespace by trimming to empty', async () => {
      const whitespaceOnlyName = '   '

      mockSupabaseClient.single.mockResolvedValue({
        data: createMockDevice({ pet_name: '' }),
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: whitespaceOnlyName,
          petType: 'cat',
        }),
      })

      await POST(mockRequest)

      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: '',
        })
      )
    })
  })

  describe('Ownership Validation', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockAuthenticatedUser },
        error: null,
      })
    })

    it('returns 404 when device is not owned by user', async () => {
      // Mock database returning no device (ownership check failed)
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-456', // Different device
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe("Device not found or you don't have permission")
    })

    it('verifies ownership by checking user_id in query', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: mockValidDevice,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      await POST(mockRequest)

      // Verify ownership validation in query chain
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'device-123')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockAuthenticatedUser.id)
    })

    it('returns 404 when device does not exist', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'non-existent-device',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe("Device not found or you don't have permission")
    })
  })

  describe('Successful Updates', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockAuthenticatedUser },
        error: null,
      })
    })

    it('successfully updates pet name and type for owned device', async () => {
      const updatedDevice = createMockDevice({
        pet_name: 'Max',
        pet_type: 'dog',
        updated_at: new Date().toISOString(),
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedDevice,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Max',
          petType: 'dog',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.device.pet_name).toBe('Max')
      expect(data.device.pet_type).toBe('dog')
      expect(data.message).toBe('Pet settings updated successfully')
    })

    it('updates the updated_at timestamp', async () => {
      const beforeUpdate = new Date('2024-01-01T00:00:00Z')
      const afterUpdate = new Date('2024-01-02T00:00:00Z')

      mockSupabaseClient.single.mockResolvedValue({
        data: createMockDevice({
          updated_at: afterUpdate.toISOString(),
        }),
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      await POST(mockRequest)

      // Verify update was called with updated_at field
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(String),
        })
      )

      // Verify updated_at is an ISO 8601 timestamp
      const updateCall = mockSupabaseClient.update.mock.calls[0][0]
      expect(updateCall.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('returns the updated device data in response', async () => {
      const updatedDevice = createMockDevice({
        pet_name: 'Charlie',
        pet_type: 'rabbit',
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedDevice,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Charlie',
          petType: 'rabbit',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(data.device).toEqual(updatedDevice)
      expect(data.device.id).toBe(mockValidDevice.id)
      expect(data.device.user_id).toBe(mockAuthenticatedUser.id)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockAuthenticatedUser },
        error: null,
      })
    })

    it('returns 500 when database update fails', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed', code: 'DB_ERROR' },
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to update device')
    })

    it('returns 500 when unexpected error occurs', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Unexpected error')
      )

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('Data Consistency', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockAuthenticatedUser },
        error: null,
      })
    })

    it('maintains device ownership after update', async () => {
      const deviceBeforeUpdate = createMockDevice({
        user_id: mockAuthenticatedUser.id,
      })

      const deviceAfterUpdate = createMockDevice({
        pet_name: 'Updated Name',
        user_id: mockAuthenticatedUser.id, // Should remain same
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: deviceAfterUpdate,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: deviceBeforeUpdate.id,
          petName: 'Updated Name',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(data.device.user_id).toBe(mockAuthenticatedUser.id)
      expect(data.device.user_id).toBe(deviceBeforeUpdate.user_id)
    })

    it('does not modify fields outside of pet_name, pet_type, and updated_at', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: mockValidDevice,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'New Name',
          petType: 'dog',
        }),
      })

      await POST(mockRequest)

      // Verify update only includes expected fields
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        pet_name: 'New Name',
        pet_type: 'dog',
        updated_at: expect.any(String),
      })

      // Verify update does NOT include other fields
      const updateCall = mockSupabaseClient.update.mock.calls[0][0]
      expect(updateCall).not.toHaveProperty('pairing_code')
      expect(updateCall).not.toHaveProperty('status')
      expect(updateCall).not.toHaveProperty('last_seen_at')
      expect(updateCall).not.toHaveProperty('created_at')
      expect(updateCall).not.toHaveProperty('user_id')
      expect(updateCall).not.toHaveProperty('id')
    })

    it('preserves device pairing_code after update', async () => {
      const updatedDevice = createMockDevice({
        pet_name: 'New Name',
        pairing_code: mockValidDevice.pairing_code, // Should remain unchanged
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedDevice,
        error: null,
      })

      mockRequest = new Request('http://localhost:3000/api/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'device-123',
          petName: 'New Name',
          petType: 'cat',
        }),
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(data.device.pairing_code).toBe(mockValidDevice.pairing_code)
    })
  })
})