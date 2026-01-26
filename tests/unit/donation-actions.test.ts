import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDonationPayment, checkDonationStatus } from '@/app/actions/donation-actions'
import {
  createMockSettledInvoiceResponse,
  createMockUnsettledInvoiceResponse,
  createMockInvoiceErrorResponse,
  TEST_R_HASH_HEX,
} from './helpers/invoice-status-helpers'

// Mock dependencies at top level
vi.mock('@/lib/lightning', () => ({
  checkInvoice: vi.fn(),
  createInvoice: vi.fn(),
}))

// @/lib/supabase mock provided by tests/setup.ts

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Date.now()),
}))

// Import mocked modules after vi.mock declarations
import { checkInvoice } from '@/lib/lightning'
import { createServerSupabaseClient } from '@/lib/supabase'

// Test constants
const TEST_PAYMENT_HASH = TEST_R_HASH_HEX
const TEST_DONATION_AMOUNT = 10000
const TEST_POOL_ID = 'test-pool-id-123'
const TEST_USER_ID = 'test-user-id-456'
const TEST_DONATION_ID = 'test-donation-id-789'

// Test fixtures
const MOCK_DONATION = {
  id: TEST_DONATION_ID,
  donation_pool_id: TEST_POOL_ID,
  amount: TEST_DONATION_AMOUNT,
  donor_user_id: TEST_USER_ID,
  message: 'Test donation message',
  payment_hash: TEST_PAYMENT_HASH,
  status: 'pending' as const,
}

const MOCK_ANONYMOUS_DONATION = {
  id: TEST_DONATION_ID,
  donation_pool_id: TEST_POOL_ID,
  amount: TEST_DONATION_AMOUNT,
  donor_user_id: null,
  message: 'Anonymous donation',
  payment_hash: TEST_PAYMENT_HASH,
  status: 'pending' as const,
}

const MOCK_DONOR_PROFILE = {
  id: TEST_USER_ID,
  balance: 50000,
}

const MOCK_INSUFFICIENT_BALANCE_PROFILE = {
  id: TEST_USER_ID,
  balance: 5000, // Less than TEST_DONATION_AMOUNT
}

/**
 * Creates a mock Supabase client with chainable query builder pattern
 */
function createMockSupabaseClient(mockData: {
  donation?: any
  donorProfile?: any
  updateError?: any
  selectError?: any
  profileError?: any
  txError?: any
  balanceError?: any
  rpcError?: any
  activityError?: any
} = {}) {
  // Track which tables have been accessed
  const mockTransactionsInsert = vi.fn((data: any) => {
    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'test-transaction-id' },
          error: mockData.txError || null,
        }),
      }),
    }
  })

  const mockActivitiesInsert = vi.fn((data: any) => {
    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'test-activity-id' },
          error: mockData.activityError || null,
        }),
      }),
    }
  })

  const mockDonationsUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: mockData.updateError || null,
    }),
  })

  // Create chainable eq for supporting multiple .eq() calls
  const createChainableEq = (finalData: any, finalError: any) => {
    const chain: any = {
      eq: vi.fn(function(this: any) {
        return this
      }),
      single: vi.fn().mockResolvedValue({
        data: finalData,
        error: finalError,
      }),
    }
    // Make eq return the chain itself for chaining
    chain.eq.mockReturnValue(chain)
    return chain
  }

  const mockDonationsSelect = vi.fn((fields: string) => {
    return createChainableEq(mockData.donation || null, mockData.selectError || null)
  })

  const mockProfilesSelect = vi.fn((fields: string) => {
    return {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: mockData.donorProfile || null,
          error: mockData.profileError || null,
        }),
      }),
    }
  })

  const mockProfilesUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: mockData.balanceError || null,
    }),
  })

  const mockFrom = vi.fn((table: string) => {
    if (table === 'donations') {
      return {
        update: mockDonationsUpdate,
        select: mockDonationsSelect,
      }
    }
    if (table === 'profiles') {
      return {
        select: mockProfilesSelect,
        update: mockProfilesUpdate,
      }
    }
    if (table === 'transactions') {
      return {
        insert: mockTransactionsInsert,
      }
    }
    if (table === 'activities') {
      return {
        insert: mockActivitiesInsert,
      }
    }
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  })

  const mockRpc = vi.fn().mockResolvedValue({
    data: null,
    error: mockData.rpcError || null,
  })

  return {
    from: mockFrom,
    rpc: mockRpc,
  }
}

