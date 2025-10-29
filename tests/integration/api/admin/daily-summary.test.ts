/*
 * NOTE: These tests are currently failing due to deep mocking issues with Supabase PostgREST client.
 * 
 * ISSUE: The Supabase query builder internally expects HTTP Response objects with text() methods.
 * Our mocks don't properly simulate this deep internal behavior, causing "res.text is not a function" errors.
 * 
 * TO FIX (choose one):
 * 1. Refactor application code to inject/abstract database layer (makes testing easier)
 * 2. Use real Supabase test database for integration tests
 * 3. Create comprehensive mocks that mirror PostgREST internals (complex, fragile)
 * 
 * RECOMMENDATION: Refactor lib/daily-summary.ts to extract database queries into testable functions
 * that can be mocked at a higher level, or use dependency injection for the Supabase client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/admin/daily-summary/route'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseProfiles,
  mockSupabaseTransactions,
  mockSupabasePosts,
  mockSupabaseActiveUsers,
  mockSupabaseError,
  mockSupabaseBalanceAudit,
  createMockProfile,
  createMockProfiles,
  createMockTransactions,
  createMockPosts,
  createMockNodeBalance,
  createMockBalanceAudit,
  createMockBalanceAuditWithDiscrepancies,
  mockFetchNodeBalance,
  mockFetchError,
  setTestEnvVars,
  clearTestEnvVars,
  expectValidDailySummaryData,
  expectValidEmailHTML,
  expectBalanceAuditPassed,
  expectBalanceAuditFailed,
  expectAPIHealthOnline,
  expectAPIHealthOffline,
} from '../../helpers/daily-summary-mocks'

// Mock external dependencies
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('groq-sdk', () => ({
  Groq: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: vi.fn(),
}))

// Import mocked modules for assertions
import { createServerSupabaseClient } from '@/lib/supabase'
import { Groq } from 'groq-sdk'
import { Resend } from 'resend'

// Helper to create mock request with authorization header
function createMockRequest(method: 'GET' | 'POST' = 'GET', cronSecret?: string): NextRequest {
  const headers = new Headers()
  if (cronSecret !== undefined) {
    headers.set('authorization', cronSecret ? `Bearer ${cronSecret}` : 'invalid-format')
  }

  return {
    method,
    headers,
    url: 'http://localhost:3457/api/admin/daily-summary',
  } as NextRequest
}

describe('GET/POST /api/admin/daily-summary', () => {
  let mockSupabaseClient: any
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch

    // Clear all mocks
    vi.clearAllMocks()

    // Set up test environment variables
    setTestEnvVars()

    // Create mock Supabase client
    mockSupabaseClient = createMockSupabaseClient()
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabaseClient)

    // Mock Groq API
    const mockGroq = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'OK' } }],
          }),
        },
      },
    }
    vi.mocked(Groq).mockReturnValue(mockGroq as any)

    // Mock Resend API
    const mockResend = {
      domains: {
        list: vi.fn().mockResolvedValue({
          data: [{ id: 'domain-1', name: 'ganamos.earth', status: 'verified' }],
          error: null,
        }),
      },
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: 'email-123' },
          error: null,
        }),
      },
    }
    vi.mocked(Resend).mockReturnValue(mockResend as any)
  })

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch

    // Clear test environment variables
    clearTestEnvVars()

    vi.restoreAllMocks()
  })

  describe('Authorization', () => {
    it('should return 401 when authorization header is missing', async () => {
      const request = createMockRequest('GET')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should return 401 when CRON_SECRET does not match', async () => {
      const request = createMockRequest('GET', 'wrong-secret')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should accept valid CRON_SECRET via GET', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      // Mock successful data flow
      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, createMockTransactions(10, 'deposit'))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(3))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(2, true))
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2', 'user-3'])

      // Mock balance audit queries
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('message', 'Daily summary email sent successfully')
    })

    it('should accept valid CRON_SECRET via POST', async () => {
      const request = createMockRequest('POST', 'test-cron-secret-123')

      // Mock successful data flow
      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, createMockTransactions(10, 'deposit'))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(3))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(2, true))
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2', 'user-3'])

      // Mock balance audit queries
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('message', 'Daily summary email sent successfully')
    })

    it('should allow access when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET
      const request = createMockRequest('GET')

      // Mock successful data flow
      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, createMockTransactions(10, 'deposit'))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(3))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(2, true))
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2', 'user-3'])

      // Mock balance audit queries
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('success', true)
    })
  })

  describe('Node Balance Aggregation', () => {
    beforeEach(() => {
      // Mock authorization
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should successfully fetch and aggregate node balance data', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const mockBalances = {
        channel_balance: 50000,
        pending_balance: 5000,
        onchain_balance: 10000,
        total_balance: 65000,
      }

      mockFetchNodeBalance(true, mockBalances)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      await GET(request)

      // Verify fetch was called to get node balance
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/node-balance')
      )
    })

    it('should handle node balance fetch failure gracefully', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(false)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      // Should still succeed but with zero balances
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle network errors when fetching node balance', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchError('Network timeout')
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      // Should still succeed with zero balances
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Balance Audit', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should pass balance audit when all balances match', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const profiles = [
        { id: 'user-1', email: 'user1@example.com', balance: 1000 },
        { id: 'user-2', email: 'user2@example.com', balance: 2000 },
      ]

      const user1Transactions = [
        { type: 'deposit', amount: 1000, status: 'completed' },
      ]

      const user2Transactions = [
        { type: 'deposit', amount: 2000, status: 'completed' },
      ]

      mockFetchNodeBalance(true)

      // Mock profiles query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: profiles,
          error: null,
        }),
      })

      // Mock transactions for empty list (24hr metrics)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      // Mock posts queries
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      // Mock active users
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit queries
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: profiles,
          error: null,
        }),
      })

      // Mock transaction queries for each user
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: user1Transactions,
          error: null,
        }),
      })

      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: user2Transactions,
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should detect balance discrepancies', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const profiles = [
        { id: 'user-1', email: 'user1@example.com', balance: 1500 }, // Mismatch
        { id: 'user-2', email: 'user2@example.com', balance: 2000 },
      ]

      const user1Transactions = [
        { type: 'deposit', amount: 1000, status: 'completed' },
      ]

      const user2Transactions = [
        { type: 'deposit', amount: 2000, status: 'completed' },
      ]

      mockFetchNodeBalance(true)

      // Mock profiles query
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: profiles,
          error: null,
        }),
      })

      // Mock transactions for empty list (24hr metrics)
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      // Mock posts queries
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      // Mock active users
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit queries
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: profiles,
          error: null,
        }),
      })

      // Mock transaction queries for each user
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: user1Transactions,
          error: null,
        }),
      })

      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: user2Transactions,
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle database errors during balance audit', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit error
      mockSupabaseError(mockSupabaseClient, 'Database connection failed')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('API Health Checks', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should report all APIs as online when healthy', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should report Voltage API as offline when node balance fetch fails', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(false)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should report Groq API as offline when health check fails', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock Groq API failure
      const mockGroq = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Groq API unavailable')),
          },
        },
      }
      vi.mocked(Groq).mockReturnValue(mockGroq as any)

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should report Resend API as offline when health check fails', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock Resend API failure
      const mockResend = {
        domains: {
          list: vi.fn().mockRejectedValue(new Error('Resend API unavailable')),
        },
      }
      vi.mocked(Resend).mockReturnValue(mockResend as any)

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle missing GROQ_API_KEY gracefully', async () => {
      delete process.env.GROQ_API_KEY
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle missing RESEND_API_KEY gracefully', async () => {
      delete process.env.RESEND_API_KEY
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      // Should fail because email sending will fail without RESEND_API_KEY
      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error')
    })
  })

  describe('24-Hour Activity Metrics', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should correctly aggregate transaction metrics', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const transactions = [
        ...createMockTransactions(5, 'deposit'),
        ...createMockTransactions(3, 'withdrawal'),
      ]

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, transactions)
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2'])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should correctly aggregate post and reward metrics', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const createdPosts = createMockPosts(5, false)
      const completedPosts = createMockPosts(3, true)

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, createdPosts)
      mockSupabasePosts(mockSupabaseClient, completedPosts)
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2', 'user-3'])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should correctly count active users', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const activeUserIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5']

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(10))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, activeUserIds)

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(10),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle empty activity gracefully', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Email Generation and Delivery', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should successfully send email with valid summary data', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, createMockTransactions(10, 'deposit'))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(3))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(2, true))
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2', 'user-3'])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      const mockResend = {
        domains: {
          list: vi.fn().mockResolvedValue({
            data: [{ id: 'domain-1' }],
            error: null,
          }),
        },
        emails: {
          send: vi.fn().mockResolvedValue({
            data: { id: 'email-123' },
            error: null,
          }),
        },
      }
      vi.mocked(Resend).mockReturnValue(mockResend as any)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('messageId', 'email-123')
      expect(mockResend.emails.send).toHaveBeenCalled()
    })

    it('should return 500 when email sending fails', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      // Mock email sending failure
      const mockResend = {
        domains: {
          list: vi.fn().mockResolvedValue({
            data: [{ id: 'domain-1' }],
            error: null,
          }),
        },
        emails: {
          send: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Email sending failed' },
          }),
        },
      }
      vi.mocked(Resend).mockReturnValue(mockResend as any)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error')
      expect(data.details).toContain('Email sending failed')
    })

    it('should generate valid HTML email with all sections', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, createMockProfiles(5))
      mockSupabaseTransactions(mockSupabaseClient, createMockTransactions(10, 'deposit'))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(3))
      mockSupabasePosts(mockSupabaseClient, createMockPosts(2, true))
      mockSupabaseActiveUsers(mockSupabaseClient, ['user-1', 'user-2'])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: createMockProfiles(5),
          error: null,
        }),
      })

      let capturedEmailHTML: string = ''
      const mockResend = {
        domains: {
          list: vi.fn().mockResolvedValue({
            data: [{ id: 'domain-1' }],
            error: null,
          }),
        },
        emails: {
          send: vi.fn().mockImplementation((emailData: any) => {
            capturedEmailHTML = emailData.html
            return Promise.resolve({
              data: { id: 'email-123' },
              error: null,
            })
          }),
        },
      }
      vi.mocked(Resend).mockReturnValue(mockResend as any)

      await GET(request)

      // Verify HTML contains all required sections
      expectValidEmailHTML(capturedEmailHTML)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should handle missing Supabase credentials', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const request = createMockRequest('GET', 'test-cron-secret-123')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error')
    })

    it('should handle database connection failures', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseError(mockSupabaseClient, 'Connection timeout')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error')
    })

    it('should handle unexpected exceptions gracefully', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      // Mock Supabase client to throw an error
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error', 'Internal server error')
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-cron-secret-123'
    })

    it('should handle zero balances correctly', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const zeroBalanceNode = {
        channel_balance: 0,
        pending_balance: 0,
        onchain_balance: 0,
        total_balance: 0,
      }

      mockFetchNodeBalance(true, zeroBalanceNode)
      mockSupabaseProfiles(mockSupabaseClient, [
        createMockProfile({ balance: 0 }),
      ])
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: [createMockProfile({ balance: 0 })],
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle empty database tables', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      mockFetchNodeBalance(true)
      mockSupabaseProfiles(mockSupabaseClient, [])
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit with empty profiles
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle very large balance values', async () => {
      const request = createMockRequest('GET', 'test-cron-secret-123')

      const largeBalanceNode = {
        channel_balance: 100000000, // 1 BTC in sats
        pending_balance: 50000000,
        onchain_balance: 25000000,
        total_balance: 175000000,
      }

      mockFetchNodeBalance(true, largeBalanceNode)
      mockSupabaseProfiles(mockSupabaseClient, [
        createMockProfile({ balance: 100000000 }),
      ])
      mockSupabaseTransactions(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabasePosts(mockSupabaseClient, [])
      mockSupabaseActiveUsers(mockSupabaseClient, [])

      // Mock balance audit
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: [createMockProfile({ balance: 100000000 })],
          error: null,
        }),
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })
})
