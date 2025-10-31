import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/device/config/route'
import {
  TEST_DEVICES,
  TEST_PROFILES,
  TEST_TRANSACTIONS,
  createMockDevice,
  createMockProfile,
  createMockPriceData,
  createTimestampMinutesAgo,
  createMockSupabaseClient,
  mockDeviceLookupByIdSuccess,
  mockDeviceLookupByCodeSuccess,
  mockDeviceNotFound,
  mockDeviceDisconnected,
  mockProfileLookupSuccess,
  mockProfileNotFound,
  mockLastSeenAtUpdate,
  mockTransactionWithMessage,
  mockTransactionNoMessage,
  mockBitcoinPriceRpcSuccess,
  mockBitcoinPriceRpcFailureWithFallback,
  mockBitcoinPriceStale,
  mockBitcoinPriceNotAvailable,
  setupSuccessfulConfigFlow,
  createRequestWithDeviceId,
  createRequestWithPairingCode,
  createRequestWithNoParams,
  expectDeviceQueried,
  expectProfileQueried,
  expectLastSeenAtUpdated,
  expectTransactionQueried,
  expectBitcoinPriceRpcCalled,
  expectSuccessResponse,
  expectErrorResponse,
} from './helpers/device-config-mocks'

// Mock the Supabase client factory
const mockSupabaseClient = createMockSupabaseClient()

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