describe('checkDonationPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Invoice Settlement Verification', () => {
    it('should detect settled invoices and complete donation', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      expect(result.amountPaid).toBe(String(TEST_DONATION_AMOUNT))
      expect(checkInvoice).toHaveBeenCalledWith(TEST_PAYMENT_HASH)
    })

    it('should handle unsettled invoices without updating status', async () => {
      const mockUnsettledInvoice = createMockUnsettledInvoiceResponse()
      vi.mocked(checkInvoice).mockResolvedValue(mockUnsettledInvoice)

      const mockSupabase = createMockSupabaseClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(false)
      expect(mockSupabase.from).not.toHaveBeenCalledWith('donations')
    })

    it('should verify amountPaid matches donation amount', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.amountPaid).toBe(String(TEST_DONATION_AMOUNT))
    })

    it('should update donation status to completed with timestamp', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const updateCall = mockSupabase.from('donations').update as any
      expect(updateCall).toHaveBeenCalledWith({
        status: 'completed',
        completed_at: expect.any(String),
      })
    })
  })

  describe('Registered User Donations', () => {
    it('should deduct balance for registered users', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      // Verify balance was updated
      const profileFrom = mockSupabase.from('profiles')
      const updateCall = (profileFrom as any).update
      expect(updateCall).toHaveBeenCalledWith({
        balance: MOCK_DONOR_PROFILE.balance - TEST_DONATION_AMOUNT,
        updated_at: expect.any(String),
      })
    })

    it('should create internal transaction record for registered user', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const transactionsFrom = mockSupabase.from('transactions')
      const insertCall = (transactionsFrom as any).insert
      expect(insertCall).toHaveBeenCalledWith({
        user_id: TEST_USER_ID,
        type: 'internal',
        amount: -TEST_DONATION_AMOUNT,
        status: 'completed',
        memo: expect.stringContaining(`Donation to ${TEST_POOL_ID}`),
      })
    })

    it('should handle insufficient balance gracefully', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_INSUFFICIENT_BALANCE_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      // Should still succeed but log warning
      expect(result.success).toBe(true)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('insufficient balance')
      )

      // Should NOT create transaction or update balance
      // When insufficient balance, transactions table is never accessed
      const transactionsFrom = mockSupabase.from('transactions')
      expect(transactionsFrom.insert).not.toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
    })

    it('should include donation message in transaction memo', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const donationWithMessage = {
        ...MOCK_DONATION,
        message: 'For the community!',
      }

      const mockSupabase = createMockSupabaseClient({
        donation: donationWithMessage,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const transactionsFrom = mockSupabase.from('transactions')
      const insertCall = (transactionsFrom as any).insert
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          memo: expect.stringContaining('For the community!'),
        })
      )
    })

    it('should update user profile balance correctly', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const expectedBalance = MOCK_DONOR_PROFILE.balance - TEST_DONATION_AMOUNT

      const profileFrom = mockSupabase.from('profiles')
      const updateCall = (profileFrom as any).update
      expect(updateCall).toHaveBeenCalledWith({
        balance: expectedBalance,
        updated_at: expect.any(String),
      })
    })
  })

  describe('Anonymous Donations', () => {
    it('should complete donation without balance deduction', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)

      // Should NOT query profiles or create transactions
      const profilesFrom = mockSupabase.from('profiles')
      expect(profilesFrom.select).not.toHaveBeenCalled()
    })

    it('should increment pool balance for anonymous donations', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_donation_pool', {
        pool_id: TEST_POOL_ID,
        amount: TEST_DONATION_AMOUNT,
      })
    })

    it('should create activity with null user_id for anonymous donations', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const activitiesFrom = mockSupabase.from('activities')
      const insertCall = (activitiesFrom as any).insert
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: null,
          type: 'donation',
          metadata: expect.objectContaining({
            amount: TEST_DONATION_AMOUNT,
            pool_id: TEST_POOL_ID,
          }),
        })
      )
    })
  })

  describe('Pool Management', () => {
    it('should atomically increment donation pool totals', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_donation_pool', {
        pool_id: TEST_POOL_ID,
        amount: TEST_DONATION_AMOUNT,
      })
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1)
    })

    it('should use RPC for atomic pool balance updates', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      // Verify RPC was called (not direct update)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_donation_pool', {
        pool_id: TEST_POOL_ID,
        amount: TEST_DONATION_AMOUNT,
      })
    })

    it('should handle pool increment for multiple donation amounts', async () => {
      const largeDonation = 100000
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(largeDonation),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: { ...MOCK_ANONYMOUS_DONATION, amount: largeDonation },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_donation_pool', {
        pool_id: TEST_POOL_ID,
        amount: largeDonation,
      })
    })
  })

  describe('Activity Logging', () => {
    it('should create activity record with donation metadata', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const activitiesFrom = mockSupabase.from('activities')
      const insertCall = (activitiesFrom as any).insert
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          user_id: TEST_USER_ID,
          type: 'donation',
          related_id: expect.any(String),
          related_table: 'donations',
          timestamp: expect.any(String),
          metadata: {
            amount: TEST_DONATION_AMOUNT,
            message: MOCK_DONATION.message,
            pool_id: TEST_POOL_ID,
          },
        })
      )
    })

    it('should include donation message in activity metadata', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const donationWithMessage = {
        ...MOCK_DONATION,
        message: 'Supporting the community!',
      }

      const mockSupabase = createMockSupabaseClient({
        donation: donationWithMessage,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      const activitiesFrom = mockSupabase.from('activities')
      const insertCall = (activitiesFrom as any).insert
      expect(insertCall).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            message: 'Supporting the community!',
          }),
        })
      )
    })
  })

  describe('Error Scenarios', () => {
    it('should handle Lightning node failures', async () => {
      const mockErrorResponse = createMockInvoiceErrorResponse(
        'Lightning node unavailable'
      )
      vi.mocked(checkInvoice).mockResolvedValue(mockErrorResponse)

      const mockSupabase = createMockSupabaseClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      // Should not update donation status
      expect(mockSupabase.from).not.toHaveBeenCalledWith('donations')
    })

    it('should handle database update failures gracefully', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
        updateError: { message: 'Database update failed' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      // Should still return success (graceful degradation)
      expect(result.success).toBe(true)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating donation status:',
        expect.any(Object)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should not modify state on verification failure', async () => {
      const mockErrorResponse = createMockInvoiceErrorResponse('Invalid payment hash')
      vi.mocked(checkInvoice).mockResolvedValue(mockErrorResponse)

      const mockSupabase = createMockSupabaseClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      // No database operations should be performed
      expect(mockSupabase.from).not.toHaveBeenCalled()
      expect(mockSupabase.rpc).not.toHaveBeenCalled()
    })

    it('should log errors for debugging', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(checkInvoice).mockRejectedValue(new Error('Network timeout'))

      const mockSupabase = createMockSupabaseClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to check payment status')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking donation payment:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should handle missing donation record gracefully', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: null,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      // Should still return success but not process further
      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      // Should not call RPC if no donation found
      expect(mockSupabase.rpc).not.toHaveBeenCalled()
    })

    it('should handle profile fetch errors for registered users', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        profileError: { message: 'Profile not found' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      // Should still complete donation
      expect(result.success).toBe(true)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching donor profile:',
        expect.any(Object)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should handle transaction creation errors', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
        txError: { message: 'Transaction insert failed' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error creating donation transaction:',
        expect.any(Object)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should handle balance update errors', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
        balanceError: { message: 'Balance update failed' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating donor balance:',
        expect.any(Object)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Service Role Access', () => {
    it('should use service role key for admin operations', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete registered user donation flow', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION,
        donorProfile: MOCK_DONOR_PROFILE,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      // Verify complete flow
      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)

      // 1. Donation status updated
      const donationsFrom = mockSupabase.from('donations')
      expect((donationsFrom as any).update).toHaveBeenCalled()

      // 2. Transaction created
      const transactionsFrom = mockSupabase.from('transactions')
      expect((transactionsFrom as any).insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'internal',
          amount: -TEST_DONATION_AMOUNT,
        })
      )

      // 3. Balance updated
      const profilesFrom = mockSupabase.from('profiles')
      expect((profilesFrom as any).update).toHaveBeenCalled()

      // 4. Pool incremented
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_donation_pool', {
        pool_id: TEST_POOL_ID,
        amount: TEST_DONATION_AMOUNT,
      })

      // 5. Activity logged
      const activitiesFrom = mockSupabase.from('activities')
      expect((activitiesFrom as any).insert).toHaveBeenCalled()
    })

    it('should handle complete anonymous donation flow', async () => {
      const mockSettledInvoice = createMockSettledInvoiceResponse({
        amountPaid: String(TEST_DONATION_AMOUNT),
      })
      vi.mocked(checkInvoice).mockResolvedValue(mockSettledInvoice)

      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_ANONYMOUS_DONATION,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationPayment(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)

      // 1. Donation status updated
      const donationsFrom = mockSupabase.from('donations')
      expect((donationsFrom as any).update).toHaveBeenCalled()

      // 2. Pool incremented
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_donation_pool', {
        pool_id: TEST_POOL_ID,
        amount: TEST_DONATION_AMOUNT,
      })

      // 3. Activity logged with null user_id
      const activitiesFrom = mockSupabase.from('activities')
      expect((activitiesFrom as any).insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: null,
        })
      )

      // 4. No transaction created
      const transactionsFrom = mockSupabase.from('transactions')
      expect(transactionsFrom.insert).not.toHaveBeenCalled()

      // 5. No profile balance updated
      const profilesFrom = mockSupabase.from('profiles')
      expect((profilesFrom as any).select).not.toHaveBeenCalled()
    })
  })
})

