/**
 * Integration tests for POST /api/device/economy/sync endpoint.
 *
 * Tests device economy data synchronization including:
 * - Device state validation (paired status required)
 * - User balance integrity (pet_coins deduction)
 * - Cross-system data consistency (pending_spends tracking)
 * - Idempotency (duplicate spendId handling)
 * - Rate limiting enforcement
 * - Edge cases (balance floor at 0, invalid amounts)
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { getServiceClient } from './helpers/db-client'
import { seedUser, seedDevice } from './helpers/test-isolation'
import { trackUser } from '../setup-db'
import { POST } from '@/app/api/device/economy/sync/route'

/**
 * Create NextRequest for economy sync endpoint.
 */
function createEconomySyncRequest(deviceId: string, body: any): NextRequest {
  const url = `http://localhost:3000/api/device/economy/sync?deviceId=${deviceId}`
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

/**
 * Generate unique spend transaction data.
 */
function createSpendData(overrides: Partial<{
  spendId: string
  timestamp: number
  amount: number
  action: string
}> = {}) {
  return {
    spendId: crypto.randomUUID(),
    timestamp: Date.now(),
    amount: 100,
    action: 'purchase_item',
    ...overrides,
  }
}

describe('POST /api/device/economy/sync', () => {
  describe('Successful sync', () => {
    it('deducts coins and returns new balance', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 150 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        newCoinBalance: 850,
        spendId: spendData.spendId,
      })

      // Verify database balance was updated
      const supabase = getServiceClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(850)
    })

    it('records pending_spend entry for idempotency', async () => {
      const { id: userId } = await seedUser({ petCoins: 500 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 50, action: 'feed_pet' })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      expect(response.status).toBe(200)

      // Verify pending_spend was recorded
      const supabase = getServiceClient()
      const { data: pendingSpend } = await supabase
        .from('pending_spends')
        .select('*')
        .eq('spend_id', spendData.spendId)
        .eq('device_id', deviceId)
        .single()

      expect(pendingSpend).toBeTruthy()
      expect(pendingSpend?.user_id).toBe(userId)
      expect(pendingSpend?.amount).toBe(50)
      expect(pendingSpend?.action).toBe('feed_pet')
    })

    it('handles balance floor at 0 when insufficient funds', async () => {
      const { id: userId } = await seedUser({ petCoins: 30 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 100 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.newCoinBalance).toBe(0) // Floor at 0, not negative

      // Verify database shows 0
      const supabase = getServiceClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(0)
    })

    it('deducts exact amount when balance equals spend', async () => {
      const { id: userId } = await seedUser({ petCoins: 200 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 200 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.newCoinBalance).toBe(0)
    })

    it('accepts minimal valid spend (1 coin)', async () => {
      const { id: userId } = await seedUser({ petCoins: 100 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 1 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.newCoinBalance).toBe(99)
    })

    it('accepts maximum valid spend (10000 coins)', async () => {
      const { id: userId } = await seedUser({ petCoins: 15000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 10000 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.newCoinBalance).toBe(5000)
    })
  })

  describe('Idempotency', () => {
    it('returns success for duplicate spendId without double-deducting', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 100 })
      const request1 = createEconomySyncRequest(deviceId, spendData)
      const request2 = createEconomySyncRequest(deviceId, spendData)

      // First request
      const response1 = await POST(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      expect(data1.newCoinBalance).toBe(900)

      // Second request with same spendId
      const response2 = await POST(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.success).toBe(true)
      expect(data2.alreadyProcessed).toBe(true)
      expect(data2.newCoinBalance).toBe(900) // Same balance, not 800

      // Verify database balance unchanged
      const supabase = getServiceClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(900)
    })

    it('treats same spendId from different devices as separate transactions', async () => {
      const { id: userId1 } = await seedUser({ petCoins: 1000 })
      const { id: userId2 } = await seedUser({ petCoins: 1000 })
      const { id: deviceId1 } = await seedDevice(userId1, { status: 'paired' })
      const { id: deviceId2 } = await seedDevice(userId2, { status: 'paired' })

      const sharedSpendId = crypto.randomUUID()
      const spendData = createSpendData({ spendId: sharedSpendId, amount: 100 })

      const request1 = createEconomySyncRequest(deviceId1, spendData)
      const request2 = createEconomySyncRequest(deviceId2, spendData)

      // First device
      const response1 = await POST(request1)
      const data1 = await response1.json()
      expect(data1.newCoinBalance).toBe(900)

      // Second device with same spendId - should process as new transaction (different device)
      const response2 = await POST(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.alreadyProcessed).toBeFalsy() // Not duplicate - different device
      expect(data2.newCoinBalance).toBe(900) // Each user has their own balance

      // Verify each user's balance
      const supabase = getServiceClient()
      const { data: profile1 } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId1)
        .single()
      const { data: profile2 } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId2)
        .single()

      expect(profile1?.pet_coins).toBe(900)
      expect(profile2?.pet_coins).toBe(900)
    })
  })

  describe('Validation errors', () => {
    it('returns 400 when deviceId is missing', async () => {
      const url = 'http://localhost:3000/api/device/economy/sync'
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSpendData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device ID required')
    })

    it('returns 400 when spendId is missing', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createEconomySyncRequest(deviceId, {
        timestamp: Date.now(),
        amount: 100,
        action: 'purchase',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required fields')
    })

    it('returns 400 when amount is missing', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createEconomySyncRequest(deviceId, {
        spendId: crypto.randomUUID(),
        timestamp: Date.now(),
        action: 'purchase',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing required fields')
    })

    it('returns 400 when action is missing', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createEconomySyncRequest(deviceId, {
        spendId: crypto.randomUUID(),
        timestamp: Date.now(),
        amount: 100,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing required fields')
    })

    it('returns 400 for negative spend amount', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: -50 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid spend amount')
    })

    it('returns 400 for amount exceeding 10000', async () => {
      const { id: userId } = await seedUser({ petCoins: 15000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 10001 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid spend amount')
    })

    it('returns 400 for zero spend amount', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 0 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      // Note: 0 is treated as falsy by the !amount check, so returns "Missing required fields"
      expect(data.error).toBe('Missing required fields')
    })
  })

  describe('Device and user state errors', () => {
    it('returns 404 when device does not exist', async () => {
      const fakeDeviceId = crypto.randomUUID()
      const spendData = createSpendData()
      const request = createEconomySyncRequest(fakeDeviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Device not found or not paired')
    })

    it('returns 404 when device is not paired', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'disconnected' })

      const spendData = createSpendData()
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Device not found or not paired')
    })

    // Note: Cannot test orphaned device scenario - database enforces foreign key constraint
    // that prevents creating a device without a valid user_id reference
  })

  describe('Rate limiting', () => {
    it('returns 429 after exceeding rate limit (30 requests per minute)', async () => {
      const { id: userId } = await seedUser({ petCoins: 10000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      // Make 30 successful requests (the limit)
      for (let i = 0; i < 30; i++) {
        const spendData = createSpendData({ spendId: `spend-${i}`, amount: 10 })
        const request = createEconomySyncRequest(deviceId, spendData)
        const response = await POST(request)
        expect(response.status).toBe(200)
      }

      // 31st request should be rate limited
      const spendData = createSpendData({ spendId: 'spend-31', amount: 10 })
      const request = createEconomySyncRequest(deviceId, spendData)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Rate limit exceeded. Please try again later.')
      expect(data.retryAfter).toBeGreaterThan(0)
    })

    it('rate limits are per-device (different devices have independent limits)', async () => {
      const { id: userId1 } = await seedUser({ petCoins: 10000 })
      const { id: userId2 } = await seedUser({ petCoins: 10000 })
      const { id: deviceId1 } = await seedDevice(userId1, { status: 'paired' })
      const { id: deviceId2 } = await seedDevice(userId2, { status: 'paired' })

      // Exhaust rate limit for device 1
      for (let i = 0; i < 30; i++) {
        const spendData = createSpendData({ spendId: `spend-dev1-${i}`, amount: 10 })
        const request = createEconomySyncRequest(deviceId1, spendData)
        await POST(request)
      }

      // Device 1 should be rate limited
      const request1 = createEconomySyncRequest(
        deviceId1,
        createSpendData({ spendId: 'dev1-31', amount: 10 })
      )
      const response1 = await POST(request1)
      expect(response1.status).toBe(429)

      // Device 2 should still work (different user, independent rate limit)
      const request2 = createEconomySyncRequest(
        deviceId2,
        createSpendData({ spendId: 'dev2-1', amount: 10 })
      )
      const response2 = await POST(request2)
      expect(response2.status).toBe(200)
    })
  })

  describe('Cross-system data integrity', () => {
    it('maintains balance consistency across multiple transactions', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const transactions = [
        { amount: 100, action: 'purchase_food' },
        { amount: 50, action: 'purchase_toy' },
        { amount: 200, action: 'purchase_upgrade' },
        { amount: 75, action: 'purchase_accessory' },
      ]

      let expectedBalance = 1000

      for (const [index, tx] of transactions.entries()) {
        const spendData = createSpendData({
          spendId: `tx-${index}`,
          amount: tx.amount,
          action: tx.action,
        })
        const request = createEconomySyncRequest(deviceId, spendData)
        const response = await POST(request)
        const data = await response.json()

        expectedBalance -= tx.amount
        expect(data.newCoinBalance).toBe(expectedBalance)
      }

      // Verify final balance in database
      const supabase = getServiceClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      expect(profile?.pet_coins).toBe(575) // 1000 - 100 - 50 - 200 - 75
    })

    it('records all pending_spends with correct timestamps', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const timestamp1 = Date.now()
      const timestamp2 = Date.now() + 1000

      await POST(
        createEconomySyncRequest(deviceId, createSpendData({
          spendId: 'spend-1',
          amount: 50,
          timestamp: timestamp1,
        }))
      )

      await POST(
        createEconomySyncRequest(deviceId, createSpendData({
          spendId: 'spend-2',
          amount: 75,
          timestamp: timestamp2,
        }))
      )

      // Verify both spends were recorded
      const supabase = getServiceClient()
      const { data: spends } = await supabase
        .from('pending_spends')
        .select('*')
        .eq('device_id', deviceId)
        .order('timestamp', { ascending: true })

      expect(spends).toHaveLength(2)
      expect(spends?.[0].spend_id).toBe('spend-1')
      expect(spends?.[0].amount).toBe(50)
      expect(spends?.[1].spend_id).toBe('spend-2')
      expect(spends?.[1].amount).toBe(75)

      // Verify timestamps are preserved
      const ts1 = new Date(spends?.[0].timestamp).getTime()
      const ts2 = new Date(spends?.[1].timestamp).getTime()
      expect(Math.abs(ts1 - timestamp1)).toBeLessThan(1000) // Within 1 second
      expect(Math.abs(ts2 - timestamp2)).toBeLessThan(1000)
    })

    it('handles concurrent requests from same device gracefully', async () => {
      const { id: userId } = await seedUser({ petCoins: 1000 })
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      // Simulate concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) => {
        const spendData = createSpendData({
          spendId: `concurrent-${i}`,
          amount: 50,
          action: 'concurrent_test',
        })
        return POST(createEconomySyncRequest(deviceId, spendData))
      })

      const responses = await Promise.all(requests)

      // Check responses
      const successfulResponses = responses.filter(r => r.status === 200)
      
      // All requests should return 200
      expect(successfulResponses.length).toBe(5)
      
      // Verify pending_spends records
      const supabase = getServiceClient()
      const { data: pendingSpends } = await supabase
        .from('pending_spends')
        .select('amount')
        .eq('device_id', deviceId)
        .like('spend_id', 'concurrent-%')

      // All 5 spends should be recorded
      expect(pendingSpends?.length).toBe(5)
      
      // Check final balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', userId)
        .single()

      // With atomic spend_coins RPC function, all 5 concurrent deductions
      // should be applied correctly: 1000 - (5 * 50) = 750
      expect(profile?.pet_coins).toBe(750)
    })
  })

  describe('Balance reconciliation', () => {
    it('handles user with null pet_coins (treats as 0)', async () => {
      const supabase = getServiceClient()
      const { id: userId } = await seedUser({ petCoins: 0 })

      // Set pet_coins to null
      await supabase
        .from('profiles')
        .update({ pet_coins: null })
        .eq('id', userId)

      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const spendData = createSpendData({ amount: 50 })
      const request = createEconomySyncRequest(deviceId, spendData)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.newCoinBalance).toBe(0) // null treated as 0, floor at 0
    })
  })
})
