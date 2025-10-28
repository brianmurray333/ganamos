import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/wallet/withdraw/route'
import { NextRequest } from 'next/server'

// Mock all external dependencies
vi.mock('@/lib/lightning', () => ({
  payInvoice: vi.fn(),
  lndRequest: vi.fn(),
  extractInvoiceAmount: vi.fn(),
}))

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinSentEmail: vi.fn(),
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
  const mockClient = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    insert: vi.fn(() => mockClient),
    update: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
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

    vi.mocked(createRouteHandlerClient).mockReturnValue(mockRouteHandlerClient)
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabaseClient)
    vi.mocked(extractInvoiceAmount).mockReturnValue(VALID_AMOUNT)
    vi.mocked(sendBitcoinSentEmail).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 when session is missing', async () => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
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
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: null },
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
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
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
      expect(data).toEqual({
        success: false,
        error: 'Invalid payment request or amount',
      })
    })

    it('should return 400 when amount is missing', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Invalid payment request or amount',
      })
    })

    it('should return 400 when amount is zero', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: 0,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Invalid payment request or amount',
      })
    })

    it('should return 400 when amount is negative', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: -100,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Invalid payment request or amount',
      })
    })

    it('should return 400 when amount is NaN', async () => {
      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: 'invalid',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Invalid payment request or amount',
      })
    })
  })

  describe('Balance Verification', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
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
      expect(data).toEqual({
        success: false,
        error: 'User profile not found',
      })
      expect(mockAdminSupabaseClient.from).toHaveBeenCalledWith('profiles')
      expect(mockAdminSupabaseClient.select).toHaveBeenCalledWith('balance')
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('id', VALID_USER_ID)
    })

    it('should return 400 when balance is insufficient', async () => {
      mockAdminSupabaseClient.single.mockResolvedValue({
        data: MOCK_PROFILE_INSUFFICIENT,
        error: null,
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Insufficient balance',
      })
    })
  })

  describe('Transaction Creation', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
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
      mockAdminSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to create transaction',
      })
      expect(mockAdminSupabaseClient.insert).toHaveBeenCalledWith({
        user_id: VALID_USER_ID,
        type: 'withdrawal',
        amount: VALID_AMOUNT,
        status: 'pending',
        payment_request: VALID_INVOICE,
        memo: `Withdrawal of ${VALID_AMOUNT} sats from Ganamos!`,
      })
    })
  })

  describe('Payment Processing', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      // Mock successful profile check
      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
        })
        // Mock successful transaction creation
        .mockResolvedValueOnce({
          data: MOCK_TRANSACTION_PENDING,
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

      // Mock transaction update for completion
      mockAdminSupabaseClient.single
        // Mock profile retrieval for email
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
        })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        newBalance: MOCK_PROFILE_SUFFICIENT.balance - VALID_AMOUNT,
        amount: VALID_AMOUNT,
      })

      // Verify payInvoice was called correctly
      expect(payInvoice).toHaveBeenCalledWith(VALID_INVOICE, VALID_AMOUNT)

      // Verify transaction was updated to completed
      expect(mockAdminSupabaseClient.update).toHaveBeenCalledWith({
        status: 'completed',
        payment_hash: VALID_PAYMENT_HASH,
        updated_at: expect.any(String),
      })

      // Verify balance was updated
      expect(mockAdminSupabaseClient.update).toHaveBeenCalledWith({
        balance: MOCK_PROFILE_SUFFICIENT.balance - VALID_AMOUNT,
        updated_at: expect.any(String),
      })

      // Verify cache revalidation
      expect(revalidatePath).toHaveBeenCalledWith('/profile')
      expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
      expect(revalidatePath).toHaveBeenCalledWith('/wallet')

      // Verify activity was logged
      expect(mockAdminSupabaseClient.insert).toHaveBeenCalledWith({
        id: 'mock-uuid-1234',
        user_id: VALID_USER_ID,
        type: 'withdrawal',
        related_id: MOCK_TRANSACTION_PENDING.id,
        related_table: 'transactions',
        timestamp: expect.any(String),
        metadata: { amount: VALID_AMOUNT, status: 'completed' },
      })

      // Verify email notification was sent
      expect(sendBitcoinSentEmail).toHaveBeenCalledWith({
        toEmail: MOCK_PROFILE_SUFFICIENT.email,
        userName: MOCK_PROFILE_SUFFICIENT.name,
        amountSats: VALID_AMOUNT,
        date: expect.any(Date),
        transactionType: 'withdrawal',
      })
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
      expect(data).toEqual({
        success: false,
        error: 'Failed to pay invoice',
        details: 'Insufficient node balance',
        debugInfo: { code: 'INSUFFICIENT_FUNDS' },
      })

      // Verify transaction was updated to failed
      expect(mockAdminSupabaseClient.update).toHaveBeenCalledWith({
        status: 'failed',
        updated_at: expect.any(String),
      })
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('id', MOCK_TRANSACTION_PENDING.id)

      // Verify balance was NOT updated
      const updateCalls = vi.mocked(mockAdminSupabaseClient.update).mock.calls
      const balanceUpdate = updateCalls.find(call => call[0].balance !== undefined)
      expect(balanceUpdate).toBeUndefined()
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
      expect(data.error).toBe('Failed to pay invoice')
      expect(data.details).toBe('Network timeout')
    })

    it('should not send email notification for ganamos.app email addresses', async () => {
      // Mock successful payment
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      // Mock profile with ganamos.app email
      const ganamosProfile = {
        ...MOCK_PROFILE_SUFFICIENT,
        email: 'user@ganamos.app',
      }

      mockAdminSupabaseClient.single
        // Mock profile retrieval for email
        .mockResolvedValueOnce({
          data: ganamosProfile,
          error: null,
        })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      // Verify email was NOT sent
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

      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
        })

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
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })
    })

    it('should return 500 with generic error message on unexpected errors', async () => {
      mockRouteHandlerClient.auth.getSession.mockRejectedValue(
        new Error('Unexpected database error')
      )

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      })
    })

    it('should handle JSON parsing errors', async () => {
      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: new Headers(),
        method: 'POST',
      } as any

      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      })
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
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

      // Mock all three .single() calls needed by the route:
      // 1. Profile balance check
      // 2. Transaction creation
      // 3. Profile for email
      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
        })
        .mockResolvedValueOnce({
          data: MOCK_TRANSACTION_PENDING,
          error: null,
        })
        .mockResolvedValueOnce({
          data: MOCK_PROFILE_SUFFICIENT,
          error: null,
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

    it('should handle exact balance withdrawal', async () => {
      const exactBalanceProfile = {
        ...MOCK_PROFILE_SUFFICIENT,
        balance: VALID_AMOUNT,
      }

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      // Mock all three .single() calls needed by the route:
      // 1. Profile balance check
      // 2. Transaction creation
      // 3. Profile for email
      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: exactBalanceProfile,
          error: null,
        })
        .mockResolvedValueOnce({
          data: MOCK_TRANSACTION_PENDING,
          error: null,
        })
        .mockResolvedValueOnce({
          data: exactBalanceProfile,
          error: null,
        })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.newBalance).toBe(0)
    })

    it('should handle large withdrawal amounts', async () => {
      const largeAmount = 1000000 // 1M sats
      const largeBalanceProfile = {
        ...MOCK_PROFILE_SUFFICIENT,
        balance: 2000000,
      }

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })
      vi.mocked(extractInvoiceAmount).mockReturnValue(largeAmount)

      // Mock all three .single() calls needed by the route:
      // 1. Profile balance check
      // 2. Transaction creation
      // 3. Profile for email
      mockAdminSupabaseClient.single
        .mockResolvedValueOnce({
          data: largeBalanceProfile,
          error: null,
        })
        .mockResolvedValueOnce({
          data: { ...MOCK_TRANSACTION_PENDING, amount: largeAmount },
          error: null,
        })
        .mockResolvedValueOnce({
          data: largeBalanceProfile,
          error: null,
        })

      const request = createMockRequest({
        paymentRequest: VALID_INVOICE,
        amount: largeAmount,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.newBalance).toBe(largeBalanceProfile.balance - largeAmount)
    })
  })
})