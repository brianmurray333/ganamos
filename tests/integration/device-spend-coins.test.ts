/**
 * Integration tests for POST /api/device/spend-coins
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/device/spend-coins/route'
import { seedUser, seedDevice } from './helpers/test-isolation'
import { getServiceClient } from './helpers/db-client'

function createSpendCoinsRequest(
  deviceId: string | null,
  body: { amount?: number; action?: string }
): NextRequest {
  const url = deviceId
    ? `http://localhost:3000/api/device/spend-coins?deviceId=${deviceId}`
    : 'http://localhost:3000/api/device/spend-coins'

  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/device/spend-coins', () => {
  describe('Request Validation', () => {
    it('should return 400 when deviceId is missing', async () => {
      const request = createSpendCoinsRequest(null, { amount: 10, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device ID required')
    })

    it('should return 400 when amount is missing', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Valid amount required')
    })

    it('should return 400 when amount is zero', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { amount: 0, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Valid amount required')
    })

    it('should return 400 when amount is negative', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { amount: -10, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Valid amount required')
    })
  })

  describe('Device Verification', () => {
    it('should return 404 when device does not exist', async () => {
      const fakeDeviceId = crypto.randomUUID()

      const request = createSpendCoinsRequest(fakeDeviceId, { amount: 10, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })

    it('should return 404 when device is not paired', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'disconnected' })

      const request = createSpendCoinsRequest(deviceId, { amount: 10, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })
  })

  describe('Balance Checks', () => {
    it('should return 400 when user has insufficient coins', async () => {
      const { id: userId } = await seedUser({ petCoins: 5 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { amount: 10, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient coins')
      expect(data.currentCoins).toBe(5)
      expect(data.required).toBe(10)
    })

    it('should return 400 when user has zero coins', async () => {
      const { id: userId } = await seedUser({ petCoins: 0 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { amount: 10, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient coins')
    })
  })

  describe('Successful Spending', () => {
    it('should deduct coins and return new balance', async () => {
      const { id: userId } = await seedUser({ petCoins: 100 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { amount: 25, action: 'feed' })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.coinsSpent).toBe(25)
      expect(data.newCoinBalance).toBe(75)
      expect(data.action).toBe('feed')

      // Verify database was updated
      const serviceClient = getServiceClient()
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(75)
    })

    it('should handle spending all remaining coins', async () => {
      const { id: userId } = await seedUser({ petCoins: 50 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createSpendCoinsRequest(deviceId, { amount: 50, action: 'heal' })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.newCoinBalance).toBe(0)

      // Verify database was updated
      const serviceClient = getServiceClient()
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(0)
    })

    it('should handle different action types', async () => {
      const { id: userId } = await seedUser({ petCoins: 100 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      // Test 'game' action
      const request = createSpendCoinsRequest(deviceId, { amount: 10, action: 'game' })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.action).toBe('game')
    })

    it('should handle multiple sequential spends', async () => {
      const { id: userId } = await seedUser({ petCoins: 100 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      // First spend
      const request1 = createSpendCoinsRequest(deviceId, { amount: 30, action: 'feed' })
      const response1 = await POST(request1)
      expect(response1.status).toBe(200)
      const data1 = await response1.json()
      expect(data1.newCoinBalance).toBe(70)

      // Second spend
      const request2 = createSpendCoinsRequest(deviceId, { amount: 20, action: 'heal' })
      const response2 = await POST(request2)
      expect(response2.status).toBe(200)
      const data2 = await response2.json()
      expect(data2.newCoinBalance).toBe(50)

      // Third spend
      const request3 = createSpendCoinsRequest(deviceId, { amount: 15, action: 'game' })
      const response3 = await POST(request3)
      expect(response3.status).toBe(200)
      const data3 = await response3.json()
      expect(data3.newCoinBalance).toBe(35)

      // Verify final balance in database
      const serviceClient = getServiceClient()
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(35)
    })
  })
})