describe('checkDonationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test fixture for donation with donation_pools relation
  const MOCK_DONATION_WITH_POOL = {
    id: TEST_DONATION_ID,
    donation_pool_id: TEST_POOL_ID,
    amount: TEST_DONATION_AMOUNT,
    donor_user_id: TEST_USER_ID,
    message: 'Test donation message',
    payment_hash: TEST_PAYMENT_HASH,
    payment_request: 'lnbc100n1...',
    status: 'pending' as const,
    donor_name: 'Test Donor',
    created_at: '2024-01-01T00:00:00Z',
    completed_at: null,
    donation_pools: {
      id: TEST_POOL_ID,
      location_type: 'city' as const,
      location_name: 'Test City',
      location_code: 'TC',
      latitude: 40.7128,
      longitude: -74.0060,
      total_donated: 100000,
      current_balance: 50000,
      total_boosted: 10000,
      boost_percentage: 10,
      max_daily_boost: 5000,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
  }

  describe('Success Path', () => {
    it('should return pending donation with donation_pools relation', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(result.donation).toEqual(MOCK_DONATION_WITH_POOL)
      expect(result.donation.status).toBe('pending')
      expect(result.donation.donation_pools).toBeDefined()
      expect(result.donation.donation_pools.location_name).toBe('Test City')
    })

    it('should use service role key for database access', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })
    })

    it('should query donations table with correct select', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(mockSupabase.from).toHaveBeenCalledWith('donations')
      const donationsFrom = mockSupabase.from('donations')
      expect((donationsFrom as any).select).toHaveBeenCalledWith('*, donation_pools(*)')
    })

    it('should filter by payment_hash and pending status', async () => {
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: MOCK_DONATION_WITH_POOL,
        error: null,
      })

      const mockSelect = vi.fn(() => ({
        eq: mockEq,
        single: mockSingle,
      }))

      const mockFrom = vi.fn(() => ({
        select: mockSelect,
      }))

      const mockSupabase = {
        from: mockFrom,
        rpc: vi.fn(),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await checkDonationStatus(TEST_PAYMENT_HASH)

      // Verify both eq calls (payment_hash and status)
      expect(mockEq).toHaveBeenCalledTimes(2)
    })

    it('should return donation with all required fields', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(true)
      expect(result.donation).toHaveProperty('id')
      expect(result.donation).toHaveProperty('donation_pool_id')
      expect(result.donation).toHaveProperty('amount')
      expect(result.donation).toHaveProperty('payment_hash')
      expect(result.donation).toHaveProperty('status')
      expect(result.donation).toHaveProperty('created_at')
      expect(result.donation).toHaveProperty('donation_pools')
    })
  })

  describe('Not Found Scenarios', () => {
    it('should return error when no pending donation found', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: null,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Donation not found')
      expect(result.donation).toBeUndefined()
    })

    it('should handle non-existent payment hash', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: null,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus('non-existent-payment-hash')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Donation not found')
    })

    it('should return error when donation exists but not pending', async () => {
      // This simulates a completed donation not returned by the pending filter
      const mockSupabase = createMockSupabaseClient({
        donation: null, // Query returns null because status != 'pending'
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Donation not found')
    })
  })

  describe('Error Handling', () => {
    it('should handle database query errors gracefully', async () => {
      const mockSupabase = createMockSupabaseClient({
        selectError: { message: 'Database connection failed' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      // When Supabase returns an error, the data is null
      // The function treats this as "not found" rather than throwing
      expect(result.success).toBe(false)
      expect(result.error).toBe('Donation not found')
    })

    it('should handle Supabase client creation errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Failed to create Supabase client')
      })

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error occurred')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking donation status:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should not throw uncaught errors', async () => {
      const mockSupabase = createMockSupabaseClient({
        selectError: new Error('Database error'),
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      // Should not throw - error is caught and handled
      await expect(checkDonationStatus(TEST_PAYMENT_HASH)).resolves.toBeDefined()
    })

    it('should handle null Supabase client gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(createServerSupabaseClient).mockReturnValue(null as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error occurred')

      consoleErrorSpy.mockRestore()
    })

    it('should log errors for debugging when exceptions are thrown', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Make the Supabase client throw an actual exception
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Test database error')
      })

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error occurred')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking donation status:',
        expect.objectContaining({
          message: 'Test database error'
        })
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Function Limitations', () => {
    it('should return pending donation WITHOUT Lightning invoice verification', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      // Function returns pending donation
      expect(result.success).toBe(true)
      expect(result.donation.status).toBe('pending')
      
      // IMPORTANT: checkInvoice should NOT be called
      // This function is a database query only, not payment verification
      expect(checkInvoice).not.toHaveBeenCalled()
    })

    it('should document that manual Lightning verification is assumed', async () => {
      // This test documents the limitation noted in the function comment:
      // "Here you would check the Lightning invoice status - For now, we'll assume it's a manual process"
      
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      // Function only checks database status, not actual payment settlement
      expect(result.success).toBe(true)
      expect(result.donation.status).toBe('pending')
      
      // For actual payment verification, use checkDonationPayment instead
      expect(checkInvoice).not.toHaveBeenCalled()
    })
  })

  describe('Return Value Structure', () => {
    it('should return correct success structure', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: MOCK_DONATION_WITH_POOL,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('donation')
      expect(result.success).toBe(true)
      expect(typeof result.donation).toBe('object')
    })

    it('should return correct error structure', async () => {
      const mockSupabase = createMockSupabaseClient({
        donation: null,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const result = await checkDonationStatus(TEST_PAYMENT_HASH)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('error')
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe('string')
    })
  })
})