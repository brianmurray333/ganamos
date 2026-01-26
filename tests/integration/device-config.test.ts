/**
 * Integration tests for GET /api/device/config
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * This endpoint uses device-based authentication (deviceId or pairingCode query params)
 * and does NOT require user session authentication.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/device/config/route'
import { seedUser, seedDevice } from './helpers/test-isolation'
import { getServiceClient } from './helpers/db-client'

/**
 * Create NextRequest for device config endpoint with optional authentication parameters
 */
function createConfigRequest(params: { deviceId?: string; pairingCode?: string } = {}): NextRequest {
  const searchParams = new URLSearchParams()
  if (params.deviceId) searchParams.set('deviceId', params.deviceId)
  if (params.pairingCode) searchParams.set('pairingCode', params.pairingCode)

  const url = `http://localhost:3000/api/device/config${
    searchParams.toString() ? `?${searchParams.toString()}` : ''
  }`
  return new NextRequest(url, { method: 'GET' })
}

// Mock rate limiter to control test behavior
const rateLimitState = {
  allowed: true,
  totalRequests: 0,
  resetTime: Date.now() + 60000,
}

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({
    allowed: rateLimitState.allowed,
    totalRequests: rateLimitState.totalRequests,
    resetTime: rateLimitState.resetTime,
  })),
  RATE_LIMITS: {
    DEVICE_CONFIG: { requests: 30, window: 60 },
  },
}))

