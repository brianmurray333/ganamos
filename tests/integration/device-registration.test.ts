import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/device/register/route'
import {
  createMockUser,
  createMockDevice,
  createMockRequestBody,
  createMockRequest,
  mockAuthSuccess,
  mockAuthFailure,
  mockDeviceNotFound,
  mockDeviceFound,
  mockDeviceUpdateSuccess,
  mockDeviceInsertSuccess,
  mockDatabaseError,
  expectAuthChecked,
  expectSuccessResponse,
  expectErrorResponse,
  VALID_PET_TYPES,
} from '../utils/device-fixtures'

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

  describe('Authentication', () => {
    it('should reject unauthenticated requests with 401', async () => {
      mockAuthFailure(mockSupabaseClient)
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      expectAuthChecked(mockSupabaseClient)
      await expectErrorResponse(response, 401, 'Unauthorized')
    })

    it('should allow authenticated requests to proceed', async () => {
      mockAuthSuccess(mockSupabaseClient)
      mockDeviceNotFound(mockSupabaseClient)
      mockDeviceInsertSuccess(mockSupabaseClient)
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      expectAuthChecked(mockSupabaseClient)
      expect(response.status).toBe(200)
    })
  })

  describe('Input Validation', () => {
    it('should reject request with missing deviceCode', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const request = createMockRequest({
        petName: 'Fluffy',
        petType: 'cat',
      })

      const response = await POST(request)

      await expectErrorResponse(response, 400, 'Missing required fields')
    })

    it('should reject request with missing petName', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petType: 'cat',
      })

      const response = await POST(request)

      await expectErrorResponse(response, 400, 'Missing required fields')
    })

    it('should reject request with missing petType', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'Fluffy',
      })

      const response = await POST(request)

      await expectErrorResponse(response, 400, 'Missing required fields')
    })

    it('should reject request with invalid pet type', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'Fluffy',
        petType: 'dragon', // Invalid pet type
      })

      const response = await POST(request)

      await expectErrorResponse(response, 400, 'Invalid pet type')
    })

    it('should accept all valid pet types', async () => {
      mockAuthSuccess(mockSupabaseClient)
      
      for (const petType of VALID_PET_TYPES) {
        vi.clearAllMocks()
        mockAuthSuccess(mockSupabaseClient)
        mockDeviceNotFound(mockSupabaseClient)
        mockDeviceInsertSuccess(mockSupabaseClient)
        
        const request = createMockRequest({
          deviceCode: 'ABC123',
          petName: 'TestPet',
          petType,
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
      }
    })
  })

  describe('Device Code Normalization', () => {
    it('should convert device code to uppercase', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const mockQueryBuilder = mockDeviceNotFound(mockSupabaseClient)
      mockDeviceInsertSuccess(mockSupabaseClient)
      
      const request = createMockRequest({
        deviceCode: 'abc123', // lowercase
        petName: 'Fluffy',
        petType: 'cat',
      })

      await POST(request)

      // Verify the query used uppercase code
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('pairing_code', 'ABC123')
    })

    it('should handle mixed case device codes', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const mockQueryBuilder = mockDeviceNotFound(mockSupabaseClient)
      mockDeviceInsertSuccess(mockSupabaseClient)
      
      const request = createMockRequest({
        deviceCode: 'AbC123', // mixed case
        petName: 'Fluffy',
        petType: 'cat',
      })

      await POST(request)

      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('pairing_code', 'ABC123')
    })
  })

  describe('Duplicate Device Prevention', () => {
    it('should prevent registering device already connected to different user', async () => {
      const currentUser = createMockUser({ id: 'user-1' })
      const existingDevice = createMockDevice({ 
        user_id: 'user-2', // Different user
        pairing_code: 'ABC123',
        pet_name: 'ExistingPet',
      })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceFound(mockSupabaseClient, existingDevice)
      
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'NewPet',
        petType: 'dog',
      })

      const response = await POST(request)

      const data = await expectErrorResponse(response, 409, 'already connected to another user')
      expect(data.error).toContain('ExistingPet') // Should mention existing pet name
    })

    it('should provide helpful error message for duplicate device', async () => {
      const currentUser = createMockUser({ id: 'user-1' })
      const existingDevice = createMockDevice({ 
        user_id: 'user-2',
        pet_name: 'Buddy',
      })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceFound(mockSupabaseClient, existingDevice)
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)
      const data = await response.json()

      expect(data.error).toContain('Buddy')
      expect(data.error).toContain('Each pet can only be connected to one account')
    })
  })

  describe('Re-pairing Flow (Same User)', () => {
    it('should allow re-pairing device by same user', async () => {
      const currentUser = createMockUser({ id: 'user-123' })
      const existingDevice = createMockDevice({ 
        id: 'device-456',
        user_id: 'user-123', // Same user
        pairing_code: 'ABC123',
        pet_name: 'OldName',
        pet_type: 'cat',
      })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceFound(mockSupabaseClient, existingDevice)
      mockDeviceUpdateSuccess(mockSupabaseClient)
      
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'NewName',
        petType: 'dog',
      })

      const response = await POST(request)

      const data = await expectSuccessResponse(response, 'reconnected')
      expect(data.deviceId).toBe('device-456')
      expect(data.message).toContain('NewName')
    })

    it('should update device metadata during re-pairing', async () => {
      const currentUser = createMockUser({ id: 'user-123' })
      const existingDevice = createMockDevice({ user_id: 'user-123' })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceFound(mockSupabaseClient, existingDevice)
      
      const mockUpdateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseClient.from.mockReturnValue(mockUpdateBuilder)
      
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'UpdatedName',
        petType: 'rabbit',
      })

      await POST(request)

      // Verify update was called with new data
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: 'UpdatedName',
          pet_type: 'rabbit',
          status: 'paired',
        })
      )
      expect(mockUpdateBuilder.eq).toHaveBeenCalledWith('id', existingDevice.id)
    })

    it('should update last_seen_at timestamp during re-pairing', async () => {
      const currentUser = createMockUser({ id: 'user-123' })
      const existingDevice = createMockDevice({ user_id: 'user-123' })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceFound(mockSupabaseClient, existingDevice)
      
      const mockUpdateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseClient.from.mockReturnValue(mockUpdateBuilder)
      
      const request = createMockRequest(createMockRequestBody())

      await POST(request)

      const updateCall = mockUpdateBuilder.update.mock.calls[0][0]
      expect(updateCall).toHaveProperty('last_seen_at')
      expect(new Date(updateCall.last_seen_at).getTime()).toBeGreaterThan(Date.now() - 5000) // Within 5 seconds
    })
  })

  describe('New Device Creation', () => {
    it('should create new device with valid data', async () => {
      const currentUser = createMockUser({ id: 'user-123' })
      const newDevice = createMockDevice({
        id: 'new-device-789',
        user_id: 'user-123',
        pairing_code: 'ABC123',
        pet_name: 'Fluffy',
        pet_type: 'cat',
      })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceNotFound(mockSupabaseClient)
      
      const mockInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: newDevice, error: null }),
      }
      mockSupabaseClient.from.mockReturnValue(mockInsertBuilder)
      
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'Fluffy',
        petType: 'cat',
      })

      const response = await POST(request)

      const data = await expectSuccessResponse(response, 'connected successfully')
      expect(data.deviceId).toBe('new-device-789')
      expect(data.message).toContain('Fluffy')
    })

    it('should set correct device properties on creation', async () => {
      const currentUser = createMockUser({ id: 'user-123' })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceNotFound(mockSupabaseClient)
      
      const mockInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: createMockDevice(), 
          error: null 
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockInsertBuilder)
      
      const request = createMockRequest({
        deviceCode: 'XYZ789',
        petName: 'Buddy',
        petType: 'dog',
      })

      await POST(request)

      expect(mockInsertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          pairing_code: 'XYZ789',
          pet_name: 'Buddy',
          pet_type: 'dog',
          status: 'paired',
        })
      )
    })

    it('should set initial last_seen_at timestamp on creation', async () => {
      const currentUser = createMockUser({ id: 'user-123' })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceNotFound(mockSupabaseClient)
      
      const mockInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: createMockDevice(), 
          error: null 
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockInsertBuilder)
      
      const request = createMockRequest(createMockRequestBody())

      await POST(request)

      const insertCall = mockInsertBuilder.insert.mock.calls[0][0]
      expect(insertCall).toHaveProperty('last_seen_at')
      expect(new Date(insertCall.last_seen_at).getTime()).toBeGreaterThan(Date.now() - 5000)
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors during device lookup', async () => {
      mockAuthSuccess(mockSupabaseClient)
      mockDatabaseError(mockSupabaseClient, 'Connection timeout')
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      await expectErrorResponse(response, 500, 'Database error')
    })

    it('should handle errors during device update', async () => {
      const currentUser = createMockUser({ id: 'user-123' })
      const existingDevice = createMockDevice({ user_id: 'user-123' })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceFound(mockSupabaseClient, existingDevice)
      
      const mockUpdateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Update failed' } 
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockUpdateBuilder)
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      await expectErrorResponse(response, 500, 'Failed to update device')
    })

    it('should handle errors during device creation', async () => {
      mockAuthSuccess(mockSupabaseClient)
      mockDeviceNotFound(mockSupabaseClient)
      
      const mockInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Insert failed' } 
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockInsertBuilder)
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      await expectErrorResponse(response, 500, 'Failed to register device')
    })

    it('should handle PGRST116 error code as device not found', async () => {
      mockAuthSuccess(mockSupabaseClient)
      
      // PGRST116 = PostgreSQL "no rows found" error - should be treated as not found
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows found' },
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
      
      const mockInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: createMockDevice(), 
          error: null 
        }),
      }
      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder).mockReturnValueOnce(mockInsertBuilder)
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      // Should proceed to create new device, not return database error
      expect(response.status).toBe(200)
    })

    it('should handle unexpected errors gracefully', async () => {
      mockAuthSuccess(mockSupabaseClient)
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected error')
      })
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)

      await expectErrorResponse(response, 500, 'Internal server error')
    })
  })

  describe('Response Structure Validation', () => {
    it('should return success response with correct structure', async () => {
      mockAuthSuccess(mockSupabaseClient)
      mockDeviceNotFound(mockSupabaseClient)
      mockDeviceInsertSuccess(mockSupabaseClient)
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('message')
      expect(data).toHaveProperty('deviceId')
      expect(typeof data.message).toBe('string')
      expect(typeof data.deviceId).toBe('string')
    })

    it('should return error response with correct structure', async () => {
      mockAuthFailure(mockSupabaseClient)
      
      const request = createMockRequest(createMockRequestBody())

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(typeof data.error).toBe('string')
    })

    it('should include pet name in success message', async () => {
      mockAuthSuccess(mockSupabaseClient)
      mockDeviceNotFound(mockSupabaseClient)
      mockDeviceInsertSuccess(mockSupabaseClient)
      
      const request = createMockRequest({
        deviceCode: 'ABC123',
        petName: 'SpecialPetName',
        petType: 'cat',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.message).toContain('SpecialPetName')
    })
  })

  describe('Database Query Patterns', () => {
    it('should query devices table with correct pairing code', async () => {
      mockAuthSuccess(mockSupabaseClient)
      const mockQueryBuilder = mockDeviceNotFound(mockSupabaseClient)
      mockDeviceInsertSuccess(mockSupabaseClient)
      
      const request = createMockRequest({
        deviceCode: 'XYZ789',
        petName: 'TestPet',
        petType: 'cat',
      })

      await POST(request)

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
      expect(mockQueryBuilder.select).toHaveBeenCalledWith('id, user_id, pet_name')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('pairing_code', 'XYZ789')
      expect(mockQueryBuilder.single).toHaveBeenCalled()
    })

    it('should insert device record with all required fields', async () => {
      const currentUser = createMockUser({ id: 'user-xyz' })

      mockAuthSuccess(mockSupabaseClient, currentUser)
      mockDeviceNotFound(mockSupabaseClient)
      
      const mockInsertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: createMockDevice(), 
          error: null 
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockInsertBuilder)
      
      const request = createMockRequest(createMockRequestBody())

      await POST(request)

      const insertedData = mockInsertBuilder.insert.mock.calls[0][0]
      expect(insertedData).toHaveProperty('user_id', 'user-xyz')
      expect(insertedData).toHaveProperty('pairing_code')
      expect(insertedData).toHaveProperty('pet_name')
      expect(insertedData).toHaveProperty('pet_type')
      expect(insertedData).toHaveProperty('status', 'paired')
      expect(insertedData).toHaveProperty('last_seen_at')
    })
  })
})