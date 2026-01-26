import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestTransaction } from '../helpers/transaction-test-utils'
import { setupBalanceCalculationMocks } from '../helpers/balance-calculation-helpers'

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}))

describe('calculateUserBalanceFromTransactions (lib/daily-summary.ts)', () => {
  let mockSupabase: any
  let calculateUserBalanceFromTransactions: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mocks using helper function
    const mocks = setupBalanceCalculationMocks()
    mockSupabase = mocks.mockSupabase
    calculateUserBalanceFromTransactions = mocks.calculateUserBalanceFromTransactions
  })

  describe('Core Balance Calculation Logic', () => {
    it('should correctly calculate balance with only deposit transactions', async () => {
      // Arrange
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1750)
      expect(result.breakdown).toEqual({
        deposits: 1750,
        withdrawals: 0,
        internal: 0
      })
      expect(result.transactionCount).toBe(3)
    })

    it('should correctly calculate balance with deposits and withdrawals', async () => {
      // Arrange
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 2000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'withdrawal', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'withdrawal', amount: 300, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(2200) // 2000 - 500 + 1000 - 300
      expect(result.breakdown).toEqual({
        deposits: 3000,
        withdrawals: 800,
        internal: 0
      })
      expect(result.transactionCount).toBe(4)
    })

    it('should handle internal transfers with positive and negative amounts', async () => {
      // Arrange
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'internal', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -200, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1300) // 1000 + 500 - 200
      expect(result.breakdown.internal).toBe(300)
    })

    it('should only count completed transactions and ignore pending/failed', async () => {
      // Arrange: Mix of completed, pending, and failed transactions
      // Since the query filters by status='completed', only completed transactions are returned
      const allTransactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'pending' }),
        createTestTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'failed' }),
        createTestTransaction({ id: 'tx-4', type: 'withdrawal', amount: 200, status: 'pending' })
      ]
      
      // The query filters by status='completed', so only return completed transactions
      const completedTransactions = allTransactions.filter(tx => tx.status === 'completed')

      mockSupabase.order.mockResolvedValueOnce({
        data: completedTransactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Only tx-1 (completed) should be counted
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1000)
      expect(result.breakdown.deposits).toBe(1000)
      expect(result.transactionCount).toBe(1) // Only 1 completed transaction
    })
  })

  describe('Promotional Balance Handling (Free Sats Users)', () => {
    it('should return zero balance for user with 5000 sats promotional balance but no transactions', async () => {
      // Arrange: Common scenario - 5000 free sats in profile, no transaction history
      // This represents the promotional balance that was credited without a transaction record
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Calculated balance must be 0 since there are no transactions
      // This would create a 5000 sat discrepancy when compared to profile balance
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 0,
        internal: 0
      })
    })

    it('should detect free sats users with various promotional amounts', async () => {
      // Arrange: Test common promotional amounts (1000, 5000, 8000 sats)
      const testAmounts = [1000, 5000, 8000]

      for (const amount of testAmounts) {
        mockSupabase.order.mockResolvedValueOnce({
          data: [],
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions(`free-sats-user-${amount}`)

        // Assert: All should return zero calculated balance
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(0)
        expect(result.transactionCount).toBe(0)
      }
    })

    it('should calculate negative balance when free sats user makes withdrawal', async () => {
      // Arrange: Free sats user (5000 in profile) makes withdrawal
      // Important: The free sats amount is NOT in transaction history
      const transactions = [
        createTestTransaction({ 
          id: 'tx-1', 
          type: 'withdrawal', 
          amount: 2000, 
          status: 'completed' 
        })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Should show -2000 (withdrawal only, free sats not included)
      // This negative balance indicates the free sats weren't properly recorded
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(-2000)
      expect(result.transactionCount).toBe(1)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 2000,
        internal: 0
      })
    })

    it('should not include promotional amounts in transaction-based calculation', async () => {
      // Arrange: Free sats user with additional deposit
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'withdrawal', amount: 500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Should only calculate 500 (1000 deposit - 500 withdrawal)
      // Should NOT include any promotional 5000 sats
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(500)
      expect(result.breakdown).toEqual({
        deposits: 1000,
        withdrawals: 500,
        internal: 0
      })
    })

    it('should identify free sats users by pattern: zero balance and zero transactions', async () => {
      // Arrange: Pattern for detecting free sats users:
      // profileBalance === 5000 && calculatedBalance === 0 && transactionCount === 0
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: All three conditions met for free sats user detection
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0)
      
      // This pattern is used by fixFreeSatsUsers() in scripts
      const isFreeSatsUser = result.calculatedBalance === 0 && result.transactionCount === 0
      expect(isFreeSatsUser).toBe(true)
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle user with no transactions', async () => {
      // Arrange
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 0,
        internal: 0
      })
    })

    it('should handle very large transaction amounts (Bitcoin max supply)', async () => {
      // Arrange: Bitcoin's maximum supply in satoshis (21M BTC)
      const bitcoinMaxSupplySats = 2100000000000000
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: bitcoinMaxSupplySats, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('whale-user')

      // Assert: Should handle max Bitcoin supply without precision loss
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(bitcoinMaxSupplySats)
      expect(result.breakdown.deposits).toBe(bitcoinMaxSupplySats)
    })

    it('should handle negative balance (more withdrawals than deposits)', async () => {
      // Arrange
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ type: 'withdrawal', amount: 1500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(-500)
    })

    it('should handle zero amount transactions', async () => {
      // Arrange: Zero amounts should not affect calculation
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 0, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'withdrawal', amount: 200, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 0, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Zero amounts should not affect balance
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(800)
      expect(result.breakdown.deposits).toBe(1000)
    })

    it('should maintain precision with single satoshi transactions', async () => {
      // Arrange: Test minimum unit (1 sat) precision
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 1, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'withdrawal', amount: 1, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Must preserve exact precision (1 + 1 - 1 = 1)
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1)
      expect(result.breakdown.deposits).toBe(2)
      expect(result.breakdown.withdrawals).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should return error when database query fails', async () => {
      // Arrange
      mockSupabase.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed', code: 'DB_ERROR' }
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Database connection failed')
    })

    it('should handle unexpected errors gracefully', async () => {
      // Arrange
      mockSupabase.order.mockRejectedValueOnce(new Error('Unexpected error'))

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error')
    })

    it('should handle network timeout errors', async () => {
      // Arrange
      mockSupabase.order.mockRejectedValueOnce(new Error('Network timeout'))

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('should handle null transaction data gracefully', async () => {
      // Arrange: When data is null but no error is reported (edge case)
      // This represents an unexpected state from Supabase
      mockSupabase.order.mockResolvedValueOnce({
        data: null,
        error: null
      })

      // Act: Should handle null gracefully (treats as empty array)
      const result = await calculateUserBalanceFromTransactions('user-123')
      
      // Assert: With null handling (transactions || []), should return success with 0 balance
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0)
    })
  })

  describe('Complex Real-World Scenarios', () => {
    it('should handle typical user journey with mixed transactions', async () => {
      // Arrange: Deposit, purchases (internal), rewards, withdrawal
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'internal', amount: -2500, status: 'completed' }), // Purchase
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -1500, status: 'completed' }), // Purchase
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 500, status: 'completed' }),   // Reward
        createTestTransaction({ id: 'tx-5', type: 'internal', amount: -1000, status: 'completed' }), // Purchase
        createTestTransaction({ id: 'tx-6', type: 'withdrawal', amount: 3000, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: 10000 - 2500 - 1500 + 500 - 1000 - 3000 = 2500
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(2500)
      expect(result.breakdown).toEqual({
        deposits: 10000,
        withdrawals: 3000,
        internal: -4500
      })
    })

    it('should handle merchant scenario with multiple incoming/outgoing payments', async () => {
      // Arrange: Business receiving payments and paying suppliers
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'internal', amount: 5000, status: 'completed' }),  // Customer
        createTestTransaction({ id: 'tx-2', type: 'internal', amount: 3000, status: 'completed' }),  // Customer
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -2000, status: 'completed' }), // Supplier
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 4500, status: 'completed' }),  // Customer
        createTestTransaction({ id: 'tx-5', type: 'internal', amount: -1500, status: 'completed' }), // Supplier
        createTestTransaction({ id: 'tx-6', type: 'withdrawal', amount: 7000, status: 'completed' }) // Cash out
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('merchant-123')

      // Assert: 5000 + 3000 - 2000 + 4500 - 1500 - 7000 = 2000
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(2000)
      expect(result.breakdown.internal).toBe(9000)
    })

    it('should handle corrective transaction sequence after balance discrepancy', async () => {
      // Arrange: Balance was corrected via internal adjustments
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2000, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -500, status: 'completed' }),  // Correction
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 1000, status: 'completed' })   // Compensation
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: 5000 - 2000 - 500 + 1000 = 3500
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(3500)
      expect(result.breakdown).toEqual({
        deposits: 5000,
        withdrawals: 2000,
        internal: 500
      })
    })
  })

  describe('Balance Discrepancy Detection', () => {
    it('should enable discrepancy detection by returning calculated vs profile balance difference', async () => {
      // Arrange: Simulate a user with balance mismatch
      const profileBalance = 5000
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Calculate discrepancy (done by calling code/audit scripts)
      expect(result.success).toBe(true)
      const discrepancy = profileBalance - result.calculatedBalance
      expect(discrepancy).toBe(5000)
      expect(Math.abs(discrepancy)).toBeGreaterThan(0)
    })

    it('should enable identification of users requiring balance correction', async () => {
      // Arrange: Free sats user with transactions
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: For profile balance 6000, would show 5000 sat discrepancy
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1000)
      
      // Calling code would compare: profileBalance (6000) - calculatedBalance (1000) = 5000 discrepancy
      const mockProfileBalance = 6000
      const discrepancy = mockProfileBalance - result.calculatedBalance
      expect(discrepancy).toBe(5000) // Indicates free sats scenario
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle 1000 transactions efficiently', async () => {
      // Arrange
      const transactions = Array.from({ length: 1000 }, (_, i) => 
        createTestTransaction({
          id: `tx-${i}`,
          type: i % 2 === 0 ? 'deposit' : 'withdrawal',
          amount: 100,
          status: 'completed'
        })
      )

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const startTime = Date.now()
      const result = await calculateUserBalanceFromTransactions('user-123')
      const duration = Date.now() - startTime

      // Assert
      expect(result.success).toBe(true)
      expect(result.transactionCount).toBe(1000)
      expect(result.calculatedBalance).toBe(0) // 500 deposits - 500 withdrawals
      expect(duration).toBeLessThan(100) // Should complete quickly with mocked data
    })

    it('should maintain accuracy with many small transactions', async () => {
      // Arrange: 100 micro-payments of 10 sats each
      const transactions = Array.from({ length: 100 }, (_, i) =>
        createTestTransaction({
          id: `tx-${i}`,
          type: 'deposit',
          amount: 10,
          status: 'completed'
        })
      )

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: 100 × 10 sats = 1000 sats
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1000)
      expect(result.breakdown.deposits).toBe(1000)
      expect(result.transactionCount).toBe(100)
    })
  })

  describe('Mathematical Invariants and Financial Accuracy', () => {
    it('should maintain invariant: balance = deposits - withdrawals + internal', async () => {
      // Arrange: Test the fundamental balance equation
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 8000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: 1500, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'deposit', amount: 3000, status: 'completed' }),
        createTestTransaction({ id: 'tx-5', type: 'internal', amount: -800, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Verify the fundamental invariant holds
      expect(result.success).toBe(true)
      
      const manualCalculation = result.breakdown.deposits - result.breakdown.withdrawals + result.breakdown.internal
      expect(result.calculatedBalance).toBe(manualCalculation)
      
      // Verify specific values
      expect(result.breakdown.deposits).toBe(11000)
      expect(result.breakdown.withdrawals).toBe(2500)
      expect(result.breakdown.internal).toBe(700)
      expect(result.calculatedBalance).toBe(9200)
    })

    it('should handle identity element: adding zero-amount transactions should not affect balance', async () => {
      // Arrange: Zero amounts are identity elements for addition
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 0, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'withdrawal', amount: 0, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 0, status: 'completed' }),
        createTestTransaction({ id: 'tx-5', type: 'withdrawal', amount: 1000, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Zero amounts should not affect the balance calculation
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(4000)
      expect(result.breakdown.deposits).toBe(5000)
      expect(result.breakdown.withdrawals).toBe(1000)
    })

    it('should maintain precision with prime number amounts (no common factors)', async () => {
      // Arrange: Test with prime numbers to ensure no hidden rounding issues
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 7919, status: 'completed' }),    // Prime
        createTestTransaction({ id: 'tx-2', type: 'withdrawal', amount: 5303, status: 'completed' }), // Prime
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: 4787, status: 'completed' }),   // Prime
        createTestTransaction({ id: 'tx-4', type: 'deposit', amount: 9973, status: 'completed' }),    // Prime
        createTestTransaction({ id: 'tx-5', type: 'internal', amount: -3391, status: 'completed' })   // Prime
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Verify exact arithmetic with no common factors
      expect(result.success).toBe(true)
      expect(result.breakdown.deposits).toBe(17892)
      expect(result.breakdown.withdrawals).toBe(5303)
      expect(result.breakdown.internal).toBe(1396)
      expect(result.calculatedBalance).toBe(13985)
    })
  })

  describe('Supabase Query Validation', () => {
    it('should query transactions table with correct filters', async () => {
      // Arrange
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      await calculateUserBalanceFromTransactions('user-123')

      // Assert: Verify correct query structure
      expect(mockSupabase.from).toHaveBeenCalledWith('transactions')
      expect(mockSupabase.select).toHaveBeenCalledWith('*')
      // Check both .eq() calls - should be called with user_id and status filters
      const eqCalls = mockSupabase.eq.mock.calls
      expect(eqCalls).toContainEqual(['user_id', 'user-123'])
      expect(eqCalls).toContainEqual(['status', 'completed'])
    })
  })
})