describe('GET /api/device/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitState.allowed = true
    rateLimitState.totalRequests = 0
    rateLimitState.resetTime = Date.now() + 60000
  })

  describe('Request Validation', () => {
    it('should return 400 when both deviceId and pairingCode are missing', async () => {
      const request = createConfigRequest()
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device ID or pairing code required')
    })
  })

  describe('Device Authentication with deviceId', () => {
    it('should return device configuration when authenticated with valid deviceId', async () => {
      const { id: userId } = await seedUser({ balance: 50000, petCoins: 100, name: 'Test User' })
      const { id: deviceId } = await seedDevice(userId, {
        status: 'paired',
        petName: 'Fluffy',
        petType: 'cat',
      })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.config).toBeDefined()
      expect(data.config.deviceId).toBe(deviceId)
      expect(data.config.petName).toBe('Fluffy')
      expect(data.config.petType).toBe('cat')
      expect(data.config.userId).toBe(userId)
      expect(data.config.userName).toBe('Test User')
      expect(data.config.balance).toBe(50000)
      expect(data.config.coins).toBe(0) // Deprecated: always 0, device manages coins locally
    })

    it('should return 404 when deviceId does not exist', async () => {
      const fakeDeviceId = crypto.randomUUID()

      const request = createConfigRequest({ deviceId: fakeDeviceId })
      const response = await GET(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })

    it('should return 404 when device is not paired', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'disconnected' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })
  })

  describe('Device Authentication with pairingCode', () => {
    it('should return device configuration when authenticated with valid pairingCode', async () => {
      const { id: userId } = await seedUser({ balance: 25000, petCoins: 50 })
      const pairingCode = `TEST-${Date.now()}`
      await seedDevice(userId, {
        status: 'paired',
        petName: 'Buddy',
        petType: 'dog',
        pairingCode,
      })

      const request = createConfigRequest({ pairingCode })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.config.petName).toBe('Buddy')
      expect(data.config.petType).toBe('dog')
      expect(data.config.balance).toBe(25000)
      expect(data.config.coins).toBe(0) // Deprecated: always 0, device manages coins locally
    })

    it('should return 404 when pairingCode does not exist', async () => {
      const request = createConfigRequest({ pairingCode: 'NONEXISTENT-CODE' })
      const response = await GET(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })
  })

  describe('Response Structure', () => {
    it('should include all required configuration fields', async () => {
      const { id: userId } = await seedUser({ balance: 10000, petCoins: 200 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.config).toHaveProperty('deviceId')
      expect(data.config).toHaveProperty('petName')
      expect(data.config).toHaveProperty('petType')
      expect(data.config).toHaveProperty('userId')
      expect(data.config).toHaveProperty('userName')
      expect(data.config).toHaveProperty('balance')
      expect(data.config).toHaveProperty('coins')
      expect(data.config).toHaveProperty('coinsEarnedSinceLastSync')
      expect(data.config).toHaveProperty('btcPrice')
      expect(data.config).toHaveProperty('pollInterval')
      expect(data.config).toHaveProperty('serverUrl')
      expect(data.config).toHaveProperty('lastMessage')
      expect(data.config).toHaveProperty('petFeedCost')
      expect(data.config).toHaveProperty('petHealCost')
      expect(data.config).toHaveProperty('gameCost')
      expect(data.config).toHaveProperty('gameReward')
      expect(data.config).toHaveProperty('hungerDecayPer24h')
      expect(data.config).toHaveProperty('happinessDecayPer24h')
      expect(data.config).toHaveProperty('hasNewJob')
      expect(data.config).toHaveProperty('newJobTitle')
      expect(data.config).toHaveProperty('newJobReward')
    })

    it('should include default configuration values', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.config.pollInterval).toBe(30)
      expect(data.config.petFeedCost).toBe(100)
      expect(data.config.petHealCost).toBe(200)
      expect(data.config.gameCost).toBe(100)
      expect(data.config.gameReward).toBe(15)
      expect(data.config.hungerDecayPer24h).toBe(40.0)
      expect(data.config.happinessDecayPer24h).toBe(25.0)
    })

    it('should include job notification fields (default no new job)', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.config.hasNewJob).toBe(false)
      expect(data.config.newJobTitle).toBeNull()
      expect(data.config.newJobReward).toBeNull()
    })
  })

  describe('Balance and Coins Data', () => {
    it('should return correct balance from profile and coins from device', async () => {
      const { id: userId } = await seedUser({ balance: 12345, petCoins: 678 })
      // Coins are now tracked per-device, not per-user profile
      const { id: deviceId } = await seedDevice(userId, { status: 'paired', coins: 500 })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.config.balance).toBe(12345)
      // Coins now comes from device.coins, not profiles.pet_coins
      expect(data.config.coins).toBe(500)
    })

    it('should handle zero balance and coins', async () => {
      const { id: userId } = await seedUser({ balance: 0, petCoins: 0 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.config.balance).toBe(0)
      expect(data.config.coins).toBe(0)
    })

    it('should return device coins independent of profile pet_coins', async () => {
      const supabase = getServiceClient()
      const { id: userId } = await seedUser({ balance: 1000, petCoins: 999 })
      
      // Device has its own coin balance separate from profile.pet_coins
      const { id: deviceId } = await seedDevice(userId, { status: 'paired', coins: 123 })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      // Coins come from device.coins, not profile.pet_coins
      expect(data.config.coins).toBe(123)
    })
  })

  describe('Database Persistence', () => {
    it('should update device last_seen_at timestamp', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const supabase = getServiceClient()
      
      // Get initial last_seen_at
      const { data: beforeDevice } = await supabase
        .from('devices')
        .select('last_seen_at')
        .eq('id', deviceId)
        .single()

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100))

      const request = createConfigRequest({ deviceId })
      await GET(request)

      // Get updated last_seen_at
      const { data: afterDevice } = await supabase
        .from('devices')
        .select('last_seen_at')
        .eq('id', deviceId)
        .single()

      expect(afterDevice?.last_seen_at).toBeDefined()
      if (beforeDevice?.last_seen_at) {
        expect(new Date(afterDevice!.last_seen_at).getTime()).toBeGreaterThan(
          new Date(beforeDevice.last_seen_at).getTime()
        )
      }
    })

    it('should return 404 when profile does not exist for device user', async () => {
      const supabase = getServiceClient()
      
      // Create a user and device, then delete the profile
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      await supabase.from('profiles').delete().eq('id', userId)

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('User profile not found')
    })
  })

  describe('Cache Headers', () => {
    it('should include no-cache headers to prevent edge caching', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      
      const cacheControl = response.headers.get('Cache-Control')
      expect(cacheControl).toBeDefined()
      expect(cacheControl).toContain('no-store')
      expect(cacheControl).toContain('no-cache')
      expect(cacheControl).toContain('must-revalidate')
      
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')
    })
  })

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      // Set rate limit state to exceeded
      rateLimitState.allowed = false
      rateLimitState.totalRequests = 31

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Rate limit exceeded. Please try again later.')
      expect(data.retryAfter).toBeDefined()
      expect(typeof data.retryAfter).toBe('number')
    })

    it('should allow requests within rate limit', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      // Set rate limit state to allowed
      rateLimitState.allowed = true
      rateLimitState.totalRequests = 10

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
    })

    it('should use deviceId for rate limiting when provided', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limiter')
      
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      await GET(request)

      expect(checkRateLimit).toHaveBeenCalledWith(
        deviceId,
        expect.objectContaining({ requests: 30, window: 60 })
      )
    })

    it('should use pairingCode for rate limiting when deviceId not provided', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limiter')
      
      const { id: userId } = await seedUser()
      const pairingCode = `CODE-${Date.now()}`
      await seedDevice(userId, { status: 'paired', pairingCode })

      const request = createConfigRequest({ pairingCode })
      await GET(request)

      expect(checkRateLimit).toHaveBeenCalledWith(
        pairingCode,
        expect.objectContaining({ requests: 30, window: 60 })
      )
    })
  })

  describe('User Information', () => {
    it('should include user name from profile', async () => {
      const { id: userId } = await seedUser({ name: 'John Doe' })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.config.userName).toBe('John Doe')
    })

    it('should default to "User" when profile name is missing', async () => {
      const supabase = getServiceClient()
      const { id: userId } = await seedUser({ name: 'Test' })
      
      // Remove name from profile
      await supabase
        .from('profiles')
        .update({ name: null })
        .eq('id', userId)

      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.config.userName).toBe('User')
    })
  })

  describe('Bitcoin Price Integration', () => {
    it('should include btcPrice when available', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      
      // btcPrice can be null if no price data exists, or a number if available
      if (data.config.btcPrice !== null) {
        expect(typeof data.config.btcPrice).toBe('number')
        expect(data.config.btcPrice).toBeGreaterThan(0)
      }
    })
  })

  describe('Coins Earned Since Last Sync', () => {
    it('should calculate coinsEarnedSinceLastSync correctly', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      
      // For new devices with no transactions, should be 0
      expect(data.config.coinsEarnedSinceLastSync).toBe(0)
    })
  })

  describe('Server URL', () => {
    it('should include serverUrl in configuration', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createConfigRequest({ deviceId })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.config.serverUrl).toBeDefined()
      expect(typeof data.config.serverUrl).toBe('string')
    })
  })

  describe('Multiple Devices', () => {
    it('should return correct configuration for each device independently', async () => {
      const { id: user1Id } = await seedUser({ balance: 1000, petCoins: 50, name: 'User One' })
      const { id: user2Id } = await seedUser({ balance: 2000, petCoins: 100, name: 'User Two' })
      
      const { id: device1Id } = await seedDevice(user1Id, {
        status: 'paired',
        petName: 'Device1',
        petType: 'cat',
        coins: 50, // Per-device coin balance
      })
      const { id: device2Id } = await seedDevice(user2Id, {
        status: 'paired',
        petName: 'Device2',
        petType: 'dog',
        coins: 100, // Per-device coin balance
      })

      // Request config for device 1
      const request1 = createConfigRequest({ deviceId: device1Id })
      const response1 = await GET(request1)
      const data1 = await response1.json()

      expect(data1.config.deviceId).toBe(device1Id)
      expect(data1.config.userName).toBe('User One')
      expect(data1.config.balance).toBe(1000)
      expect(data1.config.coins).toBe(50) // Per-device coins
      expect(data1.config.petName).toBe('Device1')
      expect(data1.config.petType).toBe('cat')

      // Request config for device 2
      const request2 = createConfigRequest({ deviceId: device2Id })
      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(data2.config.deviceId).toBe(device2Id)
      expect(data2.config.userName).toBe('User Two')
      expect(data2.config.balance).toBe(2000)
      expect(data2.config.coins).toBe(100) // Per-device coins
      expect(data2.config.petName).toBe('Device2')
      expect(data2.config.petType).toBe('dog')
    })
  })
})
