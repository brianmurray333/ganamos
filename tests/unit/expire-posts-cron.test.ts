import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from '@/app/api/cron/expire-posts/route'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as transactionEmails from '@/lib/transaction-emails'

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

    it('should allow request with x-vercel-cron header', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
    })

    it('should allow request with x-vercel-id header', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-id': 'cron_12345' },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
    it('should expire post and refund balance', async () => {
      const expiredPost = {
        id: 'post-1',
        user_id: 'user-1',
        title: 'Expired Post',
        reward: 1000,
        assigned_to: null,
      }

      const profile = {
        balance: 5000,
        email: 'user@example.com',
        name: 'Test User',
      }

      // Mock warning posts (none)
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      
      // Mock expired posts query
      mockSupabase.not.mockResolvedValueOnce({ data: [expiredPost], error: null })
      
      // Mock soft-delete update
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      
      // Mock activity insert
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      
      // Mock profile query
      mockSupabase.single.mockResolvedValueOnce({ data: profile, error: null })
      
      // Mock balance update
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      
      // Mock transaction insert
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      
      // Mock skipped posts (none)
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.expired).toBe(1)

      // Verify update was called for soft-delete
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      )

      // Verify balance update
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 6000 })
      )

      // Verify transaction insert
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          type: 'internal',
          amount: 1000,
          status: 'completed',
        })
      )

      // Verify confirmation email
      expect(transactionEmails.sendPostExpiredConfirmationEmail).toHaveBeenCalledWith({
        toEmail: 'user@example.com',
        userName: 'Test User',
        postTitle: 'Expired Post',
        refundAmountSats: 1000,
        postId: 'post-1',
      })
    })

    it('should clear assigned_to and notify fixer', async () => {
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
        email: 'fixer@example.com',
        name: 'Fixer User',
      }

      // Mock warning posts (none)
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      
      // Mock expired posts query
      mockSupabase.not.mockResolvedValueOnce({ data: [expiredPost], error: null })
      
      // Mock soft-delete, activity, owner profile, balance update, transaction
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.single.mockResolvedValueOnce({ data: ownerProfile, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      
      // Mock fixer profile query
      mockSupabase.single.mockResolvedValueOnce({ data: fixerProfile, error: null })
      
      // Mock clear assignment
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      
      // Mock skipped posts (none)
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      await GET(request)

      // Verify assigned_to cleared
      expect(mockSupabase.update).toHaveBeenCalledWith({ assigned_to: null })

      // Verify fixer email sent
      expect(transactionEmails.sendPostExpiredFixerEmail).toHaveBeenCalledWith({
        toEmail: 'fixer@example.com',
        fixerName: 'Fixer User',
        postTitle: 'Expired Post',
        postId: 'post-1',
      })
    })

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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
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
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Database configuration missing')
    })

    it('should handle confirmation email errors gracefully', async () => {
      const expiredPost = {
        id: 'post-1',
        user_id: 'user-1',
        title: 'Test Post',
        reward: 1000,
        assigned_to: null,
      }

      const profile = {
        balance: 5000,
        email: 'user@example.com',
        name: 'Test User',
      }

      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [expiredPost], error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
      mockSupabase.not.mockResolvedValueOnce({ data: [], error: null })

      vi.mocked(transactionEmails.sendPostExpiredConfirmationEmail).mockRejectedValueOnce(
        new Error('Email failed')
      )

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Confirmation email failed for post post-1'),
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should handle fixer email errors gracefully', async () => {
      const expiredPost = {
        id: 'post-1',
        user_id: 'user-1',
        title: 'Test Post',
        reward: 1000,
        assigned_to: 'fixer-1',
      }

      const ownerProfile = {
        balance: 5000,
        email: 'user@example.com',
        name: 'Test User',
      }

      const fixerProfile = {
        email: 'fixer@example.com',
        name: 'Fixer User',
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

      vi.mocked(transactionEmails.sendPostExpiredFixerEmail).mockRejectedValueOnce(
        new Error('Email failed')
      )

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fixer email failed for post post-1'),
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })
})
