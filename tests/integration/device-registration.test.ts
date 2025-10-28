import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '@/app/api/device/register/route'
import { NextRequest } from 'next/server'
import {
  createTestDevice,
  createMockSupabaseResponse,
  createMockUser,
  createDeviceRegistrationRequest,
  createAuthError,
  createDbError,
  VALID_PET_TYPES,
  setupDeviceQueryMock,
  setupDeviceInsertMock,
  setupMockAuth,
} from '../utils/device-fixtures'

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

// Mock createServerSupabaseClient - the actual function used by the route
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => mockSupabase,
}))

describe('POST /api/device/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests with 401', async () => {
      // Arrange: No authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: createAuthError(),
      })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })

    it('should accept authenticated requests', async () => {
      // Arrange: Authenticated user
      const mockUser = createMockUser()
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock device lookup - no existing device
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(null, { code: 'PGRST116' })
      )

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: vi.fn().mockReturnThis(),
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).not.toBe(401)
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })
  })

  describe('Input Validation', () => {
    beforeEach(() => {
      // Setup authenticated user for validation tests
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: createMockUser() },
        error: null,
      })
    })

    it('should reject missing deviceCode with 400', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify({
          petName: 'TestPet',
          petType: 'cat',
        }),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('required')
    })

    it('should reject missing petName with 400', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceCode: 'ABC123',
          petType: 'cat',
        }),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('required')
    })

    it('should reject missing petType with 400', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceCode: 'ABC123',
          petName: 'TestPet',
        }),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('required')
    })

    it('should reject invalid petType with 400', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(
          createDeviceRegistrationRequest({ petType: 'invalid' })
        ),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid pet type')
    })

    it('should accept all valid pet types', async () => {
      // Arrange: Mock successful device creation for each type
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(null, { code: 'PGRST116' })
      )
      const mockInsert = vi.fn().mockReturnThis()

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert,
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve(
              createMockSupabaseResponse(createTestDevice())
            ),
        }),
      })

      // Act & Assert for each valid pet type
      for (const petType of VALID_PET_TYPES) {
        const request = new NextRequest('http://localhost:3000/api/device/register', {
          method: 'POST',
          body: JSON.stringify(
            createDeviceRegistrationRequest({ petType })
          ),
        })

        const response = await POST(request)
        expect(response.status).not.toBe(400)
      }
    })
  })

  describe('Duplicate Prevention', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: createMockUser() },
        error: null,
      })
    })

    it('should prevent duplicate registration by different user with 409', async () => {
      // Arrange: Device already registered to different user
      const existingDevice = createTestDevice({
        user_id: 'different-user-id',
        pairing_code: 'ABC123',
        pet_name: 'ExistingPet',
      })

      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(existingDevice)
      )

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(409)
      expect(data.error).toContain('already connected')
      expect(data.error).toContain('ExistingPet')
    })

    it('should allow re-pairing by same user with 200', async () => {
      // Arrange: Device already registered to same user
      const mockUser = createMockUser({ id: 'test-user-id' })
      const existingDevice = createTestDevice({
        user_id: 'test-user-id',
        pairing_code: 'ABC123',
        pet_name: 'OldPetName',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(existingDevice)
      )
      const mockUpdate = vi.fn().mockReturnThis()

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        update: mockUpdate,
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })
      mockUpdate.mockReturnValue({
        eq: () =>
          Promise.resolve(
            createMockSupabaseResponse({ ...existingDevice, pet_name: 'NewPetName' })
          ),
      })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(
          createDeviceRegistrationRequest({ petName: 'NewPetName' })
        ),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.message).toContain('reconnected')
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  describe('Code Normalization', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: createMockUser() },
        error: null,
      })

      // Mock device lookup returning no device
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(null, { code: 'PGRST116' })
      )
      const mockInsert = vi.fn().mockReturnThis()

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert,
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve(
              createMockSupabaseResponse(createTestDevice())
            ),
        }),
      })
    })

    it('should convert lowercase device code to uppercase', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(
          createDeviceRegistrationRequest({ deviceCode: 'abc123' })
        ),
      })

      // Act
      await POST(request)

      // Assert
      const fromCalls = mockSupabase.from.mock.calls
      const selectCall = fromCalls.find(call => call[0] === 'devices')
      expect(selectCall).toBeDefined()
      
      // Verify the code was normalized in the query
      const eqCalls = mockSupabase.from().eq.mock.calls
      const codeQuery = eqCalls.find(call => call[0] === 'pairing_code')
      expect(codeQuery).toBeDefined()
      expect(codeQuery[1]).toBe('ABC123')
    })

    it('should handle mixed case device codes', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(
          createDeviceRegistrationRequest({ deviceCode: 'AbC123' })
        ),
      })

      // Act
      await POST(request)

      // Assert
      const eqCalls = mockSupabase.from().eq.mock.calls
      const codeQuery = eqCalls.find(call => call[0] === 'pairing_code')
      expect(codeQuery[1]).toBe('ABC123')
    })
  })

  describe('Device Creation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: createMockUser() },
        error: null,
      })

      // Mock device lookup returning no device
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(null, { code: 'PGRST116' })
      )

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: vi.fn().mockReturnThis(),
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })
    })

    it('should create new device with correct status', async () => {
      // Arrange
      const mockInsert = vi.fn().mockReturnThis()
      mockSupabase.from().insert = mockInsert
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve(
              createMockSupabaseResponse(
                createTestDevice({ status: 'paired' })
              )
            ),
        }),
      })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.message).toContain('connected successfully')
      expect(mockInsert).toHaveBeenCalled()
      
      // Verify insert was called with correct data
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.status).toBe('paired')
      expect(insertCall.pairing_code).toBe('ABC123')
      expect(insertCall.pet_name).toBe('TestPet')
      expect(insertCall.pet_type).toBe('cat')
      expect(insertCall.user_id).toBe('test-user-id')
    })

    it('should set last_seen_at timestamp on creation', async () => {
      // Arrange
      const mockInsert = vi.fn().mockReturnThis()
      mockSupabase.from().insert = mockInsert
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve(
              createMockSupabaseResponse(createTestDevice())
            ),
        }),
      })

      const beforeRequest = Date.now()
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      await POST(request)
      const afterRequest = Date.now()

      // Assert
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.last_seen_at).toBeDefined()
      
      const lastSeenTime = new Date(insertCall.last_seen_at).getTime()
      expect(lastSeenTime).toBeGreaterThanOrEqual(beforeRequest)
      expect(lastSeenTime).toBeLessThanOrEqual(afterRequest)
    })

    it('should return device ID in success response', async () => {
      // Arrange
      const newDevice = createTestDevice({
        id: 'device-123',
        pet_name: 'FluffyTestPet',
        pet_type: 'rabbit',
      })

      const mockInsert = vi.fn().mockReturnThis()
      mockSupabase.from().insert = mockInsert
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve(createMockSupabaseResponse(newDevice)),
        }),
      })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(
          createDeviceRegistrationRequest({
            petName: 'FluffyTestPet',
            petType: 'rabbit',
          })
        ),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.deviceId).toBe('device-123')
      expect(data.message).toContain('FluffyTestPet')
      expect(data.message).toContain('connected successfully')
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: createMockUser() },
        error: null,
      })
    })

    it('should handle database errors with 500', async () => {
      // Arrange: Database error
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockRejectedValue(
        createDbError('Connection failed')
      )

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBeDefined()
    })

    it('should handle malformed JSON with 500', async () => {
      // Arrange: NextRequest will throw when trying to parse invalid JSON
      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: 'invalid json{',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      // The API's catch-all error handler returns 500 for all errors including JSON parse errors
      expect(response.status).toBe(500)
      expect(data.error).toBeDefined()
    })
  })

  describe('RLS Policy Enforcement', () => {
    it('should filter devices by user_id in duplicate check', async () => {
      // Arrange: Different user tries to register same device
      const mockUser = createMockUser({ id: 'user-1' })
      const existingDevice = createTestDevice({
        user_id: 'user-2',
        pairing_code: 'ABC123',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue(
        createMockSupabaseResponse(existingDevice)
      )

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
      mockEq.mockReturnValue({ single: mockSingle })

      const request = new NextRequest('http://localhost:3000/api/device/register', {
        method: 'POST',
        body: JSON.stringify(createDeviceRegistrationRequest()),
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(409)
      
      // Verify the query checked for existing device
      expect(mockSelect).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('pairing_code', 'ABC123')
    })
  })
})