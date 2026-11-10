import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from '@/app/api/cron/expire-posts/route'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as transactionEmails from '@/lib/transaction-emails'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock email functions
vi.mock('@/lib/transaction-emails', () => ({
  sendPostExpiryWarningEmail: vi.fn().mockResolvedValue(undefined),
  sendPostExpiredConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendPostExpiredFixerEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-12345'),
}))

describe('POST Expiration Cron - Unit Tests', () => {
  let mockSupabase: any
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Store original env
    originalEnv = { ...process.env }

    // Set up test environment
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SECRET_API_KEY = 'test-service-key'

    // Reset all mocks
    vi.clearAllMocks()

    // Queue for storing mocked responses
    const responseQueue: any[] = []

    // Create a mock Supabase client with method chaining that's also thenable
    mockSupabase = {
      from: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      is: vi.fn(),
      lte: vi.fn(),
      gt: vi.fn(),
      single: vi.fn(),
      then: vi.fn(),
    }

    // Make all methods return the mockSupabase object itself for chaining
    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.insert.mockReturnValue(mockSupabase)
    mockSupabase.update.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.not.mockReturnValue(mockSupabase)
    mockSupabase.is.mockReturnValue(mockSupabase)
    mockSupabase.lte.mockReturnValue(mockSupabase)
    mockSupabase.gt.mockReturnValue(mockSupabase)
    mockSupabase.single.mockReturnValue(mockSupabase)

    // Make it thenable - when awaited, dequeue and return the next response
    mockSupabase.then.mockImplementation((onFulfilled: any) => {
      const response = responseQueue.shift() || { data: [], error: null }
      return Promise.resolve(response).then(onFulfilled)
    })

    // Helper to add responses to the queue
    const queueResponse = (response: any) => {
      responseQueue.push(response)
    }

    // Override mockResolvedValueOnce for the methods to queue responses
    const originalMethods = {
      not: mockSupabase.not.mockResolvedValueOnce,
      eq: mockSupabase.eq.mockResolvedValueOnce,
      single: mockSupabase.single.mockResolvedValueOnce,
    }

    mockSupabase.not.mockResolvedValueOnce = vi.fn((response: any) => {
      queueResponse(response)
      return mockSupabase
    })

    mockSupabase.eq.mockResolvedValueOnce = vi.fn((response: any) => {
      queueResponse(response)
      return mockSupabase
    })

    mockSupabase.single.mockResolvedValueOnce = vi.fn((response: any) => {
      queueResponse(response)
      return mockSupabase
    })

    // Mock createClient to return our mock
    vi.mocked(createClient).mockReturnValue(mockSupabase as any)
  })

  afterEach(() => {
    // Restore original env
    process.env = originalEnv
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 when neither Vercel headers nor Bearer token are present', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    // SECURITY: x-vercel-cron / x-vercel-id are spoofable (anyone can send the
    // former; Vercel adds the latter to every request). Only the bearer secret counts.
    it('should reject a spoofed x-vercel-cron header without the bearer secret', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
      expect(createClient).not.toHaveBeenCalled()
    })

    it('should reject an x-vercel-id header without the bearer secret', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-id': 'cron_12345' },
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
      expect(createClient).not.toHaveBeenCalled()
    })

    it('should fail closed when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET
      for (const headers of [
        {},
        { authorization: 'Bearer undefined' },
        { authorization: 'Bearer ' },
        { 'x-vercel-cron': '1' },
      ] as Record<string, string>[]) {
        const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
          method: 'GET',
          headers,
        })
        const response = await GET(request)
        expect(response.status).toBe(401)
      }
      expect(createClient).not.toHaveBeenCalled()
    })

    it('should allow request with valid Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
    })

    it('should reject request with invalid Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer wrong-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Warning Email Flow', () => {
    it('should send warning email for posts expiring in 5 hours', async () => {
      const fiveHoursFromNow = new Date(Date.now() + 5 * 3600_000).toISOString()
      
      // Setup mock to return warning posts
      const warningPost = {
        id: 'post-1',
        title: 'Test Post',
        user_id: 'user-1',
        expires_at: fiveHoursFromNow,
      }

      const profile = {
        email: 'user@example.com',
        name: 'Test User',
      }

      // Mock the warning posts query (first .not() call)
      mockSupabase.not.mockResolvedValueOnce({ data: [warningPost], error: null })
      
      // Mock the profile query
      mockSupabase.single.mockResolvedValueOnce({ data: profile, error: null })

      // Mock the update query
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

      // Mock remaining queries (expired posts and skipped posts)
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.warned).toBe(1)
      expect(transactionEmails.sendPostExpiryWarningEmail).toHaveBeenCalledWith({
        toEmail: 'user@example.com',
        userName: 'Test User',
        postTitle: 'Test Post',
        expiresAt: new Date(fiveHoursFromNow),
        postId: 'post-1',
      })
    })

    it('should NOT send warning email to @ganamos.app addresses', async () => {
      const fiveHoursFromNow = new Date(Date.now() + 5 * 3600_000).toISOString()
      
      const warningPost = {
        id: 'post-1',
        title: 'Test Post',
        user_id: 'user-1',
        expires_at: fiveHoursFromNow,
      }

      const profile = {
        email: 'anonymous@ganamos.app',
        name: 'Anonymous User',
      }

      mockSupabase.not.mockResolvedValueOnce({ data: [warningPost], error: null })
      mockSupabase.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      await GET(request)

      expect(transactionEmails.sendPostExpiryWarningEmail).not.toHaveBeenCalled()
    })

    it('should handle warning email send errors gracefully', async () => {
      const fiveHoursFromNow = new Date(Date.now() + 5 * 3600_000).toISOString()
      
      const warningPost = {
        id: 'post-1',
        title: 'Test Post',
        user_id: 'user-1',
        expires_at: fiveHoursFromNow,
      }

      const profile = {
        email: 'user@example.com',
        name: 'Test User',
      }

      mockSupabase.not.mockResolvedValueOnce({ data: [warningPost], error: null })
      mockSupabase.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      vi.mocked(transactionEmails.sendPostExpiryWarningEmail).mockRejectedValueOnce(
        new Error('Email send failed')
      )

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning email failed for post post-1'),
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Post Expiration Flow', () => {
    it('should NOT send fixer email to @ganamos.app addresses', async () => {
      const expiredPost = {
        id: 'post-1',
        user_id: 'user-1',
        title: 'Expired Post',
        reward: 1000,
        assigned_to: 'fixer-1',
      }

      const ownerProfile = {
        balance: 5000,
        email: 'user@example.com',
        name: 'Test User',
      }

      const fixerProfile = {
        email: 'anonymous@ganamos.app',
        name: 'Anonymous Fixer',
      }

      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [expiredPost], error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.single.mockResolvedValueOnce({ data: ownerProfile, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.single.mockResolvedValueOnce({ data: fixerProfile, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      await GET(request)

      expect(transactionEmails.sendPostExpiredFixerEmail).not.toHaveBeenCalled()
    })

    it('should handle anonymous posts without error', async () => {
      const expiredPost = {
        id: 'post-1',
        user_id: null,
        title: 'Anonymous Post',
        reward: 1000,
        assigned_to: null,
      }

      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [expiredPost], error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.expired).toBe(1)

      // Should NOT attempt refund or email
      expect(transactionEmails.sendPostExpiredConfirmationEmail).not.toHaveBeenCalled()
    })

    it('should handle posts with zero reward', async () => {
      const expiredPost = {
        id: 'post-1',
        user_id: 'user-1',
        title: 'Free Post',
        reward: 0,
        assigned_to: null,
      }

      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [expiredPost], error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)

      expect(response.status).toBe(200)

      // Should soft-delete but NOT create transaction or refund
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      )
      
      // Verify no transaction insert for zero reward
      const insertCalls = mockSupabase.insert.mock.calls
      const hasTransactionInsert = insertCalls.some((call: any) => 
        call[0]?.type === 'internal'
      )
      expect(hasTransactionInsert).toBe(false)
    })
  })

  describe('Under Review Skip Flow', () => {
    it('should skip posts that are under_review', async () => {
      const skippedPosts = [
        { id: 'post-1' },
        { id: 'post-2' },
      ]

      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: skippedPosts, error: null })

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.skipped).toBe(2)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Skipped 2 posts under review — will re-evaluate next run'
      )

      consoleLogSpy.mockRestore()
    })

    it('should NOT log when no posts are skipped', async () => {
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      await GET(request)

      expect(consoleLogSpy).not.toHaveBeenCalled()

      consoleLogSpy.mockRestore()
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when Supabase URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Database configuration missing')
    })

    it('should return 500 when Supabase service key is missing', async () => {
      delete process.env.SUPABASE_SECRET_API_KEY

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Database configuration missing')
    })

  })

  // --------------------------------------------------------------------------
  // Expiration refunds against the stateful fake DB: assertions on balances,
  // refund transactions and post state, not on call order.
  // --------------------------------------------------------------------------
  describe('Expiration refunds (stateful)', () => {
    const OWNER = 'user-1'
    const FIXER = 'fixer-1'
    const PAST = '2026-01-01T00:00:00.000Z'
    let db: FakeSupabase

    function setupDb(post: Record<string, any> = {}, extra: Record<string, any[]> = {}) {
      db = createFakeSupabase({
        posts: [{
          id: 'post-1', user_id: OWNER, title: 'Expired Post', reward: 1000, assigned_to: null,
          expires_at: PAST, deleted_at: null, fixed: false, under_review: false,
          created_at: '2026-11-08T12:00:00.000Z', funding_transaction_id: 'funding-tx', ...post,
        }],
        profiles: [
          { id: OWNER, balance: 5000, email: 'user@example.com', name: 'Test User' },
          { id: FIXER, balance: 0, email: 'fixer@example.com', name: 'Fixer User' },
        ],
        transactions: [{ id: 'funding-tx', user_id: OWNER, type: 'internal', status: 'completed', amount: -1000 }],
        activities: [],
        ...extra,
      })
      vi.mocked(createClient).mockReturnValue(db.adminClient as any)
      return db
    }
    const run = () =>
      GET(new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      }))
    const balance = (id: string) => db.row('profiles', id)!.balance
    const refunds = () => db.rows('transactions', t => t.amount > 0)

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('expires the post, refunds the funded reward once and emails the owner', async () => {
      setupDb()

      const response = await run()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({ success: true, expired: 1 })
      expect(db.row('posts', 'post-1')!.deleted_at).toBeTruthy()
      expect(balance(OWNER)).toBe(6000)
      expect(refunds()).toEqual([
        expect.objectContaining({ user_id: OWNER, type: 'internal', amount: 1000, status: 'completed', memo: 'Refund for expired post: Expired Post' }),
      ])
      expect(db.rows('activities', a => a.type === 'post_expired')).toHaveLength(1)
      expect(transactionEmails.sendPostExpiredConfirmationEmail).toHaveBeenCalledWith({
        toEmail: 'user@example.com',
        userName: 'Test User',
        postTitle: 'Expired Post',
        refundAmountSats: 1000,
        postId: 'post-1',
      })
    })

    it('running the cron twice refunds once', async () => {
      setupDb()

      await run()
      await run()

      expect(balance(OWNER)).toBe(6000)
      expect(refunds()).toHaveLength(1)
    })

    it('does not expire or refund a post with a reward payout in flight', async () => {
      setupDb({ anonymous_reward_payment_lock: 'payout-in-flight' })

      await run()

      expect(db.row('posts', 'post-1')!.deleted_at).toBeFalsy()
      expect(balance(OWNER)).toBe(5000)
      expect(refunds()).toHaveLength(0)
    })

    it('does not refund a reward that was already paid', async () => {
      setupDb({ reward_paid_at: '2026-11-08T12:30:00.000Z' })

      await run()

      expect(balance(OWNER)).toBe(5000)
      expect(refunds()).toHaveLength(0)
    })

    it('two overlapping runs refund once (conditional soft delete)', async () => {
      setupDb()
      db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update' && 'deleted_at' in (op.payload || {}))

      await Promise.all([run(), run()])

      expect(balance(OWNER)).toBe(6000)
      expect(refunds()).toHaveLength(1)
      expect(db.rows('activities', a => a.type === 'post_expired')).toHaveLength(1)
    })

    it('skips the refund when the owner deleted the post concurrently', async () => {
      setupDb()
      db.beforeOp = op => {
        if (op.table === 'posts' && op.op === 'update' && 'deleted_at' in (op.payload || {})) {
          db.row('posts', 'post-1')!.deleted_at = '2026-11-08T13:00:00.000Z'
        }
      }

      await run()

      expect(balance(OWNER)).toBe(5000)
      expect(refunds()).toHaveLength(0)
    })

    it('expires but does not refund an unfunded reward (no funding link)', async () => {
      setupDb({ funding_transaction_id: null, reward: 100_000 })

      const response = await run()

      expect(response.status).toBe(200)
      expect(db.row('posts', 'post-1')!.deleted_at).toBeTruthy()
      expect(balance(OWNER)).toBe(5000)
      expect(refunds()).toHaveLength(0)
      expect(transactionEmails.sendPostExpiredConfirmationEmail).not.toHaveBeenCalled()
    })

    it('does not refund when the linked funding transaction is not a completed deduction by the owner', async () => {
      setupDb({}, { transactions: [{ id: 'funding-tx', user_id: FIXER, type: 'internal', status: 'completed', amount: -1000 }] })

      await run()

      expect(balance(OWNER)).toBe(5000)
      expect(refunds()).toHaveLength(0)
    })

    it('clears the assignment and notifies the assigned fixer', async () => {
      setupDb({ assigned_to: FIXER })

      await run()

      expect(db.row('posts', 'post-1')!.assigned_to).toBeNull()
      expect(transactionEmails.sendPostExpiredFixerEmail).toHaveBeenCalledWith({
        toEmail: 'fixer@example.com',
        fixerName: 'Fixer User',
        postTitle: 'Expired Post',
        postId: 'post-1',
      })
    })

    it('still succeeds (refund done) when the confirmation email fails', async () => {
      setupDb()
      vi.mocked(transactionEmails.sendPostExpiredConfirmationEmail).mockRejectedValueOnce(new Error('Email failed'))

      const response = await run()

      expect(response.status).toBe(200)
      expect(balance(OWNER)).toBe(6000)
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Confirmation email failed for post post-1'), expect.any(Error))
    })

    it('still succeeds when the fixer email fails', async () => {
      setupDb({ assigned_to: FIXER })
      vi.mocked(transactionEmails.sendPostExpiredFixerEmail).mockRejectedValueOnce(new Error('Email failed'))

      const response = await run()

      expect(response.status).toBe(200)
      expect(db.row('posts', 'post-1')!.assigned_to).toBeNull()
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Fixer email failed for post post-1'), expect.any(Error))
    })
  })
})
