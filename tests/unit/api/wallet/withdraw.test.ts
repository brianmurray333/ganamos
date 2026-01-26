/**
 * Unit tests for POST /api/wallet/withdraw
 * 
 * Tests the withdrawal route handler with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Create mock cookie store using vi.hoisted to ensure availability in mocks
const { mockCookieStore, mockHeaders } = vi.hoisted(() => ({
  mockCookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  },
  mockHeaders: new Headers({
    'x-forwarded-for': '127.0.0.1',
    'user-agent': 'test-agent',
  }),
}))

// Mock Next.js cookies and headers (MUST be at top level before imports)
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
  headers: vi.fn(() => Promise.resolve(mockHeaders)),
}))

// Import route after mocks are set up
import { POST } from '@/app/api/wallet/withdraw/route'

// Mock all external dependencies
vi.mock('@/lib/lightning', () => ({
  payInvoice: vi.fn(),
  lndRequest: vi.fn(),
  extractInvoiceAmount: vi.fn(),
}))

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

// @/lib/supabase mock provided by tests/setup.ts

vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinSentEmail: vi.fn(),
}))

// Mock withdrawal security to avoid email dependencies
vi.mock('@/lib/withdrawal-security', () => ({
  WITHDRAWAL_LIMITS: {
    PER_TRANSACTION: 100_000,
    DAILY: 500_000,
    REQUIRES_APPROVAL: 50_000,
    DELAY_THRESHOLD: 50_000,
    SYSTEM_HOURLY: 25_000,
  },
  checkWithdrawalLimits: vi.fn().mockResolvedValue({ allowed: true, requiresApproval: false }),
  checkBalanceReconciliation: vi.fn().mockResolvedValue({ reconciles: true, storedBalance: 5000, calculatedBalance: 5000, discrepancy: 0 }),
  checkSystemWithdrawalThreshold: vi.fn().mockResolvedValue({ allowed: true, currentTotal: 0, projectedTotal: 0 }),
  logWithdrawalAudit: vi.fn().mockResolvedValue(undefined),
  sendReconciliationAlert: vi.fn().mockResolvedValue(undefined),
  sendWithdrawalApprovalRequest: vi.fn().mockResolvedValue(undefined),
  sendSystemThresholdAlert: vi.fn().mockResolvedValue(undefined),
}))

// Mock security alerts to avoid SMS/email dependencies
vi.mock('@/lib/security-alerts', () => ({
  sendRateLimitAlert: vi.fn().mockResolvedValue(undefined),
}))

// Mock admin actions for withdrawal toggle
vi.mock('@/app/actions/admin-actions', () => ({
  toggleWithdrawals: vi.fn().mockResolvedValue({ success: true, enabled: false }),
}))

// Mock rate limiter to always allow requests in tests
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({
    allowed: true,
    remaining: 100,
    resetTime: Date.now() + 60000,
    totalRequests: 1,
  })),
  RATE_LIMITS: {
    WALLET_WITHDRAW: { maxRequests: 3, windowMs: 60000 },
    WALLET_WITHDRAW_HOURLY: { maxRequests: 10, windowMs: 3600000 },
    WALLET_TRANSFER: { maxRequests: 5, windowMs: 60000 },
    WALLET_TRANSFER_HOURLY: { maxRequests: 20, windowMs: 3600000 },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}))

// Import mocked functions for assertions
import { payInvoice, extractInvoiceAmount } from '@/lib/lightning'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendBitcoinSentEmail } from '@/lib/transaction-emails'
import { revalidatePath } from 'next/cache'

// Test Fixtures
const VALID_USER_ID = 'user-123'
const VALID_SESSION = {
  user: { id: VALID_USER_ID },
  access_token: 'mock-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Date.now() + 3600000,
  refresh_token: 'mock-refresh-token',
}

const VALID_INVOICE = 'lnbc1000n1pj9x7xmpp5abc123'
const INVALID_INVOICE_MALFORMED = 'invalid-invoice-format'
const VALID_AMOUNT = 1000
const VALID_PAYMENT_HASH = 'payment-hash-abc123'

const MOCK_PROFILE_SUFFICIENT = {
  id: VALID_USER_ID,
  email: 'user@example.com',
  name: 'Test User',
  balance: 5000,
  username: 'testuser',
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  fixed_issues_count: 0,
}

const MOCK_PROFILE_INSUFFICIENT = {
  ...MOCK_PROFILE_SUFFICIENT,
  balance: 500,
}

const MOCK_TRANSACTION_PENDING = {
  id: 'tx-123',
  user_id: VALID_USER_ID,
  type: 'withdrawal',
  amount: VALID_AMOUNT,
  status: 'pending',
  payment_request: VALID_INVOICE,
  memo: `Withdrawal of ${VALID_AMOUNT} sats from Ganamos!`,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  payment_hash: null,
  r_hash_str: null,
}

// Helper to create mock request
function createMockRequest(body: any): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    method: 'POST',
  } as any
}

// Helper to create mock Supabase client
function createMockSupabaseClient(overrides = {}) {
  // Track if we're in an update chain
  let isUpdateChain = false

  const mockClient = {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(() => {
      isUpdateChain = false
      return mockClient
    }),
    select: vi.fn(() => {
      isUpdateChain = false
      return mockClient
    }),
    insert: vi.fn(() => {
      isUpdateChain = false
      return mockClient
    }),
    update: vi.fn(() => {
      isUpdateChain = true
      return mockClient
    }),
    eq: vi.fn(() => {
      // If we're in an update chain, return a promise
      if (isUpdateChain) {
        return Promise.resolve({ data: null, error: null })
      }
      return mockClient
    }),
    single: vi.fn(),
    rpc: vi.fn(),
    ...overrides,
  }
  return mockClient
}

describe('POST /api/wallet/withdraw', () => {
  let mockRouteHandlerClient: any
  let mockAdminSupabaseClient: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock behaviors
    mockRouteHandlerClient = createMockSupabaseClient()
    mockAdminSupabaseClient = createMockSupabaseClient()

    // Mock RPC to handle create_pending_withdrawal and update_withdrawal_complete
    mockAdminSupabaseClient.rpc.mockImplementation((funcName: string) => {
      if (funcName === 'create_pending_withdrawal') {
        return Promise.resolve({
          data: {
            success: true,
            transaction_id: 'mock-uuid-1234',
            status: 'pending',
            available_balance: MOCK_PROFILE_SUFFICIENT.balance - VALID_AMOUNT,
          },
          error: null,
        })
      }
      if (funcName === 'update_withdrawal_complete') {
        return Promise.resolve({
          data: {
            success: true,
            new_balance: MOCK_PROFILE_SUFFICIENT.balance - VALID_AMOUNT,
            transaction_id: 'tx-123',
          },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    // Mock system_settings query to return withdrawals enabled by default
    // This is called first in the route, so mockResolvedValueOnce will handle it
    mockAdminSupabaseClient.single.mockResolvedValueOnce({
      data: { withdrawals_enabled: true },
      error: null,
    })

    // Mock profile select to return sufficient balance by default
    // This is called second in the route after settings check
    mockAdminSupabaseClient.single.mockResolvedValue({
      data: MOCK_PROFILE_SUFFICIENT,
      error: null,
    })

    // Mock insert to return success (insert without .select() returns a promise directly)
    mockAdminSupabaseClient.insert.mockImplementation(() => 
      Promise.resolve({ data: null, error: null })
    )

    // Mock update to return success
    mockAdminSupabaseClient.update.mockImplementation(() => ({
      eq: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
    }))

    vi.mocked(createRouteHandlerClient).mockReturnValue(mockRouteHandlerClient)
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabaseClient)
    vi.mocked(extractInvoiceAmount).mockReturnValue(VALID_AMOUNT)
    vi.mocked(sendBitcoinSentEmail).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    // Use clearAllMocks instead of restoreAllMocks to preserve mock implementations
    // restoreAllMocks resets vi.fn() mocks to return undefined, breaking module mocks
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 when session is missing', async () => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Not authenticated',
      })
    })

    it('should return 401 when session error occurs', async () => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Session error'),
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Not authenticated',
      })
    })
  })

  describe('Input Validation', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })
    })

    it('should return 400 when paymentRequest is missing', async () => {
      const request = createMockRequest({
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is missing', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is zero', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: 0,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is negative', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: -100,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is NaN', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: 'invalid',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })
  })

  describe('Balance Verification', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })
    })

    it('should return 404 when user profile is not found', async () => {
      mockAdminSupabaseClient.single.mockResolvedValue({
        data: null,
        error: null,
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('User profile not found')
    })

    it('should return 400 when balance is insufficient', async () => {
      mockAdminSupabaseClient.single.mockResolvedValue({
        data: MOCK_PROFILE_INSUFFICIENT,
        error: null,
      })

      // Mock create_pending_withdrawal to return insufficient balance error
      mockAdminSupabaseClient.rpc.mockImplementation((funcName: string) => {
        if (funcName === 'create_pending_withdrawal') {
          return Promise.resolve({
            data: {
              success: false,
              error: 'Insufficient balance',
              available_balance: MOCK_PROFILE_INSUFFICIENT.balance,
              requested_amount: VALID_AMOUNT,
            },
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient balance')
    })
  })

  describe('Transaction Creation', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })
    })

    it('should return 500 when transaction creation fails', async () => {
      // Mock profile with sufficient balance
      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
        })

      // Mock transaction creation failure
      mockAdminSupabaseClient.insert.mockReturnValue({
        error: { message: 'Database error' },
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })
  })

  describe('Payment Processing', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })

      // Mock successful profile check
      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
        })
    })

    it('should successfully process withdrawal with valid invoice and sufficient balance', async () => {
      // Mock successful payment
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(payInvoice).toHaveBeenCalledWith(VALID_INVOICE, VALID_AMOUNT)
    })

    it('should return 500 and update transaction to failed when payment fails', async () => {
      // Mock failed payment
      vi.mocked(payInvoice).mockResolvedValue({
        success: false,
        error: 'Insufficient node balance',
        details: { code: 'INSUFFICIENT_FUNDS' },
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })

    it('should handle payment network timeout errors', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: false,
        error: 'Network timeout',
        details: { timeout: true },
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })

    it('should not send email notification for ganamos.app email addresses', async () => {
      // Reset and set up profile with ganamos.app email
      // (need to reset because beforeEach already set mockResolvedValueOnce)
      mockAdminSupabaseClient.single.mockReset()
      mockAdminSupabaseClient.single.mockResolvedValue({
        data: { ...MOCK_PROFILE_SUFFICIENT, email: 'testuser@ganamos.app' },
        error: null,
      })

      // Mock successful payment
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      // Verify email was NOT sent for ganamos.app addresses
      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
    })

    it('should handle email notification failures gracefully', async () => {
      // Mock successful payment
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      // Mock email failure
      vi.mocked(sendBitcoinSentEmail).mockRejectedValue(new Error('Email service unavailable'))

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      // Should still succeed even if email fails
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })
    })

    it('should return 500 with generic error message on unexpected errors', async () => {
      mockAdminSupabaseClient.single.mockRejectedValue(
        new Error('Unexpected database error')
      )

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })

    it('should handle JSON parsing errors', async () => {
      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: new Headers(),
        method: 'POST',
      } as any

      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getUser.mockResolvedValue({
        data: { user: VALID_SESSION.user },
        error: null,
      })
      
      // Mock profile with sufficient balance
      mockAdminSupabaseClient.single.mockResolvedValue({
        data: MOCK_PROFILE_SUFFICIENT,
        error: null,
      })
    })

    it('should handle amount-less invoices correctly', async () => {
      vi.mocked(extractInvoiceAmount).mockReturnValue(null)
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle exact balance withdrawal', async () => {
      const exactBalanceProfile = {
        ...MOCK_PROFILE_SUFFICIENT,
        balance: VALID_AMOUNT,
      }

      mockAdminSupabaseClient.single.mockResolvedValue({
        data: exactBalanceProfile,
        error: null,
      })

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle large withdrawal amounts within limits', async () => {
      // Use amount within the 100k limit
      const largeAmount = 50000
      const largeBalanceProfile = {
        ...MOCK_PROFILE_SUFFICIENT,
        balance: 2000000,
      }

      mockAdminSupabaseClient.single.mockResolvedValue({
        data: largeBalanceProfile,
        error: null,
      })

      // Mock create_pending_withdrawal and update_withdrawal_complete for large balance
      mockAdminSupabaseClient.rpc.mockImplementation((funcName: string) => {
        if (funcName === 'create_pending_withdrawal') {
          return Promise.resolve({
            data: {
              success: true,
              transaction_id: 'mock-uuid-1234',
              status: 'pending',
              available_balance: largeBalanceProfile.balance - largeAmount,
            },
            error: null,
          })
        }
        if (funcName === 'update_withdrawal_complete') {
          return Promise.resolve({
            data: {
              success: true,
              new_balance: largeBalanceProfile.balance - largeAmount,
              transaction_id: 'tx-123',
            },
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      })

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })
      vi.mocked(extractInvoiceAmount).mockReturnValue(largeAmount)

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: largeAmount,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })
})
