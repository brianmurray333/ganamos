import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/device/register/route'
import { NextRequest } from 'next/server'
import {
  createMockUser,
  createMockDevice,
  createValidRequestBody,
  createInvalidRequestBody,
  VALID_PET_TYPES,
  mockAuthSuccess,
  mockAuthFailure,
  mockAuthNoUser,
  mockDeviceQueryNotFound,
  mockDeviceQueryError,
  mockDeviceInsertError,
  mockNewDeviceRegistrationFlow,
  mockRePairingFlow,
  mockDuplicateDeviceConflict,
  expectAuthGetUserCalled,
  expectDeviceQueryCalled,
  expectDeviceInsertCalled,
  expectDeviceUpdateCalled,
} from './helpers/device-registration-mocks'

// Mock the Supabase client factory
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

describe('Device Registration API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication Layer', () => {
    it('should return 401 when user is not authenticated (auth error)', async () => {
      mockAuthFailure(mockSupabaseClient, 'Invalid token')
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
      expectAuthGetUserCalled(mockSupabaseClient)
    })

    it('should return 401 when no user is present in session', async () => {
      mockAuthNoUser(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Input Validation Layer', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should return 400 when deviceCode is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createInvalidRequestBody.missingDeviceCode),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('should return 400 when petName is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createInvalidRequestBody.missingPetName),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('should return 400 when petType is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createInvalidRequestBody.missingPetType),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('should return 400 when petType is not in allowed list', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createInvalidRequestBody.invalidPetType),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid pet type')
    })

    it('should accept all valid pet types from whitelist', async () => {
      for (const petType of VALID_PET_TYPES) {
        vi.clearAllMocks()
        mockAuthSuccess(mockSupabaseClient)
        mockNewDeviceRegistrationFlow(mockSupabaseClient)

        const request = new NextRequest('http://localhost:3000/api/device/register', {
          method: 'POST',
          body: JSON.stringify(createValidRequestBody({ petType })),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
      }
    })
  })

  describe('Business Logic Layer - Duplicate Prevention', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should return 409 when device is already connected to different user', async () => {
      const { existingDevice } = mockDuplicateDeviceConflict(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.success).toBe(false)
      expect(data.error).toContain('already connected to another user')
      expect(data.error).toContain(existingDevice.pet_name)
      expectDeviceQueryCalled(mockSupabaseClient, 'ABC123')
    })

    it('should return 500 when database check fails with non-404 error', async () => {
      mockDeviceQueryError(mockSupabaseClient, 'Connection timeout')
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Database error')
    })
  })

  describe('Business Logic Layer - Re-Pairing Flow', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should update existing device when same user re-pairs', async () => {
      const existingDevice = createMockDevice({
        user_id: 'test-user-id-123',
        pet_name: 'OldName',
        pet_type: 'dog',
      })
      
      mockRePairingFlow(mockSupabaseClient, existingDevice)
      
      const newRequestBody = createValidRequestBody({
        petName: 'NewName',
        petType: 'cat',
      })
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(newRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('reconnected')
      expect(data.message).toContain('NewName')
      expect(data.deviceId).toBe(existingDevice.id)
      
      expectDeviceUpdateCalled(mockSupabaseClient, {
        pet_name: 'NewName',
        pet_type: 'cat',
        status: 'paired',
      })
    })

    it('should update last_seen_at timestamp when re-pairing', async () => {
      const existingDevice = createMockDevice({
        user_id: 'test-user-id-123',
      })
      
      mockRePairingFlow(mockSupabaseClient, existingDevice)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      await response.json()

      const queryBuilder = mockSupabaseClient.from.mock.results[1].value
      const updateCall = queryBuilder.update.mock.calls[0][0]
      
      expect(updateCall.last_seen_at).toBeDefined()
      expect(new Date(updateCall.last_seen_at).getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('should return 500 when update fails during re-pairing', async () => {
      const existingDevice = createMockDevice({
        user_id: 'test-user-id-123',
      })
      
      const checkQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: existingDevice,
          error: null,
        }),
      }
      
      const updateQueryBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Update constraint violation' },
        }),
      }
      
      mockSupabaseClient.from
        .mockReturnValueOnce(checkQueryBuilder)
        .mockReturnValueOnce(updateQueryBuilder)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to update device')
    })
  })

  describe('Database Layer - New Device Creation', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should successfully create new device with valid data', async () => {
      const mockUser = createMockUser()
      mockAuthSuccess(mockSupabaseClient, mockUser)
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const requestBody = createValidRequestBody({
        deviceCode: 'XYZ789',
        petName: 'Buddy',
        petType: 'dog',
      })
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('connected successfully')
      expect(data.message).toContain('Buddy')
      expect(data.deviceId).toBeDefined()
      
      expectDeviceInsertCalled(mockSupabaseClient, {
        user_id: mockUser.id,
        pairing_code: 'XYZ789',
        pet_name: 'Buddy',
        pet_type: 'dog',
        status: 'paired',
      })
    })

    it('should normalize device code to uppercase', async () => {
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const requestBody = createValidRequestBody({
        deviceCode: 'abc123', // lowercase
      })
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })

      await POST(request)

      // Check that the query used uppercase
      expectDeviceQueryCalled(mockSupabaseClient, 'ABC123')
      
      // Check that insert used uppercase
      const insertQueryBuilder = mockSupabaseClient.from.mock.results[1].value
      const insertCall = insertQueryBuilder.insert.mock.calls[0][0]
      expect(insertCall.pairing_code).toBe('ABC123')
    })

    it('should set last_seen_at timestamp on device creation', async () => {
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      await POST(request)

      const insertQueryBuilder = mockSupabaseClient.from.mock.results[1].value
      const insertCall = insertQueryBuilder.insert.mock.calls[0][0]
      
      expect(insertCall.last_seen_at).toBeDefined()
      expect(new Date(insertCall.last_seen_at).getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('should return 500 when device creation fails', async () => {
      const checkQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      }
      
      mockSupabaseClient.from
        .mockReturnValueOnce(checkQueryBuilder)
        .mockReturnValueOnce(mockDeviceInsertError(mockSupabaseClient, 'Unique constraint violation'))
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to register device')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should handle malformed JSON request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: 'invalid json{',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Internal server error')
    })

    it('should handle empty string values as missing fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceCode: '',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('should handle null values as missing fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceCode: null,
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('should handle whitespace-only deviceCode', async () => {
      mockDeviceQueryNotFound(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceCode: '   ',
          petName: 'Fluffy',
          petType: 'cat',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      // NOTE: Current implementation doesn't trim whitespace, so '   ' passes the !deviceCode check
      // and gets uppercased to '   ', then tries to find a device with that code (not found)
      // TODO: Application should trim input and validate - fix in separate PR
      expect(response.status).toBe(500) // Fails at database level or insert
    })
  })

  describe('Data Consistency and Validation', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should preserve user_id relationship in device creation', async () => {
      const mockUser = createMockUser({ id: 'specific-user-id-999' })
      mockAuthSuccess(mockSupabaseClient, mockUser)
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      await POST(request)

      expectDeviceInsertCalled(mockSupabaseClient, {
        user_id: 'specific-user-id-999',
      })
    })

    it('should verify status is set to paired on creation', async () => {
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      await POST(request)

      const insertQueryBuilder = mockSupabaseClient.from.mock.results[1].value
      const insertCall = insertQueryBuilder.insert.mock.calls[0][0]
      
      expect(insertCall.status).toBe('paired')
    })

    it('should verify all required fields are included in insert', async () => {
      const mockUser = createMockUser()
      mockAuthSuccess(mockSupabaseClient, mockUser)
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      await POST(request)

      const insertQueryBuilder = mockSupabaseClient.from.mock.results[1].value
      const insertCall = insertQueryBuilder.insert.mock.calls[0][0]
      
      // Verify all required fields
      expect(insertCall).toHaveProperty('user_id')
      expect(insertCall).toHaveProperty('pairing_code')
      expect(insertCall).toHaveProperty('pet_name')
      expect(insertCall).toHaveProperty('pet_type')
      expect(insertCall).toHaveProperty('status')
      expect(insertCall).toHaveProperty('last_seen_at')
    })

    it('should return device ID in successful response', async () => {
      const mockDevice = createMockDevice({ id: 'device-uuid-12345' })
      
      const checkQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      }
      
      const insertQueryBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockDevice,
          error: null,
        }),
      }
      
      mockSupabaseClient.from
        .mockReturnValueOnce(checkQueryBuilder)
        .mockReturnValueOnce(insertQueryBuilder)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.deviceId).toBe('device-uuid-12345')
    })
  })

  describe('Response Message Validation', () => {
    beforeEach(() => {
      mockAuthSuccess(mockSupabaseClient)
    })

    it('should include pet name in success message for new device', async () => {
      mockNewDeviceRegistrationFlow(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody({ petName: 'Mittens' })),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.message).toContain('Mittens')
      expect(data.message).toContain('connected successfully')
    })

    it('should include pet name in success message for re-pairing', async () => {
      const existingDevice = createMockDevice({ user_id: 'test-user-id-123' })
      mockRePairingFlow(mockSupabaseClient, existingDevice)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody({ petName: 'Whiskers' })),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.message).toContain('Whiskers')
      expect(data.message).toContain('reconnected')
    })

    it('should include existing pet name in conflict error message', async () => {
      const { existingDevice } = mockDuplicateDeviceConflict(mockSupabaseClient)
      
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createValidRequestBody()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.error).toContain(existingDevice.pet_name)
      expect(data.error).toContain('already connected to another user')
    })
  })
})