describe('GET /api/device/config - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication - deviceId Parameter', () => {
    it('should successfully authenticate with valid deviceId', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response, {
        deviceId: TEST_DEVICES.paired.id,
        petName: TEST_DEVICES.paired.pet_name,
        petType: TEST_DEVICES.paired.pet_type,
      })
      
      expect(data.config.deviceId).toBe(TEST_DEVICES.paired.id)
    })

    it('should query devices table with deviceId and status filter', async () => {
      const mockDeviceQuery = mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request)

      expectDeviceQueried(mockDeviceQuery, 'paired')
      expect(mockDeviceQuery.eq).toHaveBeenCalledWith('id', TEST_DEVICES.paired.id)
    })

    it('should return 404 when device with deviceId not found', async () => {
      mockDeviceNotFound(mockSupabaseClient)
      
      const request = createRequestWithDeviceId('non-existent-device')
      const response = await GET(request)

      await expectErrorResponse(response, 404, 'Device not found or not paired')
    })

    it('should return 404 when device is not in paired status', async () => {
      mockDeviceDisconnected(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.disconnected.id)
      const response = await GET(request)

      await expectErrorResponse(response, 404, 'Device not found or not paired')
    })
  })

  describe('Authentication - pairingCode Parameter', () => {
    it('should successfully authenticate with valid pairingCode', async () => {
      mockDeviceLookupByCodeSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithPairingCode(TEST_DEVICES.paired.pairing_code)
      const response = await GET(request)

      const data = await expectSuccessResponse(response, {
        petName: TEST_DEVICES.paired.pet_name,
      })
      
      expect(data.config.deviceId).toBe(TEST_DEVICES.paired.id)
    })

    it('should query devices table with pairingCode and status filter', async () => {
      const mockDeviceQuery = mockDeviceLookupByCodeSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithPairingCode(TEST_DEVICES.paired.pairing_code)
      await GET(request)

      expectDeviceQueried(mockDeviceQuery, 'paired')
      expect(mockDeviceQuery.eq).toHaveBeenCalledWith('pairing_code', TEST_DEVICES.paired.pairing_code)
    })

    it('should return 404 when device with pairingCode not found', async () => {
      mockDeviceNotFound(mockSupabaseClient)
      
      const request = createRequestWithPairingCode('INVALID-CODE')
      const response = await GET(request)

      await expectErrorResponse(response, 404, 'Device not found or not paired')
    })

    it('should prioritize deviceId over pairingCode when both provided', async () => {
      const mockDeviceQuery = mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${TEST_DEVICES.paired.id}&pairingCode=${TEST_DEVICES.paired.pairing_code}`
      )
      await GET(request as any)

      // Should query by deviceId, not pairingCode
      expect(mockDeviceQuery.eq).toHaveBeenCalledWith('id', TEST_DEVICES.paired.id)
      expect(mockDeviceQuery.eq).not.toHaveBeenCalledWith('pairing_code', expect.any(String))
    })
  })

  describe('Authentication - Missing Parameters', () => {
    it('should return 400 when neither deviceId nor pairingCode provided', async () => {
      const request = createRequestWithNoParams()
      const response = await GET(request)

      await expectErrorResponse(response, 400, 'Device ID or pairing code required')
    })

    it('should not query database when authentication parameters missing', async () => {
      const request = createRequestWithNoParams()
      await GET(request)

      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })
  })

  describe('Profile Integration', () => {
    it('should retrieve user profile associated with device', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      const mockProfileQuery = mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request)

      expectProfileQueried(mockProfileQuery, TEST_DEVICES.paired.user_id)
    })

    it('should return profile data in config response', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response, {
        userId: TEST_PROFILES.primary.id,
        userName: TEST_PROFILES.primary.name,
        balance: TEST_PROFILES.primary.balance,
      })
      
      expect(data.config.userName).toBe(TEST_PROFILES.primary.name)
      expect(data.config.balance).toBe(TEST_PROFILES.primary.balance)
    })

    it('should use "User" as default when profile name is null', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient, TEST_PROFILES.withoutName)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.userName).toBe('User')
    })

    it('should return 404 when profile not found', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileNotFound(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      await expectErrorResponse(response, 404, 'User profile not found')
    })

    it('should use default balance of 0 when profile balance is null', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient, createMockProfile({ balance: null as any }))
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.balance).toBe(0)
    })
  })

  describe('Activity Tracking - last_seen_at Updates', () => {
    it('should update last_seen_at timestamp on config fetch', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      const mockUpdate = mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request)

      expectLastSeenAtUpdated(mockUpdate, TEST_DEVICES.paired.id)
    })

    it('should update last_seen_at with current timestamp', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      const mockUpdate = mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const beforeRequest = Date.now()
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request)
      const afterRequest = Date.now()

      const updateCall = mockUpdate.update.mock.calls[0][0]
      const updatedTimestamp = new Date(updateCall.last_seen_at).getTime()
      
      expect(updatedTimestamp).toBeGreaterThanOrEqual(beforeRequest - 1000)
      expect(updatedTimestamp).toBeLessThanOrEqual(afterRequest + 1000)
    })

    it('should update last_seen_at regardless of authentication method', async () => {
      // Test with deviceId
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      const mockUpdate1 = mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request1 = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request1)
      
      expect(mockUpdate1.update).toHaveBeenCalled()
      
      vi.clearAllMocks()
      
      // Test with pairingCode
      mockDeviceLookupByCodeSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      const mockUpdate2 = mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request2 = createRequestWithPairingCode(TEST_DEVICES.paired.pairing_code)
      await GET(request2)
      
      expect(mockUpdate2.update).toHaveBeenCalled()
    })
  })

  describe('Transaction Message Retrieval', () => {
    it('should retrieve last transaction message for user', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      const mockTxQuery = mockTransactionWithMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request)

      expectTransactionQueried(mockTxQuery, TEST_DEVICES.paired.user_id)
    })

    it('should include transaction message in response', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient, {
        transaction: TEST_TRANSACTIONS.withMessage,
      })
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response, {
        lastMessage: TEST_TRANSACTIONS.withMessage.message,
      })
      
      expect(data.config.lastMessage).toBe(TEST_TRANSACTIONS.withMessage.message)
    })

    it('should return empty string when no transactions found', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient, {
        transaction: null,
      })
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.lastMessage).toBe('')
    })

    it('should return empty string when transaction has null message', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient, {
        transaction: TEST_TRANSACTIONS.noMessage,
      })
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.lastMessage).toBe('')
    })

    it('should handle transaction query errors gracefully', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      
      // Mock transaction query to throw error
      const mockTxQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error('Database error')),
      }
      mockSupabaseClient.from.mockReturnValueOnce(mockTxQuery)
      
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      // Should still succeed with empty message
      const data = await expectSuccessResponse(response)
      expect(data.config.lastMessage).toBe('')
    })
  })

  describe('Bitcoin Price Integration', () => {
    it('should retrieve bitcoin price via RPC call', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceRpcSuccess(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      await GET(request)

      expectBitcoinPriceRpcCalled(mockSupabaseClient)
    })

    it('should include bitcoin price in response', async () => {
      const priceData = createMockPriceData({ price: '45000.50' })
      setupSuccessfulConfigFlow(mockSupabaseClient, { priceData })
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.btcPrice).toBe(45000.50)
    })

    it('should use fallback query when RPC fails', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      
      const mockFallback = mockBitcoinPriceRpcFailureWithFallback(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      // RPC should have been tried
      expectBitcoinPriceRpcCalled(mockSupabaseClient)
      
      // Fallback query should have been executed
      expect(mockFallback.select).toHaveBeenCalledWith('price')
      expect(mockFallback.eq).toHaveBeenCalledWith('currency', 'USD')
      expect(mockFallback.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockFallback.limit).toHaveBeenCalledWith(1)
      
      // Should still return success
      await expectSuccessResponse(response)
    })

    it('should handle stale bitcoin price data', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceStale(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      // Should still return price even if stale
      const data = await expectSuccessResponse(response)
      expect(data.config.btcPrice).toBeTypeOf('number')
    })

    it('should return null btcPrice when no price available', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      mockBitcoinPriceNotAvailable(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.btcPrice).toBeNull()
    })

    it('should handle bitcoin price query errors gracefully', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileLookupSuccess(mockSupabaseClient)
      mockLastSeenAtUpdate(mockSupabaseClient)
      mockTransactionNoMessage(mockSupabaseClient)
      
      // RPC fails
      mockSupabaseClient.rpc.mockRejectedValueOnce(new Error('RPC error'))
      
      // Fallback also fails
      const mockFallback = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      }
      mockSupabaseClient.from.mockReturnValueOnce(mockFallback)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      // Should still succeed with null price
      const data = await expectSuccessResponse(response)
      expect(data.config.btcPrice).toBeNull()
    })
  })

  describe('Response Structure Validation', () => {
    it('should return correct response structure with all required fields', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await response.json()
      
      expect(data).toMatchObject({
        success: true,
        config: {
          deviceId: expect.any(String),
          petName: expect.any(String),
          petType: expect.any(String),
          userId: expect.any(String),
          userName: expect.any(String),
          balance: expect.any(Number),
          pollInterval: expect.any(Number),
          serverUrl: expect.any(String),
          lastMessage: expect.any(String),
        },
      })
      
      // btcPrice can be number or null
      expect(['number', 'object']).toContain(typeof data.config.btcPrice)
    })

    it('should include pollInterval of 30 seconds', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response, {
        pollInterval: 30,
      })
      
      expect(data.config.pollInterval).toBe(30)
    })

    it('should include serverUrl from environment or default', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.serverUrl).toBeTruthy()
      expect(typeof data.config.serverUrl).toBe('string')
    })

    it('should return valid pet type from allowed list', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(['cat', 'dog', 'rabbit', 'squirrel', 'turtle']).toContain(data.config.petType)
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when unexpected error occurs', async () => {
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      await expectErrorResponse(response, 500, 'Internal server error')
    })

    it('should include debug information in 404 device errors', async () => {
      mockDeviceNotFound(mockSupabaseClient)
      
      const request = createRequestWithDeviceId('test-device-id')
      const response = await GET(request)

      const data = await response.json()
      expect(data).toHaveProperty('debug')
      expect(data.debug).toHaveProperty('deviceId', 'test-device-id')
    })
  })

  describe('Integration with Device Management System', () => {
    it('should only return devices with paired status', async () => {
      const disconnectedDevice = createMockDevice({ status: 'disconnected' })
      mockDeviceNotFound(mockSupabaseClient) // Query for paired status returns nothing
      
      const request = createRequestWithDeviceId(disconnectedDevice.id)
      const response = await GET(request)

      await expectErrorResponse(response, 404, 'Device not found or not paired')
    })

    it('should work with devices from different pet types', async () => {
      const petTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']
      
      for (const petType of petTypes) {
        vi.clearAllMocks()
        
        const device = createMockDevice({ pet_type: petType as any })
        setupSuccessfulConfigFlow(mockSupabaseClient, { device })
        
        const request = createRequestWithDeviceId(device.id)
        const response = await GET(request)

        const data = await expectSuccessResponse(response)
        expect(data.config.petType).toBe(petType)
      }
    })

    it('should handle devices with special characters in pet names', async () => {
      const device = createMockDevice({ pet_name: "Mr. Whiskers O'Malley" })
      setupSuccessfulConfigFlow(mockSupabaseClient, { device })
      
      const request = createRequestWithDeviceId(device.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.petName).toBe("Mr. Whiskers O'Malley")
    })

    it('should retrieve config after device registration flow', async () => {
      // Simulates: POST /api/device/register -> GET /api/device/config
      const newDevice = createMockDevice({
        id: 'newly-registered-device',
        status: 'paired',
        last_seen_at: new Date().toISOString(),
      })
      
      setupSuccessfulConfigFlow(mockSupabaseClient, { device: newDevice })
      
      const request = createRequestWithDeviceId(newDevice.id)
      const response = await GET(request)

      const data = await expectSuccessResponse(response)
      expect(data.config.deviceId).toBe(newDevice.id)
    })
  })

  describe('Status Code Validation', () => {
    it('should return 200 for successful config retrieval', async () => {
      setupSuccessfulConfigFlow(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      expect(response.status).toBe(200)
    })

    it('should return 400 for missing authentication parameters', async () => {
      const request = createRequestWithNoParams()
      const response = await GET(request)

      expect(response.status).toBe(400)
    })

    it('should return 404 for non-existent device', async () => {
      mockDeviceNotFound(mockSupabaseClient)
      
      const request = createRequestWithDeviceId('non-existent')
      const response = await GET(request)

      expect(response.status).toBe(404)
    })

    it('should return 404 for missing profile', async () => {
      mockDeviceLookupByIdSuccess(mockSupabaseClient)
      mockProfileNotFound(mockSupabaseClient)
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      expect(response.status).toBe(404)
    })

    it('should return 500 for unexpected errors', async () => {
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Database connection failed')
      })
      
      const request = createRequestWithDeviceId(TEST_DEVICES.paired.id)
      const response = await GET(request)

      expect(response.status).toBe(500)
    })
  })
})