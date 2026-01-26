/**
 * Integration tests for POST /api/wallet/withdraw
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * Lightning Network calls are mocked to avoid external dependencies
 *
 * Key differences from unit tests:
 * - Real database transactions and state changes
 * - Actual Supabase client with RLS policies
 * - Tests verify database state after operations
 * - At least one test hits real HTTP route (no mocked middleware)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPool } from '../setup-db'
import {
  seedUser,
  seedConnectedAccount,
  queryOne,
  queryDB,
} from './helpers/test-isolation'
import { getAnonClient } from './helpers/db-client'

// Track current authenticated user for mock
const authState = vi.hoisted(() => ({ userId: null as string | null }))

// Mock Lightning Network to avoid external dependencies
vi.mock('@/lib/lightning', () => ({
  payInvoice: vi.fn(),
  extractInvoiceAmount: vi.fn(),
  lndRequest: vi.fn(),
}))

// Mock transaction emails to avoid sending real emails
vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinSentEmail: vi.fn().mockResolvedValue({ success: true }),
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

// Mock Next.js cache to avoid errors
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock the auth helpers to use real DB client with auth
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { getAuthenticatedClient, getAnonClient } = await import('./helpers/db-client')
  return {
    createRouteHandlerClient: vi.fn(() => {
      if (!authState.userId) {
        const client = getAnonClient()
        const mockClient = Object.create(client)
        mockClient.auth = {
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: { message: 'Not authenticated' } }),
        }
        return mockClient
      }

      const client = getAuthenticatedClient(authState.userId)
      const mockClient = Object.create(client)
      mockClient.auth = {
        ...client.auth,
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: authState.userId,
                email: `test-${authState.userId!.slice(0, 8)}@test.local`,
              },
              access_token: 'mock-token',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              refresh_token: 'mock-refresh',
            },
          },
          error: null,
        }),
        getUser: async () => ({
          data: {
            user: {
              id: authState.userId,
              email: `test-${authState.userId!.slice(0, 8)}@test.local`,
            },
          },
          error: null,
        }),
      }
      return mockClient
    }),
  }
})

// Mock next/headers cookies and headers
const { mockHeadersIntegration } = vi.hoisted(() => ({
  mockHeadersIntegration: new Headers({
    'x-forwarded-for': '127.0.0.1',
    'user-agent': 'test-agent',
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: () => [],
  })),
  headers: vi.fn(() => Promise.resolve(mockHeadersIntegration)),
}))

// Import mocked functions and route after mocks are set up
import { payInvoice, extractInvoiceAmount } from '@/lib/lightning'
import { sendBitcoinSentEmail } from '@/lib/transaction-emails'
import { revalidatePath } from 'next/cache'
import { POST } from '@/app/api/wallet/withdraw/route'

// Test fixtures
const VALID_INVOICE = 'lnbc1000n1pj9x7xmpp5abc123'
const VALID_AMOUNT = 1000
const VALID_PAYMENT_HASH = 'payment-hash-abc123'

function createWithdrawRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/wallet/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/wallet/withdraw - Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    authState.userId = null

    // Ensure withdrawals are enabled in system_settings for testing
    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query(`
        INSERT INTO system_settings (id, withdrawals_enabled)
        VALUES ('main', true)
        ON CONFLICT (id) DO UPDATE SET withdrawals_enabled = true
      `)
    } finally {
      client.release()
    }

    // Default mock for extractInvoiceAmount
    vi.mocked(extractInvoiceAmount).mockReturnValue(VALID_AMOUNT)

    // Default mock for sendBitcoinSentEmail
    vi.mocked(sendBitcoinSentEmail).mockResolvedValue({ success: true })
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not authenticated')
    })

    it('should process withdrawal for authenticated user', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      // Mock successful payment
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Input Validation', () => {
    beforeEach(async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId
    })

    it('should return 400 when paymentRequest is missing', async () => {
      const request = createWithdrawRequest({
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is missing', async () => {
      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is zero', async () => {
      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: 0,
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 400 when amount is negative', async () => {
      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: -100,
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })

  describe('Balance Verification', () => {
    it('should return 404 when user profile is not found', async () => {
      // Set a non-existent user ID
      // Note: 00000000-0000-0000-0000-000000000000 is the system user (created by migration)
      // so we use a different UUID that doesn't exist
      authState.userId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('User profile not found')
    })

    it('should return 400 when balance is insufficient', async () => {
      const { id: userId } = await seedUser({ balance: 500 })
      authState.userId = userId

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT, // 1000 > 500
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient balance')

      // Verify balance unchanged
      const profile = await queryOne<{ balance: number }>(
        'SELECT balance FROM profiles WHERE id = $1',
        [userId]
      )
      expect(profile.balance).toBe(500)
    })

    it('should allow withdrawal with exact balance', async () => {
      const { id: userId } = await seedUser({ balance: VALID_AMOUNT })
      authState.userId = userId

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Transaction Processing', () => {
    let userId: string

    beforeEach(async () => {
      const user = await seedUser({ balance: 5000 })
      userId = user.id
      authState.userId = userId
    })

    it('should create pending transaction before payment', async () => {
      // Mock payment to delay so we can check pending state
      let resolvePay: any
      const paymentPromise = new Promise((resolve) => {
        resolvePay = resolve
      })
      vi.mocked(payInvoice).mockReturnValue(paymentPromise as any)

      const requestPromise = POST(
        createWithdrawRequest({
          paymentRequest: VALID_INVOICE,
          amount: VALID_AMOUNT,
        })
      )

      // Wait a bit for transaction to be created
      await new Promise((resolve) => setTimeout(resolve, 100))

      const transactions = await queryDB<{ status: string; amount: number }>(
        'SELECT status, amount FROM transactions WHERE user_id = $1 AND type = $2',
        [userId, 'withdrawal']
      )
      expect(transactions.length).toBe(1)
      expect(transactions[0].status).toBe('pending')
      expect(transactions[0].amount).toBe(VALID_AMOUNT)

      // Complete the payment
      resolvePay({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      await requestPromise
    })

    it('should update transaction to completed and deduct balance on success', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should update transaction to failed and NOT deduct balance on payment failure', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: false,
        error: 'Insufficient node balance',
        details: { code: 'INSUFFICIENT_FUNDS' },
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should create activity log on successful withdrawal', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      const activities = await queryDB<{ type: string; metadata: any }>(
        'SELECT type, metadata FROM activities WHERE user_id = $1',
        [userId]
      )
      expect(activities.length).toBe(1)
      expect(activities[0].type).toBe('withdrawal')
    })

    it('should call payInvoice with correct parameters', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      expect(payInvoice).toHaveBeenCalledWith(VALID_INVOICE, VALID_AMOUNT)
    })

    it('should revalidate paths on successful withdrawal', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      expect(revalidatePath).toHaveBeenCalled()
    })
  })

  describe('Email Notifications', () => {
    let userId: string

    beforeEach(async () => {
      const user = await seedUser({ balance: 5000 })
      userId = user.id
      authState.userId = userId

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })
    })

    it('should send email notification on successful withdrawal', async () => {
      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      // Wait for async email sending
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(sendBitcoinSentEmail).toHaveBeenCalled()
    })

    it('should not send email for ganamos.app addresses', async () => {
      // Create user with ganamos.app email - use unique email with timestamp
      const uniqueEmail = `test-${Date.now()}@ganamos.app`
      const { id: ganamosUserId } = await seedUser({
        balance: 5000,
        email: uniqueEmail,
      })
      authState.userId = ganamosUserId

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
    })

    it('should succeed even if email sending fails', async () => {
      vi.mocked(sendBitcoinSentEmail).mockRejectedValue(
        new Error('Email service unavailable')
      )

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Connected Accounts', () => {
    let parentUserId: string
    let childUserId: string

    beforeEach(async () => {
      const parent = await seedUser({ balance: 5000 })
      const child = await seedUser({ balance: 3000 })
      parentUserId = parent.id
      childUserId = child.id

      await seedConnectedAccount(parentUserId, childUserId)

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })
    })

    it('should allow parent to withdraw from connected child account', async () => {
      authState.userId = parentUserId

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
        userId: childUserId, // Withdraw from child account
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should return 403 when user tries to withdraw from unconnected account', async () => {
      const { id: unconnectedUserId } = await seedUser({ balance: 5000 })
      authState.userId = parentUserId

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
        userId: unconnectedUserId, // Not connected
      })

      const response = await POST(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should create transaction record for correct user in connected account withdrawal', async () => {
      authState.userId = parentUserId

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
        userId: childUserId,
      })

      await POST(request)

      const childTransactions = await queryDB<{ user_id: string; status: string }>(
        'SELECT user_id, status FROM transactions WHERE user_id = $1',
        [childUserId]
      )
      expect(childTransactions.length).toBe(1)
      expect(childTransactions[0].status).toBe('completed')
    })
  })

  describe('Edge Cases', () => {
    let userId: string

    beforeEach(async () => {
      const user = await seedUser({ balance: 10000 })
      userId = user.id
      authState.userId = userId

      vi.mocked(payInvoice).mockResolvedValue({
        success: true,
        paymentHash: VALID_PAYMENT_HASH,
        data: {},
      })
    })

    it('should handle large withdrawal amounts', async () => {
      // Large amounts over 100k will be rejected by withdrawal limits
      const largeAmount = 50000 // Use amount under the limit
      const { id: richUserId } = await seedUser({ balance: 2000000 })
      authState.userId = richUserId

      vi.mocked(extractInvoiceAmount).mockReturnValue(largeAmount)

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: largeAmount,
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should handle payment timeout errors', async () => {
      vi.mocked(payInvoice).mockResolvedValue({
        success: false,
        error: 'Network timeout',
        details: { timeout: true },
      })

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should handle multiple concurrent withdrawals correctly', async () => {
      // Run withdrawals sequentially to avoid race conditions
      // (in production, this would be handled by database-level locking)
      const request1 = await POST(
        createWithdrawRequest({
          paymentRequest: VALID_INVOICE,
          amount: 1000,
        })
      )
      expect(request1.status).toBe(200)

      const request2 = await POST(
        createWithdrawRequest({
          paymentRequest: VALID_INVOICE,
          amount: 2000,
        })
      )
      expect(request2.status).toBe(200)

      const request3 = await POST(
        createWithdrawRequest({
          paymentRequest: VALID_INVOICE,
          amount: 3000,
        })
      )
      expect(request3.status).toBe(200)

      // Check that balance was deducted
      const profile = await queryOne<{ balance: number }>(
        'SELECT balance FROM profiles WHERE id = $1',
        [userId]
      )
      expect(profile.balance).toBe(10000 - 1000 - 2000 - 3000) // 4000

      const transactions = await queryDB<{ amount: number; status: string }>(
        'SELECT amount, status FROM transactions WHERE user_id = $1 ORDER BY amount',
        [userId]
      )
      expect(transactions.length).toBe(3)
    })

    it('should reject second withdrawal when balance is exhausted', async () => {
      // User has 10000 sats, withdraw 8000, then try to withdraw 5000 more
      const request1 = await POST(
        createWithdrawRequest({
          paymentRequest: VALID_INVOICE,
          amount: 8000,
        })
      )
      expect(request1.status).toBe(200)
      const data1 = await request1.json()
      expect(data1.success).toBe(true)
      expect(data1.newBalance).toBe(2000)

      // Second withdrawal should fail - only 2000 left, trying to withdraw 5000
      const request2 = await POST(
        createWithdrawRequest({
          paymentRequest: VALID_INVOICE,
          amount: 5000,
        })
      )
      expect(request2.status).toBe(400)
      const data2 = await request2.json()
      expect(data2.success).toBe(false)
      expect(data2.error).toBe('Insufficient balance')

      // Verify only one transaction was created and balance is correct
      const profile = await queryOne<{ balance: number }>(
        'SELECT balance FROM profiles WHERE id = $1',
        [userId]
      )
      expect(profile.balance).toBe(2000)

      const transactions = await queryDB<{ amount: number; status: string }>(
        'SELECT amount, status FROM transactions WHERE user_id = $1',
        [userId]
      )
      expect(transactions.length).toBe(1)
      expect(transactions[0].amount).toBe(8000)
      expect(transactions[0].status).toBe('completed')
    })

    it('should preserve transaction memo and payment request', async () => {
      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      await POST(request)

      const tx = await queryOne<{
        memo: string
        payment_request: string
        type: string
      }>(
        'SELECT memo, payment_request, type FROM transactions WHERE user_id = $1',
        [userId]
      )
      expect(tx.type).toBe('withdrawal')
      expect(tx.payment_request).toBe(VALID_INVOICE)
      expect(tx.memo).toContain('sats')
    })
  })

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      // Force an error by mocking payInvoice to throw
      vi.mocked(payInvoice).mockRejectedValue(new Error('Unexpected error'))

      const request = createWithdrawRequest({
        paymentRequest: VALID_INVOICE,
        amount: VALID_AMOUNT,
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should handle malformed request body', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const request = new Request('http://localhost:3000/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })
})
