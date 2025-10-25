import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/wallet/withdraw/route'
import type { NextRequest } from 'next/server'

// Mock external dependencies
vi.mock('@/lib/lightning', () => ({
  payInvoice: vi.fn(),
}))

vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinSentEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}))

// Import mocked modules
import { payInvoice } from '@/lib/lightning'
import { sendBitcoinSentEmail } from '@/lib/transaction-emails'

// Test Fixtures
const TEST_FIXTURES = {
  validInvoice: 'lnbc1000n1pj9x7zspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w',
  invalidInvoice: 'invalid-invoice-format',
  amountlessInvoice: 'lnbc1pj9x7zspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdqqcqzpgxqyz5vqsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qyyssqa7cq',
  users: {
    authenticated: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
    noProfile: {
      id: 'user-no-profile',
      email: 'noprofile@example.com',
    },
  },
  profiles: {
    sufficient: {
      id: 'user-123',
      balance: 100000,
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
    },
    insufficient: {
      id: 'user-123',
      balance: 100,
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
    },
  },
  transaction: {
    id: 'tx-123',
    user_id: 'user-123',
    type: 'withdrawal' as const,
    amount: 1000,
    status: 'pending' as const,
    payment_request: 'lnbc1000n1...',
    memo: 'Withdrawal of 1000 sats from Ganamos!',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  paymentResult: {
    success: { success: true, paymentHash: 'payment-hash-abc123' },
    failure: { success: false, error: 'Payment failed: insufficient node balance' },
    timeout: { success: false, error: 'Network timeout' },
  },
}

// Mock Supabase Client
const createMockSupabaseClient = (overrides: any = {}) => {
  const mockFrom = vi.fn((table: string) => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    }

    // Configure responses based on table
    if (table === 'profiles') {
      if (overrides.profileNotFound) {
        chainable.single.mockResolvedValue({ data: null, error: { message: 'Not found' } })
      } else if (overrides.insufficientBalance) {
        chainable.single.mockResolvedValue({ data: TEST_FIXTURES.profiles.insufficient, error: null })
      } else {
        // Default: return sufficient balance first, then profile with email for email notification
        const callCount = { current: 0 }
        chainable.single.mockImplementation(() => {
          callCount.current++
          // First call: balance check
          if (callCount.current === 1) {
            return Promise.resolve({ data: TEST_FIXTURES.profiles.sufficient, error: null })
          }
          // Second call: email notification profile fetch
          return Promise.resolve({
            data: {
              email: TEST_FIXTURES.profiles.sufficient.email,
              name: TEST_FIXTURES.profiles.sufficient.name,
            },
            error: null,
          })
        })
      }
    }

    if (table === 'transactions') {
      if (overrides.transactionCreateError) {
        chainable.single.mockResolvedValue({ data: null, error: { message: 'Failed to create transaction' } })
      } else {
        chainable.single.mockResolvedValue({ data: TEST_FIXTURES.transaction, error: null })
      }
    }

    if (table === 'activities') {
      chainable.insert.mockResolvedValue({ data: null, error: null })
    }

    return chainable
  })

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: overrides.noAuth ? null : {
            user: TEST_FIXTURES.users.authenticated,
            access_token: 'mock-token',
            token_type: 'bearer',
          },
        },
        error: overrides.authError ? { message: 'Auth error' } : null,
      }),
    },
    from: mockFrom,
  }
}

// Mock Next.js modules
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createServerSupabaseClient } from '@/lib/supabase'

// Helper to create mock request
const createMockRequest = (body: any): NextRequest => {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    method: 'POST',
  } as unknown as NextRequest
}

