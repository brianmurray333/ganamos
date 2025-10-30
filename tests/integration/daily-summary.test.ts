import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Integration Tests for /api/admin/daily-summary Endpoint
 *
 * Tests the complete daily summary workflow:
 * 1. Authorization via CRON_SECRET Bearer token
 * 2. Data aggregation across 5 categories:
 *    - Node balance (via /api/admin/node-balance)
 *    - Balance audit (profile balance vs transaction history)
 *    - API health checks (Voltage, Groq, Resend)
 *    - 24-hour activity metrics (transactions, posts, users)
 *    - Email delivery via Resend API
 * 3. Error handling for external service failures
 *
 * These tests use mocks to validate the workflow without requiring real database or external APIs.
 */

// Mock external services BEFORE imports
vi.mock('groq-sdk', () => ({
  Groq: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: vi.fn(),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
}))

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

describe('GET/POST /api/admin/daily-summary Integration Tests', () => {
  let mockFetch: any
  let mockSupabaseClient: any
  let mockGroqClient: any
  let mockResendClient: any
  let mockSendEmail: any

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()
    vi.resetModules()

    // Mock global fetch for /api/admin/node-balance calls
    mockFetch = vi.fn()
    global.fetch = mockFetch

    // Mock Supabase client with chainable query builder
    // Helper to create a chainable mock that can be awaited
    const createChainableMock = (defaultData: any = { data: null, error: null }) => {
      const chain: any = {
        then: (resolve: any) => resolve(defaultData),  // Make it thenable for await
      }
      chain.select = vi.fn().mockReturnValue(chain)
      chain.neq = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.gte = vi.fn().mockReturnValue(chain)
      chain.order = vi.fn().mockResolvedValue(defaultData)
      return chain
    }

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          const profileData = {
            data: [
              { id: 'user-1', email: 'test1@example.com', balance: 5000 },
              { id: 'user-2', email: 'test2@example.com', balance: 3000 },
            ],
            error: null,
          }
          const chain = createChainableMock(profileData)
          chain.order = vi.fn().mockResolvedValue(profileData)
          return chain
        }
        if (table === 'transactions') {
          const mockData = {
            data: [
              { type: 'deposit', amount: 1000, status: 'completed', user_id: 'user-1' },
              { type: 'withdrawal', amount: 500, status: 'completed', user_id: 'user-1' },
            ],
            error: null,
          }
          
          const chain = createChainableMock(mockData)
          
          // Override eq to handle multiple calls - returns chain first, then resolves
          let eqCallCount = 0
          chain.eq = vi.fn(() => {
            eqCallCount++
            if (eqCallCount === 1) {
              return chain  // First call returns chain for chaining
            }
            return Promise.resolve(mockData)  // Second call resolves
          })
          
          // Also set up gte to handle gte().eq() pattern
          chain.gte = vi.fn().mockReturnValue({
            ...chain,
            eq: vi.fn().mockResolvedValue(mockData)
          })
          
          return chain
        }
        if (table === 'posts') {
          const postData = {
            data: [
              { reward: 100 },
              { reward: 200 },
            ],
            error: null,
          }
          const chain = createChainableMock(postData)
          chain.eq = vi.fn().mockResolvedValue(postData)
          return chain
        }
        return createChainableMock()
      }),
      rpc: vi.fn().mockResolvedValue({
        data: ['user-1', 'user-2'],
        error: null,
      }),
    }

    // Mock Groq API client
    mockGroqClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: 'OK',
                },
              },
            ],
          }),
        },
      },
    }

    // Mock Resend API client
    mockResendClient = {
      domains: {
        list: vi.fn().mockResolvedValue({
          data: [{ id: 'domain-1', name: 'ganamos.earth' }],
        }),
      },
    }

    // Import mocked modules
    const { Groq } = await import('groq-sdk')
    const { Resend } = await import('resend')
    const { createClient } = await import('@supabase/supabase-js')
    const { sendEmail } = await import('@/lib/email')

    // Configure mocks
    vi.mocked(Groq).mockImplementation(() => mockGroqClient as any)
    vi.mocked(Resend).mockImplementation(() => mockResendClient as any)
    vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any)
    
    mockSendEmail = vi.mocked(sendEmail)
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: 'test-message-id-123',
    })

    // Mock /api/admin/node-balance fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        balances: {
          channel_balance: 5000000,
          pending_balance: 100000,
          onchain_balance: 200000,
          total_balance: 5300000,
        },
      }),
    })

    // Set test environment variables
    process.env.CRON_SECRET = 'test-cron-secret-123'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3457'
    process.env.GROQ_API_KEY = 'test-groq-key'
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    delete (global as any).fetch
  })

  /**
   * Helper to create a mock NextRequest with optional Authorization header
   */
  function createMockRequest(
    method: 'GET' | 'POST' = 'GET',
    authToken?: string
  ): NextRequest {
    const headers = new Headers()
    if (authToken !== undefined) {
      headers.set('Authorization', authToken)
    }

    return {
      url: 'http://localhost:3457/api/admin/daily-summary',
      headers,
      method,
    } as NextRequest
  }

  describe('Authorization - CRON_SECRET Validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
      expect(mockSendEmail).not.toHaveBeenCalled()
    })

    it('should return 401 when Authorization header has incorrect format (missing Bearer)', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'test-cron-secret-123')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should return 401 when CRON_SECRET does not match', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer wrong-secret')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should return 200 when CRON_SECRET matches (GET method)', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Daily summary email sent successfully')
      expect(data.messageId).toBe('test-message-id-123')
    })

    it('should return 200 when CRON_SECRET matches (POST method)', async () => {
      // Arrange
      const { POST } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('POST', 'Bearer test-cron-secret-123')

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Daily summary email sent successfully')
    })
  })

  describe('GET Method - Data Aggregation', () => {
    it('should aggregate node balance from /api/admin/node-balance endpoint', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3457/api/admin/node-balance'
      )
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains node balance data
      const emailCall = mockSendEmail.mock.calls[0]
      expect(emailCall[2]).toContain('5,300,000 sats') // total_balance formatted
    })

    it('should aggregate app total balance from profiles table', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles')
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains app balance data (5000 + 3000 = 8000)
      const emailCall = mockSendEmail.mock.calls[0]
      expect(emailCall[2]).toContain('8,000 sats')
    })

    it('should aggregate 24-hour transaction metrics', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transactions')
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains transaction data
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Total Transactions')
      expect(emailHTML).toContain('Deposits')
      expect(emailHTML).toContain('Withdrawals')
    })

    it('should aggregate 24-hour post metrics (rewards and earnings)', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts')
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains post metrics
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('New Posts Created')
      expect(emailHTML).toContain('Posts Completed')
    })

    it('should aggregate active users count via RPC call', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'get_active_users_last_24h',
        expect.objectContaining({
          since_timestamp: expect.any(String),
        })
      )
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains active users count
      const emailCall = mockSendEmail.mock.calls[0]
      expect(emailCall[2]).toContain('Active Users')
    })

    it('should perform balance audit and report results', async () => {
      // Arrange - Create discrepancy by setting profile balance different from transaction-derived balance
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'profiles') {
          const profileData = {
            data: [{ id: 'user-1', email: 'test@example.com', balance: 5000 }],
            error: null,
          }
          return {
            select: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue(profileData),
          }
        }
        if (table === 'transactions') {
          const txData = {
            data: [
              { type: 'deposit', amount: 3000, status: 'completed' },
            ],
            error: null,
          }
          const chain: any = {
            select: vi.fn().mockReturnThis(),
          }
          // Handle .select().eq().eq() for balance audit - first eq returns chain, second resolves
          chain.eq = vi.fn().mockReturnValueOnce({
            eq: vi.fn().mockResolvedValue(txData)
          }).mockResolvedValue(txData)
          
          // Handle .select().gte().eq() for getDailySummaryData
          chain.gte = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(txData)
          })
          return chain
        }
        if (table === 'posts') {
          const postData = { data: [], error: null }
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue(postData),
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains balance audit warning (5000 profile vs 3000 calculated = 2000 discrepancy)
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Balance discrepancies detected')
      expect(emailHTML).toContain('2,000 sats')
    })

    it('should check Voltage API health status', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3457/api/admin/node-balance'
      )
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains Voltage API health status
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Voltage Lightning Node')
      expect(emailHTML).toContain('Voltage API: Online')
    })

    it('should check Groq API health status', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockGroqClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ content: expect.stringContaining('health check') }),
          ]),
          model: 'llama-3.1-8b-instant',
        })
      )
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains Groq API health status
      const emailCall = mockSendEmail.mock.calls[0]
      expect(emailCall[2]).toContain('Groq API: Online')
    })

    it('should check Resend API health status', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockResendClient.domains.list).toHaveBeenCalled()
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains Resend API health status
      const emailCall = mockSendEmail.mock.calls[0]
      expect(emailCall[2]).toContain('Resend API: Online')
    })
  })

  describe('POST Method - Data Aggregation', () => {
    it('should aggregate all data categories identical to GET method', async () => {
      // Arrange
      const { POST } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('POST', 'Bearer test-cron-secret-123')

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3457/api/admin/node-balance'
      )
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles')
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transactions')
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts')
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_active_users_last_24h', expect.any(Object))
      expect(mockGroqClient.chat.completions.create).toHaveBeenCalled()
      expect(mockResendClient.domains.list).toHaveBeenCalled()
      expect(mockSendEmail).toHaveBeenCalled()
    })
  })

  describe('Email Delivery', () => {
    it('should send email with formatted HTML content', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalledWith(
        'brianmurray03@gmail.com',
        expect.stringContaining('Ganamos Daily Summary'),
        expect.stringContaining('<h2>Ganamos Daily Summary')
      )
    })

    it('should return 500 when email sending fails', async () => {
      // Arrange
      mockSendEmail.mockResolvedValue({
        success: false,
        error: 'Resend API rate limit exceeded',
      })

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email')
      expect(data.details).toBe('Resend API rate limit exceeded')
    })

    it('should include email messageId in success response', async () => {
      // Arrange
      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.messageId).toBe('test-message-id-123')
    })
  })

  describe('Error Handling', () => {
    it('should handle node balance fetch failure gracefully', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert - Should still succeed with fallback zero balances
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()
    })

    it('should handle Supabase query failures gracefully', async () => {
      // Arrange
      mockSupabaseClient.from = vi.fn((table: string) => {
        const errorResponse = {
          data: null,
          error: { message: 'Connection timeout' },
        }
        
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue(errorResponse),
          }
        }
        
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue(errorResponse),
        }
      })

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert - Should still succeed with zero/empty data
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()
    })

    it('should report Groq API offline status when API fails', async () => {
      // Arrange
      mockGroqClient.chat.completions.create.mockRejectedValue(
        new Error('Groq API timeout')
      )

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains Groq offline status
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Groq API: OFFLINE')
    })

    it('should report Resend API offline status when API fails', async () => {
      // Arrange
      mockResendClient.domains.list.mockRejectedValue(
        new Error('Resend API authentication failed')
      )

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email contains Resend offline status
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Resend API: OFFLINE')
    })

    it('should return 500 when unexpected error occurs', async () => {
      // Arrange
      mockSendEmail.mockRejectedValue(new Error('Unexpected network error'))

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email')
      expect(data.details).toBe('Unexpected network error')
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing GROQ_API_KEY environment variable', async () => {
      // Arrange
      delete process.env.GROQ_API_KEY

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert - Should succeed with Groq API error status
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Groq API: ERROR')
      expect(emailHTML).toContain('GROQ_API_KEY not configured')
    })

    it('should handle missing RESEND_API_KEY environment variable', async () => {
      // Arrange
      delete process.env.RESEND_API_KEY

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert - Should succeed with Resend API error status
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Resend API: ERROR')
      expect(emailHTML).toContain('RESEND_API_KEY not configured')
    })

    it('should handle balance audit with zero discrepancies (all balances match)', async () => {
      // Arrange - Set profile balance to match transaction-derived balance
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'profiles') {
          const profileData = {
            data: [{ id: 'user-1', email: 'test@example.com', balance: 1000 }],
            error: null,
          }
          return {
            select: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue(profileData),
          }
        }
        if (table === 'transactions') {
          const txData = {
            data: [
              { type: 'deposit', amount: 1000, status: 'completed' },
            ],
            error: null,
          }
          const chain: any = {
            select: vi.fn().mockReturnThis(),
          }
          // First eq() call returns chain, second eq() call returns promise
          chain.eq = vi.fn().mockReturnValueOnce({
            eq: vi.fn().mockResolvedValue(txData)
          }).mockResolvedValue(txData)
          
          chain.gte = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(txData)
          })
          return chain
        }
        if (table === 'posts') {
          const postData = { data: [], error: null }
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue(postData),
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email shows audit passed
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Balance audit check confirmed')
      expect(emailHTML).not.toContain('Balance discrepancies detected')
    })

    it('should handle empty activity (no transactions or posts in last 24 hours)', async () => {
      // Arrange
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'profiles') {
          const profileData = {
            data: [{ id: 'user-1', email: 'test@example.com', balance: 0 }],
            error: null,
          }
          return {
            select: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue(profileData),
          }
        }
        if (table === 'transactions') {
          const emptyData = { data: [], error: null }
          const chain: any = {
            select: vi.fn().mockReturnThis(),
          }
          // Handle .select().eq().eq() for balance audit
          chain.eq = vi.fn().mockReturnValueOnce({
            eq: vi.fn().mockResolvedValue(emptyData)
          }).mockResolvedValue(emptyData)
          
          // Handle .select().gte().eq() for getDailySummaryData
          chain.gte = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(emptyData)
          })
          return chain
        }
        if (table === 'posts') {
          const emptyData = { data: [], error: null }
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue(emptyData),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      })

      mockSupabaseClient.rpc = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })

      const { GET } = await import('@/app/api/admin/daily-summary/route')
      const request = createMockRequest('GET', 'Bearer test-cron-secret-123')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(200)
      expect(mockSendEmail).toHaveBeenCalled()

      // Verify email shows zero activity
      const emailCall = mockSendEmail.mock.calls[0]
      const emailHTML = emailCall[2]
      expect(emailHTML).toContain('Total Transactions:</strong> 0')
      expect(emailHTML).toContain('Active Users:</strong> 0')
    })
  })
})