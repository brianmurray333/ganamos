import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '@/app/api/device/config/route'
import {
  createMockDevice,
  createMockProfile,
  createMockTransaction,
  createMockBitcoinPrice,
  createMockQueryBuilder,
  mockDeviceLookupByDeviceId,
  mockDeviceLookupByPairingCode,
  mockDeviceNotFound,
  mockProfileNotFound,
  mockCompleteDeviceConfigSuccess,
  expectDeviceQueryCalled,
  expectProfileQueryCalled,
  expectLastSeenAtUpdated,
  expectTransactionQueryCalled,
  expectBitcoinPriceRpcCalled,
} from './helpers/device-config-mocks'

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

describe('GET /api/device/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should authenticate with deviceId parameter', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.config.deviceId).toBe(device.id)
      expectDeviceQueryCalled(mockSupabaseClient, 'id', device.id)
    })

    it('should authenticate with pairingCode parameter', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?pairingCode=${device.pairing_code}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.config.deviceId).toBe(device.id)
      expectDeviceQueryCalled(
        mockSupabaseClient,
        'pairing_code',
        device.pairing_code
      )
    })

    it('should return 400 when both deviceId and pairingCode are missing', async () => {
      const request = new Request('http://localhost:3000/api/device/config')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device ID or pairing code required')
    })

    it('should return 404 when device is not found', async () => {
      mockDeviceNotFound(mockSupabaseClient)

      const request = new Request(
        'http://localhost:3000/api/device/config?deviceId=nonexistent-id'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })

    it('should return 404 when device is not paired', async () => {
      // For unpaired devices, the query with .eq('status', 'paired') should return null
      const unpairedDevice = createMockDevice({ status: 'disconnected' })
      mockDeviceNotFound(mockSupabaseClient) // Unpaired device won't be found by paired query

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${unpairedDevice.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })
  })

  describe('Profile Integration', () => {
    it('should retrieve user profile data', async () => {
      const device = createMockDevice()
      const profile = createMockProfile({
        id: device.user_id,
        balance: 75000,
        name: 'John Doe',
      })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device, profile })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.userId).toBe(profile.id)
      expect(data.config.userName).toBe(profile.name)
      expect(data.config.balance).toBe(profile.balance)
      expectProfileQueryCalled(mockSupabaseClient, device.user_id)
    })

    it('should return 404 when profile is not found', async () => {
      mockProfileNotFound(mockSupabaseClient)

      const request = new Request(
        'http://localhost:3000/api/device/config?deviceId=device-123'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('User profile not found')
    })

    it('should use default username when profile name is null', async () => {
      const device = createMockDevice()
      const profile = createMockProfile({
        id: device.user_id,
        name: null,
      })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device, profile })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.userName).toBe('User')
    })
  })

  describe('Device Data', () => {
    it('should return correct device configuration', async () => {
      const device = createMockDevice({
        id: 'device-789',
        pet_name: 'Whiskers',
        pet_type: 'cat',
        user_id: 'user-999',
      })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.deviceId).toBe(device.id)
      expect(data.config.petName).toBe(device.pet_name)
      expect(data.config.petType).toBe(device.pet_type)
      expect(data.config.userId).toBe(device.user_id)
    })

    it('should support different pet types', async () => {
      const petTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']

      for (const petType of petTypes) {
        vi.clearAllMocks()
        const device = createMockDevice({ pet_type: petType })
        mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

        const request = new Request(
          `http://localhost:3000/api/device/config?deviceId=${device.id}`
        )
        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.config.petType).toBe(petType)
      }
    })
  })

  describe('Metadata Updates', () => {
    it('should update last_seen_at timestamp', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      await GET(request)

      expectLastSeenAtUpdated(mockSupabaseClient, device.id)
    })
  })

  describe('Transaction Integration', () => {
    it('should retrieve last transaction message', async () => {
      const device = createMockDevice()
      const transaction = createMockTransaction({
        message: 'Payment received: 1000 sats',
      })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, {
        device,
        transaction,
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.lastMessage).toBe(transaction.message)
      expectTransactionQueryCalled(mockSupabaseClient, device.user_id)
    })

    it('should return empty string when no transaction message exists', async () => {
      const device = createMockDevice()
      const transaction = createMockTransaction({ message: null })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, {
        device,
        transaction,
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.lastMessage).toBe('')
    })

    it('should handle transaction query errors gracefully', async () => {
      const device = createMockDevice()
      const profile = createMockProfile()
      
      // Set up successful device, profile, and bitcoin price queries
      const deviceQueryBuilder = createMockQueryBuilder({
        data: device,
        error: null,
      })
      
      const profileQueryBuilder = createMockQueryBuilder({
        data: profile,
        error: null,
      })
      
      const updateQueryBuilder = createMockQueryBuilder({
        data: null,
        error: null,
      })
      
      const bitcoinPrice = createMockBitcoinPrice()
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [bitcoinPrice],
        error: null,
      })
      
      // Set up transaction query to fail
      const transactionQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error('Transaction query failed')),
      }
      
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          return deviceQueryBuilder
        }
        if (table === 'profiles') {
          return profileQueryBuilder
        }
        if (table === 'transactions') {
          return transactionQueryBuilder
        }
        return createMockQueryBuilder({ data: null, error: null })
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.lastMessage).toBe('')
    })
  })

  describe('Bitcoin Price Integration', () => {
    it('should fetch Bitcoin price via RPC function', async () => {
      const device = createMockDevice()
      const bitcoinPrice = createMockBitcoinPrice({
        price: '48500.50',
        age_minutes: 10,
      })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, {
        device,
        bitcoinPrice,
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.btcPrice).toBe(48500.5)
      expectBitcoinPriceRpcCalled(mockSupabaseClient)
    })

    it('should fallback to table query when RPC fails', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      // Override RPC to fail
      mockSupabaseClient.rpc.mockRejectedValue(new Error('RPC call failed'))

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.btcPrice).toBeDefined()
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('bitcoin_prices')
    })

    it('should handle Bitcoin price query errors gracefully', async () => {
      const device = createMockDevice()
      const profile = createMockProfile()
      
      // Set up successful device, profile, and transaction queries
      const deviceQueryBuilder = createMockQueryBuilder({
        data: device,
        error: null,
      })
      
      const profileQueryBuilder = createMockQueryBuilder({
        data: profile,
        error: null,
      })
      
      const transactionQueryBuilder = createMockQueryBuilder({
        data: { message: '' },
        error: null,
      })
      
      // Set up RPC to fail
      mockSupabaseClient.rpc.mockRejectedValue(new Error('RPC call failed'))
      
      // Set up bitcoin_prices table query to fail
      const bitcoinPriceQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      }
      
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          return deviceQueryBuilder
        }
        if (table === 'profiles') {
          return profileQueryBuilder
        }
        if (table === 'transactions') {
          return transactionQueryBuilder
        }
        if (table === 'bitcoin_prices') {
          return bitcoinPriceQueryBuilder
        }
        return createMockQueryBuilder({ data: null, error: null })
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.btcPrice).toBeNull()
    })

    it('should parse price string to float', async () => {
      const device = createMockDevice()
      const bitcoinPrice = createMockBitcoinPrice({
        price: '52100.75',
      })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, {
        device,
        bitcoinPrice,
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.btcPrice).toBe(52100.75)
      expect(typeof data.config.btcPrice).toBe('number')
    })
  })

  describe('Response Format', () => {
    it('should return all required config fields', async () => {
      const device = createMockDevice()
      const profile = createMockProfile()
      const transaction = createMockTransaction()
      const bitcoinPrice = createMockBitcoinPrice()

      mockCompleteDeviceConfigSuccess(mockSupabaseClient, {
        device,
        profile,
        transaction,
        bitcoinPrice,
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('config')

      const { config } = data
      expect(config).toHaveProperty('deviceId')
      expect(config).toHaveProperty('petName')
      expect(config).toHaveProperty('petType')
      expect(config).toHaveProperty('userId')
      expect(config).toHaveProperty('userName')
      expect(config).toHaveProperty('balance')
      expect(config).toHaveProperty('btcPrice')
      expect(config).toHaveProperty('pollInterval')
      expect(config).toHaveProperty('serverUrl')
      expect(config).toHaveProperty('lastMessage')
    })

    it('should include correct pollInterval', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.pollInterval).toBe(30)
    })

    it('should include serverUrl from environment or default', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.serverUrl).toBeDefined()
      expect(typeof data.config.serverUrl).toBe('string')
    })
  })

  describe('Error Handling', () => {
    it('should return 500 on unexpected errors', async () => {
      // Mock Supabase to throw unexpected error
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      const request = new Request(
        'http://localhost:3000/api/device/config?deviceId=device-123'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Internal server error')
    })

    it('should include debug information on device not found', async () => {
      mockDeviceNotFound(mockSupabaseClient)

      const deviceId = 'debug-device-123'
      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${deviceId}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.debug).toBeDefined()
      expect(data.debug.deviceId).toBe(deviceId)
    })

    it('should include debug information on pairing code not found', async () => {
      mockDeviceNotFound(mockSupabaseClient)

      const pairingCode = 'XYZ789'
      const request = new Request(
        `http://localhost:3000/api/device/config?pairingCode=${pairingCode}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.debug).toBeDefined()
      expect(data.debug.pairingCode).toBe(pairingCode)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero balance', async () => {
      const device = createMockDevice()
      const profile = createMockProfile({ balance: 0 })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device, profile })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.balance).toBe(0)
    })

    it('should handle missing profile balance', async () => {
      const device = createMockDevice()
      const profile = createMockProfile({ balance: null as any })
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device, profile })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.balance).toBe(0)
    })

    it('should handle null Bitcoin price gracefully', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      // Override RPC to return null
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: null,
      })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.btcPrice).toBeNull()
    })

    it('should handle both deviceId and pairingCode (prefers deviceId)', async () => {
      const device = createMockDevice()
      mockCompleteDeviceConfigSuccess(mockSupabaseClient, { device })

      const request = new Request(
        `http://localhost:3000/api/device/config?deviceId=${device.id}&pairingCode=${device.pairing_code}`
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.config.deviceId).toBe(device.id)
      // Should query by deviceId, not pairingCode
      expectDeviceQueryCalled(mockSupabaseClient, 'id', device.id)
    })
  })
})
