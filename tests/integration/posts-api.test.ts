import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash, randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/posts/route'
import { getServiceClient } from './helpers/db-client'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock external services (L402 and Lightning) but not database
vi.mock('@/lib/l402', () => ({
  verifyL402Token: vi.fn(),
  parseL402Header: vi.fn(),
}))

vi.mock('@/lib/lightning', () => ({
  getInvoiceStatus: vi.fn(),
  // createFundedAnonymousPostAction asks the node whether the funding (L402) invoice settled
  checkInvoice: vi.fn(),
  createInvoice: vi.fn(),
}))

// Mock transaction emails to avoid importing @/lib/env which requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
vi.mock('@/lib/transaction-emails', () => ({
  sendFixSubmittedForReviewEmail: vi.fn().mockResolvedValue({ success: true }),
  sendIssueFixedEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn((key: string) => {
      if (key === 'authorization') {
        return 'L402 mock-token:mock-macaroon'
      }
      return null
    }),
  })),
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
  })),
}))

// Import after mocks are set up
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { getInvoiceStatus, checkInvoice } from '@/lib/lightning'

describe('POST /api/posts - Integration Tests', () => {
  let supabase: SupabaseClient
  const createdPostIds: string[] = []
  let testPaymentHash: string
  /** Another valid-format payment hash derived from this test's hash. */
  const variantHash = (suffix: string) => createHash('sha256').update(testPaymentHash + suffix).digest('hex')

  beforeEach(async () => {
    supabase = getServiceClient()
    vi.clearAllMocks()
    // Real L402 payment hashes are 32-byte hex (the server validates the format)
    testPaymentHash = randomBytes(32).toString('hex')

    // Mock parseL402Header to return a valid token
    vi.mocked(parseL402Header).mockReturnValue({
      macaroon: 'mock-macaroon',
      preimage: 'mock-preimage',
    })

    // Setup default mocks for external services
    vi.mocked(verifyL402Token).mockResolvedValue({
      success: true,
      paymentHash: testPaymentHash,
      macaroon: {
        identifier: testPaymentHash,
        location: 'ganamos-api',
        signature: 'mock-signature',
        caveats: [
          { condition: 'action', value: 'create_post' },
          { condition: 'amount', value: '1010' }, // Default: 1000 sats reward + 10 sats fee
          { condition: 'expires', value: String(Date.now() + 3600000) },
        ],
      },
    })

    vi.mocked(getInvoiceStatus).mockResolvedValue({
      settled: true,
      amount: 1010,
    })

    // The L402 invoice is settled for the amount in the token's `amount` caveat
    // (reward + API fee) of the most recent verifyL402Token result.
    vi.mocked(checkInvoice).mockImplementation(async () => {
      const last = await vi.mocked(verifyL402Token).mock.results.at(-1)?.value
      const amount = last?.macaroon?.caveats?.find((c: any) => c.condition === 'amount')?.value ?? '0'
      const reward = Number(amount) - 10
      return {
        success: true,
        settled: true,
        amountPaid: String(amount),
        state: 'SETTLED',
        // Server-set memo of POST /api/posts L402 invoices
        memo: `Pay ${amount} sats to post job on Ganamos (${reward} reward + 10 API fee)`,
      } as any
    })
  })

  afterEach(async () => {
    // Cleanup created posts
    if (createdPostIds.length > 0) {
      const { error } = await supabase
        .from('posts')
        .delete()
        .in('id', createdPostIds)
      
      if (error) {
        console.error('Failed to cleanup test posts:', error)
      }
      createdPostIds.length = 0
    }

    // Cleanup l402_used_tokens for replay protection
    await supabase
      .from('l402_used_tokens')
      .delete()
      .like('payment_hash', 'test-payment-hash-%')
  })

  describe('Successful Post Creation', () => {
    it('should create a post in the database with all required fields', async () => {
      const postData = {
        description: 'Integration test post',
        reward: 1000,
        location: 'Austin, TX',
        latitude: 30.2672,
        longitude: -97.7431,
      }

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      // Verify response
      expect(response.status).toBe(201)
      // The funding invoice was verified with the node before the post was created
      expect(checkInvoice).toHaveBeenCalledWith(testPaymentHash)
      expect(data.success).toBe(true)
      expect(data.post_id).toBeDefined()
      expect(data.payment_hash).toBe(testPaymentHash)
      expect(data.total_paid).toBe(1010)

      // Track for cleanup
      createdPostIds.push(data.post_id)

      // Verify actual database record
      const { data: dbPost, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', data.post_id)
        .single()

      expect(error).toBeNull()
      expect(dbPost).toBeDefined()
      expect(dbPost.description).toBe(postData.description)
      expect(dbPost.reward).toBe(postData.reward)
      // API uses location field for city
      expect(dbPost.city).toBe(postData.location)
      expect(dbPost.location).toBe(postData.location)
      expect(dbPost.latitude).toBe(postData.latitude)
      expect(dbPost.longitude).toBe(postData.longitude)
      expect(dbPost.funding_r_hash).toBe(testPaymentHash)
      expect(dbPost.created_at).toBeDefined()
    })

    it('should create a post with minimal required fields', async () => {
      const postData = {
        description: 'Minimal integration test post',
        reward: 500,
      }

      vi.mocked(verifyL402Token).mockResolvedValue({
        success: true,
        paymentHash: testPaymentHash,
        macaroon: {
          identifier: testPaymentHash,
          location: 'ganamos-api',
          signature: 'mock-signature',
          caveats: [
            { condition: 'action', value: 'create_post' },
            { condition: 'amount', value: '510' }, // 500 + 10 fee
            { condition: 'expires', value: String(Date.now() + 3600000) },
          ],
        },
      })

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.post_id).toBeDefined()

      createdPostIds.push(data.post_id)

      // Verify in database
      const { data: dbPost, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', data.post_id)
        .single()

      expect(error).toBeNull()
      expect(dbPost.description).toBe(postData.description)
      expect(dbPost.reward).toBe(postData.reward)
      expect(dbPost.city).toBeNull()
      expect(dbPost.location).toBeNull()
    })

    // Fixed (was REAL BUG): zero-reward API posts were rejected as "Invalid funding details."
    it('should create post with zero reward', async () => {
      const postData = {
        description: 'Zero reward post',
        reward: 0,
      }

      vi.mocked(verifyL402Token).mockResolvedValue({
        success: true,
        paymentHash: testPaymentHash,
        macaroon: {
          identifier: testPaymentHash,
          location: 'ganamos-api',
          signature: 'mock-signature',
          caveats: [
            { condition: 'action', value: 'create_post' },
            { condition: 'amount', value: '10' }, // Only the 10 sat fee
            { condition: 'expires', value: String(Date.now() + 3600000) },
          ],
        },
      })

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.total_paid).toBe(10)

      createdPostIds.push(data.post_id)

      const { data: dbPost } = await supabase
        .from('posts')
        .select('reward')
        .eq('id', data.post_id)
        .single()

      expect(dbPost.reward).toBe(0)
    })
  })

  describe('Funding verification', () => {
    it('should not create a post when the node reports the payment as unsettled', async () => {
      vi.mocked(checkInvoice).mockResolvedValue({ success: true, settled: false, amountPaid: '0', state: 'OPEN' } as any)

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'L402 mock-token:mock-macaroon' },
        body: JSON.stringify({ description: 'Unpaid post', reward: 1000 }),
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      const { data: posts } = await supabase.from('posts').select('id').eq('funding_r_hash', testPaymentHash)
      expect(posts).toEqual([])
    })
  })

  describe('Validation Errors', () => {
    it('should return 400 when description is missing', async () => {
      const postData = {
        reward: 1000,
      }

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Description is required')
    })

    it('should return 400 when reward is negative', async () => {
      const postData = {
        description: 'Test post',
        reward: -100,
      }

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('non-negative')
    })
  })

  describe('Authentication & Payment', () => {
    it('should return 401 when L402 verification fails', async () => {
      vi.mocked(verifyL402Token).mockResolvedValue({
        success: false,
        error: 'Invalid token',
      })

      const postData = {
        description: 'Test post',
        reward: 1000,
      }

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 verification failed')
    })

    it('should return 401 when payment amount does not match reward + fee', async () => {
      const postData = {
        description: 'Test post',
        reward: 1000,
      }

      // Payment amount is wrong (should be 1010)
      vi.mocked(verifyL402Token).mockResolvedValue({
        success: true,
        paymentHash: testPaymentHash,
        macaroon: {
          identifier: testPaymentHash,
          location: 'ganamos-api',
          signature: 'mock-signature',
          caveats: [
            { condition: 'action', value: 'create_post' },
            { condition: 'amount', value: '500' }, // Wrong amount
            { condition: 'expires', value: String(Date.now() + 3600000) },
          ],
        },
      })

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Payment amount mismatch')
      expect(data.error).toContain('Expected 1010 sats')
    })
  })

  describe('Database Integrity', () => {
    // Replay protection (3f4a002): the payment hash is recorded in l402_used_tokens
    // (PRIMARY KEY) before the post is created; a reused token gets 409 Conflict with the
    // existing post's id. (Previously skipped expecting a 500 from a posts unique constraint.)
    it('should not create duplicate posts with same payment hash', async () => {
      const postData = {
        description: 'First post',
        reward: 1000,
      }

      const request1 = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      // Create first post
      const response1 = await POST(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(201)
      createdPostIds.push(data1.post_id)

      // Try to create second post with same payment hash (don't change the mock, reuse same hash)
      const postData2 = {
        description: 'Second post',
        reward: 1000,
      }

      const request2 = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData2),
      })

      const response2 = await POST(request2)

      // Rejected as a replay of an already-used L402 token
      expect(response2.status).toBe(409)
      const data2 = await response2.json()
      expect(data2.error).toContain('already been used')
      expect(data2.existing_post_id).toBe(data1.post_id)
      if (data2.post_id) createdPostIds.push(data2.post_id)

      // Exactly one post exists for this payment, and the replay did not create another
      const { data: postsForHash, error } = await supabase
        .from('posts')
        .select('id, description')
        .eq('funding_r_hash', testPaymentHash)
      expect(error).toBeNull()
      expect(postsForHash).toHaveLength(1)
      expect(postsForHash![0].id).toBe(data1.post_id)
      const { count } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('description', 'Second post')
        .gte('created_at', new Date(Date.now() - 60_000).toISOString())
      expect(count).toBe(0)
    })

    it('should handle long descriptions', async () => {
      const longDescription = 'A'.repeat(1500) // Long but valid description

      const postData = {
        description: longDescription,
        reward: 100,
      }

      vi.mocked(verifyL402Token).mockResolvedValue({
        success: true,
        paymentHash: variantHash('-long'),
        macaroon: {
          identifier: variantHash('-long'),
          location: 'ganamos-api',
          signature: 'mock-signature',
          caveats: [
            { condition: 'action', value: 'create_post' },
            { condition: 'amount', value: '110' },
            { condition: 'expires', value: String(Date.now() + 3600000) },
          ],
        },
      })

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      createdPostIds.push(data.post_id)

      const { data: dbPost } = await supabase
        .from('posts')
        .select('description')
        .eq('id', data.post_id)
        .single()

      expect(dbPost.description).toBe(longDescription)
      expect(dbPost.description.length).toBe(1500)
    })
  })

  describe('Location Data Handling', () => {
    it('should store complete location data when provided', async () => {
      const postData = {
        description: 'Post with full location',
        reward: 200,
        location: 'New York, NY',
        latitude: 40.7128,
        longitude: -74.0060,
      }

      vi.mocked(verifyL402Token).mockResolvedValue({
        success: true,
        paymentHash: variantHash('-location'),
        macaroon: {
          identifier: variantHash('-location'),
          location: 'ganamos-api',
          signature: 'mock-signature',
          caveats: [
            { condition: 'action', value: 'create_post' },
            { condition: 'amount', value: '210' },
            { condition: 'expires', value: String(Date.now() + 3600000) },
          ],
        },
      })

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      createdPostIds.push(data.post_id)

      const { data: dbPost } = await supabase
        .from('posts')
        .select('city, location, latitude, longitude')
        .eq('id', data.post_id)
        .single()

      // API uses location field for both city and location
      expect(dbPost.city).toBe(postData.location)
      expect(dbPost.location).toBe(postData.location)
      expect(dbPost.latitude).toBe(postData.latitude)
      expect(dbPost.longitude).toBe(postData.longitude)
    })

    it('should handle posts without location data', async () => {
      const postData = {
        description: 'Post without location',
        reward: 150,
      }

      vi.mocked(verifyL402Token).mockResolvedValue({
        success: true,
        paymentHash: variantHash('-nolocation'),
        macaroon: {
          identifier: variantHash('-nolocation'),
          location: 'ganamos-api',
          signature: 'mock-signature',
          caveats: [
            { condition: 'action', value: 'create_post' },
            { condition: 'amount', value: '160' },
            { condition: 'expires', value: String(Date.now() + 3600000) },
          ],
        },
      })

      const request = new NextRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'L402 mock-token:mock-macaroon',
        },
        body: JSON.stringify(postData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      createdPostIds.push(data.post_id)

      const { data: dbPost } = await supabase
        .from('posts')
        .select('city, location, latitude, longitude')
        .eq('id', data.post_id)
        .single()

      expect(dbPost.city).toBeNull()
      expect(dbPost.location).toBeNull()
      expect(dbPost.latitude).toBeNull()
      expect(dbPost.longitude).toBeNull()
    })
  })
})