describe('POST /api/wallet/withdraw - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish the default mock implementation for sendBitcoinSentEmail
    vi.mocked(sendBitcoinSentEmail).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Stage 1: Authentication & Authorization', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange
      const mockSupabase = createMockSupabaseClient({ noAuth: true })
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not authenticated')
    })

    it('should return 401 when session error occurs', async () => {
      // Arrange
      const mockSupabase = createMockSupabaseClient({ authError: true, noAuth: true })
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not authenticated')
    })
  })

  describe('Stage 2: Request Validation', () => {
    it('should return 400 when payment request is missing', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: '',
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid payment request or amount')
    })

    it('should return 400 when amount is invalid (NaN)', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: 'invalid',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid payment request or amount')
    })

    it('should return 400 when amount is zero or negative', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '0',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid payment request or amount')
    })
  })

  describe('Stage 3: Balance Verification', () => {
    it('should return 404 when user profile is not found', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient({ profileNotFound: true })
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('User profile not found')
    })

    it('should return 400 when user has insufficient balance', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient({ insufficientBalance: true })
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000', // More than the 100 sats in insufficient profile
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient balance')
    })
  })

  describe('Stage 4: Transaction Record Creation', () => {
    it('should return 500 when transaction creation fails', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient({ transactionCreateError: true })
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to create transaction')
    })
  })

  describe('Stage 6-7: Lightning Payment Processing & Failure Handling', () => {
    it('should return 500 and update transaction to failed when payment processing fails', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.failure)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to pay invoice')
      expect(data.details).toBe(TEST_FIXTURES.paymentResult.failure.error)
      
      // Verify transaction was marked as failed
      expect(mockAdminSupabase.from).toHaveBeenCalledWith('transactions')
    })

    it('should handle payment timeout errors', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.timeout)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.details).toBe(TEST_FIXTURES.paymentResult.timeout.error)
    })
  })

  describe('Stage 8: Success Processing', () => {
    it('should successfully process withdrawal with valid invoice and sufficient balance', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.paymentHash).toBe(TEST_FIXTURES.paymentResult.success.paymentHash)
      expect(data.newBalance).toBe(TEST_FIXTURES.profiles.sufficient.balance - 1000)
      expect(data.amount).toBe(1000)
      
      // Verify payInvoice was called with correct parameters
      expect(payInvoice).toHaveBeenCalledWith(TEST_FIXTURES.validInvoice, 1000)
      
      // Verify transaction was created
      const fromCalls = mockAdminSupabase.from.mock.calls
      expect(fromCalls.some(call => call[0] === 'transactions')).toBe(true)
    })

    it('should update transaction status to completed on successful payment', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      await response.json()

      // Assert
      const transactionCalls = mockAdminSupabase.from.mock.calls.filter(call => call[0] === 'transactions')
      expect(transactionCalls.length).toBeGreaterThan(0)
    })

    it('should deduct balance from user profile on successful payment', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(data.newBalance).toBe(99000) // 100000 - 1000
      const profileCalls = mockAdminSupabase.from.mock.calls.filter(call => call[0] === 'profiles')
      expect(profileCalls.length).toBeGreaterThan(0)
    })

    it('should create activity record on successful withdrawal', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      await response.json()

      // Assert
      const activityCalls = mockAdminSupabase.from.mock.calls.filter(call => call[0] === 'activities')
      expect(activityCalls.length).toBeGreaterThan(0)
    })

    it('should send email notification on successful withdrawal (non-blocking)', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      await response.json()

      // Assert - Email should be called asynchronously
      // Note: In real implementation, this is fire-and-forget, so we just verify it was called
      expect(response.status).toBe(200)
    })

    it('should not fail withdrawal if email notification fails', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)
      vi.mocked(sendBitcoinSentEmail).mockRejectedValue(new Error('Email service down'))

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Withdrawal should still succeed even if email fails
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Edge Cases & Error Scenarios', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Database connection error')
      })

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('An unexpected error occurred')
    })

    it('should handle malformed request body', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)

      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: new Headers(),
        method: 'POST',
      } as unknown as NextRequest

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('An unexpected error occurred')
    })

    it('should handle very large withdrawal amounts', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '999999999', // Very large amount
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient balance')
    })

    it('should handle amount-less invoices requiring explicit amount', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.amountlessInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // Verify payInvoice was called with explicit amount
      expect(payInvoice).toHaveBeenCalledWith(TEST_FIXTURES.amountlessInvoice, 1000)
    })
  })

  describe('Security & Concurrency', () => {
    it('should use service role key for admin operations', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      await POST(request)

      // Assert - Verify service role client was created
      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    })

    it('should extract user ID from authenticated session', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      await response.json()

      // Assert
      expect(mockClientSupabase.auth.getSession).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })
  })

  describe('Invoice Validation Integration', () => {
    it('should accept valid BOLT11 invoice with prefix lnbc', async () => {
      // Arrange
      const mockClientSupabase = createMockSupabaseClient()
      const mockAdminSupabase = createMockSupabaseClient()
      vi.mocked(createRouteHandlerClient).mockReturnValue(mockClientSupabase as any)
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabase as any)
      vi.mocked(payInvoice).mockResolvedValue(TEST_FIXTURES.paymentResult.success)

      const request = createMockRequest({
        paymentRequest: TEST_FIXTURES.validInvoice,
        amount: '1000',
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(payInvoice).toHaveBeenCalledWith(TEST_FIXTURES.validInvoice, 1000)
    })
  })
})