import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createTestTransaction } from '../helpers/transaction-test-utils'
import { setupBalanceCalculationMocks } from '../helpers/balance-calculation-helpers'

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}))

// Test data factory - simplified wrapper for createTestTransaction
const createTransaction = (overrides = {}) => createTestTransaction({
  id: 'tx-123',
  user_id: 'user-123',
  type: 'deposit',
  amount: 1000,
  status: 'completed',
  created_at: '2024-01-01T00:00:00Z',
  ...overrides
})

describe('calculateUserBalanceFromTransactions', () => {
  let mockSupabase: any
  let calculateUserBalanceFromTransactions: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mocks using helper function
    const mocks = setupBalanceCalculationMocks()
    mockSupabase = mocks.mockSupabase
    calculateUserBalanceFromTransactions = mocks.calculateUserBalanceFromTransactions
  })

  describe('Balance Calculations', () => {
    it('should calculate balance correctly with only deposits', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'completed' })
      ]

      // The last method in the chain (.order) needs to resolve with the data
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

    it('should calculate balance correctly with deposits and withdrawals', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 2000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 500, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-4', type: 'withdrawal', amount: 300, status: 'completed' })
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
    })

    it('should handle internal transfers correctly', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'internal', amount: 500, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'internal', amount: -200, status: 'completed' })
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
      expect(result.breakdown.internal).toBe(300) // 500 + (-200)
    })

    it('should ignore non-completed transactions', async () => {
      // Arrange: Mix of completed, pending, and failed transactions
      // The query filters by status='completed', so only completed transactions are returned
      const allTransactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'pending' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'failed' })
      ]
      
      // Mock only returns completed transactions (filtered by DB query)
      const completedTransactions = allTransactions.filter(tx => tx.status === 'completed')

      mockSupabase.order.mockResolvedValueOnce({
        data: completedTransactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1000) // Only completed transaction
      expect(result.breakdown.deposits).toBe(1000)
    })
  })

  describe('Edge Cases', () => {
    it('should return zero balance for user with no transactions', async () => {
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

    it('should handle very large transaction amounts', async () => {
      // Arrange
      const transactions = [
        createTransaction({ type: 'deposit', amount: 21000000, status: 'completed' }) // 0.21 BTC in sats
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(21000000)
    })

    it('should handle negative balance (more withdrawals than deposits)', async () => {
      // Arrange
      const transactions = [
        createTransaction({ type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ type: 'withdrawal', amount: 1500, status: 'completed' })
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
  })

  describe('Free Sats Users - Promotional Balance Edge Cases', () => {
    // Parameterized test helper for testing different promotional amounts
    const testZeroBalanceWithPromotionalAmount = async (amount: number) => {
      // Arrange: Simulates a free sats user with promotional sats in profile but no transaction history
      // This is a common scenario where users received promotional sats without transaction records
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions(`free-sats-user-${amount}`)

      // Assert: Calculated balance must be 0 since there are no transactions
      // This would create a discrepancy when compared to profile balance
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 0,
        internal: 0
      })
    }

    it('should correctly return zero balance for user with 1000 sats promotional balance but no transactions', async () => {
      await testZeroBalanceWithPromotionalAmount(1000)
    })

    it('should correctly return zero balance for user with 5000 sats promotional balance but no transactions', async () => {
      // This is the most common free sats amount and the exact pattern detected by fix-free-sats-users.js
      await testZeroBalanceWithPromotionalAmount(5000)
    })

    it('should correctly return zero balance for user with 8000 sats promotional balance but no transactions', async () => {
      await testZeroBalanceWithPromotionalAmount(8000)
    })

    it('should calculate correct balance when free sats user makes first transaction', async () => {
      // Arrange: User with 5000 free sats (in profile) makes their first withdrawal
      // Important: The free sats amount is NOT in transaction history
      const transactions = [
        createTransaction({ 
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

      // Assert: Should show -2000 (withdrawal only, free sats not included in calculation)
      // This negative balance indicates the free sats weren't properly recorded as a transaction
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(-2000)
      expect(result.transactionCount).toBe(1)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 2000,
        internal: 0
      })
    })

    it('should not include promotional amounts in balance calculation', async () => {
      // Arrange: Verify function only calculates from actual transaction records
      // Even if user has 5000 sats promotional balance in profile
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Should only show 500 (1000 deposit - 500 withdrawal)
      // Should NOT include any promotional 5000 sats
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(500)
      expect(result.transactionCount).toBe(2)
      expect(result.breakdown).toEqual({
        deposits: 1000,
        withdrawals: 500,
        internal: 0
      })
    })

    it('should handle free sats user with multiple transactions correctly', async () => {
      // Arrange: Free sats user with transaction history after receiving promotional balance
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 3000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 8000, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 2000, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: 3000 + 2000 - 8000 = -3000 (negative balance from over-withdrawal)
      // Profile might show 2000 (5000 free + 3000 + 2000 - 8000) creating 5000 sat discrepancy
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(-3000)
      expect(result.transactionCount).toBe(3)
      expect(result.breakdown).toEqual({
        deposits: 5000,
        withdrawals: 8000,
        internal: 0
      })
    })

    it('should identify discrepancy between profile balance and calculated balance for free sats users', async () => {
      // Arrange: Simulate detection scenario - user has 5000 in profile but 0 calculated
      // This is the exact scenario that fix-free-sats-users.js and audit scripts detect
      const profileBalance = 5000
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Calculated balance is 0, profile balance is 5000
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0)
      
      // Manual discrepancy check (as done by audit scripts)
      const discrepancy = profileBalance - result.calculatedBalance
      expect(discrepancy).toBe(5000)
      expect(discrepancy).toBeGreaterThan(0) // Indicates free sats scenario
    })

    it('should handle free sats user with internal transfers correctly', async () => {
      // Arrange: Free sats user receiving internal transfer (e.g., from reward)
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'internal', amount: 1500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Should show 1500 from internal transfer only
      // If profile shows 6500, there's a 5000 sat discrepancy (free sats)
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1500)
      expect(result.transactionCount).toBe(1)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 0,
        internal: 1500
      })
    })

    it('should maintain precision when calculating small balances for free sats users', async () => {
      // Arrange: Test with small amounts to ensure no data loss or rounding errors
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 1, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('free-sats-user')

      // Assert: Should maintain exact precision, no data loss
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(2)
      expect(result.breakdown.deposits).toBe(1)
      expect(result.breakdown.withdrawals).toBe(1)
    })

    it('should detect free sats users by comparing transaction count and balance', async () => {
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
      expect(result.calculatedBalance).toBe(0) // Condition 1
      expect(result.transactionCount).toBe(0) // Condition 2
      // Condition 3 (profileBalance === 5000) would be checked by caller
      
      // This pattern is used by fixFreeSatsUsers() in scripts/fix-free-sats-users.js
      const isFreeSatsUser = result.calculatedBalance === 0 && result.transactionCount === 0
      expect(isFreeSatsUser).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return error when database query fails', async () => {
      // Arrange
      mockSupabase.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' }
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
  })

  describe('Large Dataset Performance', () => {
    it('should handle 1000 transactions efficiently', async () => {
      // Arrange
      const transactions = Array.from({ length: 1000 }, (_, i) => 
        createTransaction({
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
      // 500 deposits (+50000) - 500 withdrawals (-50000) = 0
      expect(result.calculatedBalance).toBe(0)
      expect(duration).toBeLessThan(100) // Should complete quickly with mocked data
    })

    it('should handle 10000 transactions without memory issues', async () => {
      // Arrange
      const transactions = Array.from({ length: 10000 }, (_, i) => 
        createTransaction({
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

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(100000)
      expect(result.transactionCount).toBe(10000)
    })
  })

  describe('Transaction Order Handling', () => {
    it('should process transactions in chronological order', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, created_at: '2024-01-01T00:00:00Z', status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 500, created_at: '2024-01-02T00:00:00Z', status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 200, created_at: '2024-01-03T00:00:00Z', status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(700) // 1000 - 500 + 200
      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: true })
    })
  })

  describe('Mixed Transaction Status Scenarios', () => {
    it('should correctly filter mixed completed, pending, and failed transactions', async () => {
      // Arrange: Real-world scenario with various transaction statuses
      // The query filters by status='completed', so only completed transactions are returned
      const allTransactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 2000, status: 'pending' }),
        createTransaction({ id: 'tx-3', type: 'withdrawal', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-4', type: 'withdrawal', amount: 500, status: 'failed' }),
        createTransaction({ id: 'tx-5', type: 'internal', amount: 300, status: 'completed' }),
        createTransaction({ id: 'tx-6', type: 'internal', amount: 1000, status: 'pending' })
      ]
      
      // Mock only returns completed transactions (filtered by DB query)
      const completedTransactions = allTransactions.filter(tx => tx.status === 'completed')

      mockSupabase.order.mockResolvedValueOnce({
        data: completedTransactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Only completed transactions should count (5000 - 1000 + 300 = 4300)
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(4300)
      expect(result.transactionCount).toBe(3) // Only 3 completed transactions
      expect(result.breakdown).toEqual({
        deposits: 5000,     // Only tx-1 (completed)
        withdrawals: 1000,  // Only tx-3 (completed)
        internal: 300       // Only tx-5 (completed)
      })
    })

    it('should handle user with all pending transactions correctly', async () => {
      // Arrange: Edge case where user has transactions but none are completed
      // The query filters by status='completed', so no transactions are returned
      const allTransactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'pending' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 5000, status: 'pending' })
      ]
      
      // Mock returns empty array since no completed transactions exist
      const completedTransactions = allTransactions.filter(tx => tx.status === 'completed')

      mockSupabase.order.mockResolvedValueOnce({
        data: completedTransactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Balance should be zero since no transactions are completed
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0) // No completed transactions
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 0,
        internal: 0
      })
    })

    it('should handle user with all failed transactions correctly', async () => {
      // Arrange: User attempted transactions but all failed
      // The query filters by status='completed', so no transactions are returned
      const allTransactions = [
        createTransaction({ id: 'tx-1', type: 'withdrawal', amount: 2000, status: 'failed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 1000, status: 'failed' }),
        createTransaction({ id: 'tx-3', type: 'internal', amount: 500, status: 'failed' })
      ]
      
      // Mock returns empty array since no completed transactions exist
      const completedTransactions = allTransactions.filter(tx => tx.status === 'completed')

      mockSupabase.order.mockResolvedValueOnce({
        data: completedTransactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Balance should be zero for all failed transactions
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.transactionCount).toBe(0) // No completed transactions
    })
  })

  describe('Boundary Value and Zero Amount Testing', () => {
    it('should handle zero amount deposit transaction', async () => {
      // Arrange: Edge case with zero amount (potentially from refunds or corrections)
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 0, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'withdrawal', amount: 200, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Zero amount should not affect calculation
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(800) // 1000 + 0 - 200
      expect(result.breakdown.deposits).toBe(1000)
    })

    it('should handle zero amount withdrawal transaction', async () => {
      // Arrange: Zero withdrawal (e.g., cancelled withdrawal)
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 0, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(5000)
      expect(result.breakdown.withdrawals).toBe(0)
    })

    it('should handle zero amount internal transfer', async () => {
      // Arrange: Zero internal transfer edge case
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'internal', amount: 0, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(0)
      expect(result.breakdown.internal).toBe(0)
    })
  })

  describe('Complex Real-World Balance Scenarios', () => {
    it('should handle typical user journey: deposit, multiple purchases, rewards, withdrawal', async () => {
      // Arrange: Realistic user transaction flow
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'internal', amount: -2500, status: 'completed' }), // Purchase 1
        createTransaction({ id: 'tx-3', type: 'internal', amount: -1500, status: 'completed' }), // Purchase 2
        createTransaction({ id: 'tx-4', type: 'internal', amount: 500, status: 'completed' }),   // Reward
        createTransaction({ id: 'tx-5', type: 'internal', amount: -1000, status: 'completed' }), // Purchase 3
        createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 3000, status: 'completed' })
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
        internal: -4500 // -2500 - 1500 + 500 - 1000
      })
    })

    it('should handle merchant scenario: receives payments, pays out to suppliers', async () => {
      // Arrange: Business use case with multiple incoming/outgoing transactions
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'internal', amount: 5000, status: 'completed' }),  // Customer payment
        createTransaction({ id: 'tx-2', type: 'internal', amount: 3000, status: 'completed' }),  // Customer payment
        createTransaction({ id: 'tx-3', type: 'internal', amount: -2000, status: 'completed' }), // Supplier payment
        createTransaction({ id: 'tx-4', type: 'internal', amount: 4500, status: 'completed' }),  // Customer payment
        createTransaction({ id: 'tx-5', type: 'internal', amount: -1500, status: 'completed' }), // Supplier payment
        createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 7000, status: 'completed' }) // Cash out
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
      expect(result.breakdown.internal).toBe(9000) // 5000 + 3000 - 2000 + 4500 - 1500
    })

    it('should handle corrective transaction sequence after balance discrepancy', async () => {
      // Arrange: Scenario where balance was corrected via internal adjustments
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2000, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'internal', amount: -500, status: 'completed' }),  // Correction: over-credited
        createTransaction({ id: 'tx-4', type: 'internal', amount: 1000, status: 'completed' })   // Correction: compensate user
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
        internal: 500 // -500 + 1000
      })
    })
  })

  describe('Precision and Small Amount Testing', () => {
    it('should maintain precision with single satoshi transactions', async () => {
      // Arrange: Test minimum unit (1 sat) precision
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 1, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'withdrawal', amount: 1, status: 'completed' })
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

    it('should handle mixed large and small amounts without precision loss', async () => {
      // Arrange: Test that small amounts aren't lost when mixed with large amounts
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 21000000, status: 'completed' }), // 0.21 BTC
        createTransaction({ id: 'tx-2', type: 'internal', amount: 1, status: 'completed' }),        // 1 sat
        createTransaction({ id: 'tx-3', type: 'withdrawal', amount: 10000000, status: 'completed' }),
        createTransaction({ id: 'tx-4', type: 'internal', amount: -1, status: 'completed' })        // -1 sat
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: 21000000 + 1 - 10000000 - 1 = 11000000
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(11000000)
      expect(result.breakdown.internal).toBe(0) // 1 + (-1)
    })

    it('should accurately sum many small transactions', async () => {
      // Arrange: Test accumulation of small amounts (e.g., micro-payments)
      const transactions = Array.from({ length: 100 }, (_, i) =>
        createTransaction({
          id: `tx-${i}`,
          type: 'deposit',
          amount: 10, // 10 sats each
          status: 'completed'
        })
      )

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: 100 transactions × 10 sats = 1000 sats
      expect(result.success).toBe(true)
      expect(result.calculatedBalance).toBe(1000)
      expect(result.breakdown.deposits).toBe(1000)
      expect(result.transactionCount).toBe(100)
    })
  })

  describe('Transaction Breakdown Validation', () => {
    it('should provide accurate breakdown with only deposit transactions', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 2500, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.breakdown).toEqual({
        deposits: 4000,
        withdrawals: 0,
        internal: 0
      })
      expect(result.calculatedBalance).toBe(result.breakdown.deposits)
    })

    it('should provide accurate breakdown with only withdrawal transactions', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'withdrawal', amount: 500, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 1500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 2000,
        internal: 0
      })
      expect(result.calculatedBalance).toBe(-result.breakdown.withdrawals)
    })

    it('should provide accurate breakdown with only internal transactions', async () => {
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'internal', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'internal', amount: -300, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'internal', amount: 500, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert
      expect(result.success).toBe(true)
      expect(result.breakdown).toEqual({
        deposits: 0,
        withdrawals: 0,
        internal: 1200 // 1000 - 300 + 500
      })
      expect(result.calculatedBalance).toBe(result.breakdown.internal)
    })

    it('should maintain breakdown integrity with mixed transaction types', async () => {
      // Arrange: Verify breakdown sums correctly match calculated balance
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 3000, status: 'completed' }),
        createTransaction({ id: 'tx-3', type: 'internal', amount: 2000, status: 'completed' }),
        createTransaction({ id: 'tx-4', type: 'internal', amount: -1500, status: 'completed' }),
        createTransaction({ id: 'tx-5', type: 'deposit', amount: 5000, status: 'completed' }),
        createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 2000, status: 'completed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null
      })

      // Act
      const result = await calculateUserBalanceFromTransactions('user-123')

      // Assert: Verify breakdown integrity
      expect(result.success).toBe(true)
      expect(result.breakdown).toEqual({
        deposits: 15000,    // 10000 + 5000
        withdrawals: 5000,  // 3000 + 2000
        internal: 500       // 2000 - 1500
      })
      
      // Verify breakdown sum matches calculated balance
      const expectedBalance = result.breakdown.deposits - result.breakdown.withdrawals + result.breakdown.internal
      expect(result.calculatedBalance).toBe(expectedBalance)
      expect(result.calculatedBalance).toBe(10500)
    })
  })

  describe('Data Integrity & Robustness', () => {
    describe('Null and Undefined Handling', () => {
      it('should handle transactions with null amounts gracefully', async () => {
        // Arrange: Test defensive programming - null amounts shouldn't crash
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', type: 'deposit', status: 'completed' }), amount: null },
          createTransaction({ id: 'tx-3', type: 'withdrawal', amount: 500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should handle null amount as 0 or skip the transaction
        expect(result.success).toBe(true)
        // Balance should be 1000 - 500 = 500 (null treated as 0 or skipped)
        expect(result.calculatedBalance).toBeDefined()
        expect(typeof result.calculatedBalance).toBe('number')
      })

      it('should handle transactions with undefined amounts gracefully', async () => {
        // Arrange: Test defensive programming - undefined amounts shouldn't crash
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 2000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', type: 'withdrawal', status: 'completed' }), amount: undefined },
          createTransaction({ id: 'tx-3', type: 'deposit', amount: 1000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should handle undefined amount as 0 or skip the transaction
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBeDefined()
        expect(typeof result.calculatedBalance).toBe('number')
      })

      it('should handle transactions with null or missing status field', async () => {
        // Arrange: Test defensive programming for missing status
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', type: 'deposit', amount: 500 }), status: null },
          createTransaction({ id: 'tx-3', type: 'deposit', amount: 2000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should only count transactions with valid 'completed' status
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(3000) // Only tx-1 and tx-3
      })

      it('should handle completely empty transaction objects', async () => {
        // Arrange: Test extreme defensive programming
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          {} as any, // Empty object
          createTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should skip invalid transactions without crashing
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBeDefined()
      })
    })

    describe('Data Corruption Detection', () => {
      it('should detect negative deposit amounts (data corruption indicator)', async () => {
        // Arrange: Negative deposits indicate data corruption or fraud
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: -1000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'deposit', amount: 5000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Function should handle corrupted data gracefully
        expect(result.success).toBe(true)
        // Breakdown should accurately reflect the negative deposit
        expect(result.breakdown.deposits).toBe(4000) // -1000 + 5000
        expect(result.calculatedBalance).toBe(4000)
      })

      it('should detect negative withdrawal amounts (data corruption indicator)', async () => {
        // Arrange: Negative withdrawals indicate data corruption
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: -1000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Negative withdrawal should be reflected in calculation
        expect(result.success).toBe(true)
        // Balance: 5000 - (-1000) = 6000 (negative withdrawal adds to balance)
        expect(result.breakdown.withdrawals).toBe(-1000)
        expect(result.calculatedBalance).toBe(6000)
      })

      it('should handle extremely large amounts that could indicate corruption', async () => {
        // Arrange: Test amounts larger than Bitcoin's max supply (data corruption)
        const corruptedAmount = Number.MAX_SAFE_INTEGER
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: corruptedAmount, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 1000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should handle large numbers without precision loss
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(corruptedAmount - 1000)
        expect(result.breakdown.deposits).toBe(corruptedAmount)
      })

      it('should detect duplicate transaction IDs in the same calculation', async () => {
        // Arrange: Duplicate transaction IDs could indicate database corruption
        const duplicateId = 'duplicate-tx-id'
        const transactions = [
          createTransaction({ id: duplicateId, type: 'deposit', amount: 1000, status: 'completed' }),
          createTransaction({ id: duplicateId, type: 'deposit', amount: 1000, status: 'completed' }),
          createTransaction({ id: 'tx-unique', type: 'deposit', amount: 500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Currently counts both duplicates - this behavior should be documented
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(2500) // Counts duplicate twice
        expect(result.transactionCount).toBe(3)
      })

      it('should handle mix of string and number amounts (type coercion)', async () => {
        // Arrange: Test type coercion for amounts stored as strings
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: '5000' as any, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: '2000' as any, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'deposit', amount: 1000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: JavaScript should coerce strings to numbers
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(4000) // 5000 - 2000 + 1000
      })
    })

    describe('Transaction Status Validation', () => {
      it('should ignore transactions with invalid status values', async () => {
        // Arrange: Test handling of unexpected status values
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', type: 'deposit', amount: 500 }), status: 'invalid-status' as any },
          { ...createTransaction({ id: 'tx-3', type: 'deposit', amount: 2000 }), status: 'COMPLETED' as any }, // Wrong case
          createTransaction({ id: 'tx-4', type: 'deposit', amount: 1500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should only count exact 'completed' status (case-sensitive)
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(2500) // Only tx-1 and tx-4
        expect(result.breakdown.deposits).toBe(2500)
      })

      it('should handle transactions with status as empty string', async () => {
        // Arrange: Empty string status should not match 'completed'
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', type: 'deposit', amount: 500 }), status: '' as any },
          createTransaction({ id: 'tx-3', type: 'deposit', amount: 2000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Empty string should not be treated as 'completed'
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(3000) // Only tx-1 and tx-3
      })

      it('should handle transactions with whitespace in status', async () => {
        // Arrange: Test whitespace handling in status field
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', type: 'deposit', amount: 500 }), status: ' completed ' as any },
          { ...createTransaction({ id: 'tx-3', type: 'deposit', amount: 2000 }), status: 'completed\n' as any }
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Whitespace should prevent match (no trimming)
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(1000) // Only tx-1 (exact match)
      })

      it('should handle mix of all valid transaction statuses in same dataset', async () => {
        // Arrange: Test all valid status values together
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'pending' }),
          createTransaction({ id: 'tx-3', type: 'deposit', amount: 2000, status: 'failed' }),
          createTransaction({ id: 'tx-4', type: 'deposit', amount: 1500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Only 'completed' transactions should count
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(2500)
        expect(result.transactionCount).toBe(2) // Only completed transactions are counted
      })
    })

    describe('Transaction Type Validation', () => {
      it('should ignore transactions with invalid type values', async () => {
        // Arrange: Test handling of unexpected transaction types
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', amount: 500, status: 'completed' }), type: 'invalid-type' as any },
          { ...createTransaction({ id: 'tx-3', amount: 2000, status: 'completed' }), type: 'transfer' as any },
          createTransaction({ id: 'tx-4', type: 'withdrawal', amount: 500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should only process valid types (deposit, withdrawal, internal)
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(500) // 1000 - 500
      })

      it('should handle transactions with null or undefined type', async () => {
        // Arrange: Missing type field
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', amount: 500, status: 'completed' }), type: null as any },
          { ...createTransaction({ id: 'tx-3', amount: 2000, status: 'completed' }), type: undefined as any }
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Should skip transactions with invalid type
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(1000) // Only tx-1
      })

      it('should handle case-sensitive transaction type matching', async () => {
        // Arrange: Test that type matching is case-sensitive
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
          { ...createTransaction({ id: 'tx-2', amount: 500, status: 'completed' }), type: 'DEPOSIT' as any },
          { ...createTransaction({ id: 'tx-3', amount: 2000, status: 'completed' }), type: 'Deposit' as any },
          createTransaction({ id: 'tx-4', type: 'deposit', amount: 1500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Only exact lowercase matches should count
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(2500) // Only tx-1 and tx-4
      })
    })

    describe('Breakdown Calculation Edge Cases', () => {
      it('should maintain accurate breakdown with extreme internal transfer variance', async () => {
        // Arrange: Test breakdown accuracy with highly variable internal transfers
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'internal', amount: 15000, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: -20000, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: 8000, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'internal', amount: -2000, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 5000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify breakdown accuracy with high variance
        expect(result.success).toBe(true)
        expect(result.breakdown.internal).toBe(1000) // 15000 - 20000 + 8000 - 2000
        expect(result.breakdown.deposits).toBe(10000)
        expect(result.breakdown.withdrawals).toBe(5000)
        expect(result.calculatedBalance).toBe(6000) // 10000 - 5000 + 1000
      })

      it('should handle breakdown when internal transfers dominate and cancel out', async () => {
        // Arrange: Many internal transfers that net to zero
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'internal', amount: 10000, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: -5000, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: 3000, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'internal', amount: -8000, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 2000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Internal transfers should net to zero
        expect(result.success).toBe(true)
        expect(result.breakdown.internal).toBe(0) // 10000 - 5000 + 3000 - 8000
        expect(result.calculatedBalance).toBe(3000) // 5000 - 2000 + 0
      })

      it('should accurately track breakdown with all negative internal transfers', async () => {
        // Arrange: Test scenario with only negative internal transfers
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'internal', amount: -2000, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: -1500, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: -1000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Breakdown should reflect all negative internals
        expect(result.success).toBe(true)
        expect(result.breakdown.internal).toBe(-4500) // -2000 - 1500 - 1000
        expect(result.calculatedBalance).toBe(5500) // 10000 - 4500
      })

      it('should maintain breakdown accuracy across transaction count thresholds', async () => {
        // Arrange: Test at common pagination boundaries (10, 50, 100)
        const transactionCounts = [10, 50, 100]
        
        for (const count of transactionCounts) {
          const transactions = Array.from({ length: count }, (_, i) => 
            createTransaction({
              id: `tx-${i}`,
              type: i % 3 === 0 ? 'deposit' : i % 3 === 1 ? 'withdrawal' : 'internal',
              amount: i % 3 === 2 ? (i % 2 === 0 ? 100 : -100) : 100,
              status: 'completed'
            })
          )

          mockSupabase.order.mockResolvedValueOnce({
            data: transactions,
            error: null
          })

          // Act
          const result = await calculateUserBalanceFromTransactions(`user-${count}`)

          // Assert: Breakdown should be accurate regardless of count
          expect(result.success).toBe(true)
          expect(result.transactionCount).toBe(count)
          
          // Verify breakdown integrity
          const manualBalance = result.breakdown.deposits - result.breakdown.withdrawals + result.breakdown.internal
          expect(result.calculatedBalance).toBe(manualBalance)
        }
      })
    })
  })

  describe('Mathematical Correctness \u0026 Financial Accuracy', () => {
    describe('Balance Calculation Invariants', () => {
      it('should maintain invariant: balance = deposits - withdrawals + internal', async () => {
        // Arrange: Test the fundamental balance equation
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 8000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2500, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: 1500, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'deposit', amount: 3000, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'internal', amount: -800, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 1200, status: 'completed' })
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
        expect(result.breakdown.deposits).toBe(11000)     // 8000 + 3000
        expect(result.breakdown.withdrawals).toBe(3700)   // 2500 + 1200
        expect(result.breakdown.internal).toBe(700)       // 1500 - 800
        expect(result.calculatedBalance).toBe(8000)       // 11000 - 3700 + 700
      })

      it('should maintain commutativity: transaction order should not affect final balance', async () => {
        // Arrange: Same transactions in different orders should yield same balance
        const transactionSet1 = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed', created_at: '2024-01-01T00:00:00Z' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2000, status: 'completed', created_at: '2024-01-02T00:00:00Z' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: 1000, status: 'completed', created_at: '2024-01-03T00:00:00Z' })
        ]

        const transactionSet2 = [
          createTransaction({ id: 'tx-3', type: 'internal', amount: 1000, status: 'completed', created_at: '2024-01-03T00:00:00Z' }),
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed', created_at: '2024-01-01T00:00:00Z' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2000, status: 'completed', created_at: '2024-01-02T00:00:00Z' })
        ]

        // Act: Calculate balance for both orderings
        mockSupabase.order.mockResolvedValueOnce({
          data: transactionSet1,
          error: null
        })
        const result1 = await calculateUserBalanceFromTransactions('user-123')

        mockSupabase.order.mockResolvedValueOnce({
          data: transactionSet2,
          error: null
        })
        const result2 = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Both orderings must yield identical results
        expect(result1.success).toBe(true)
        expect(result2.success).toBe(true)
        expect(result1.calculatedBalance).toBe(result2.calculatedBalance)
        expect(result1.calculatedBalance).toBe(4000)
        expect(result1.breakdown).toEqual(result2.breakdown)
      })

      it('should maintain associativity: grouping transactions should not affect final balance', async () => {
        // Arrange: Test that (A + B) + C = A + (B + C) = A + B + C
        const allTransactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 3000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'deposit', amount: 2000, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'deposit', amount: 1000, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'withdrawal', amount: 500, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'withdrawal', amount: 300, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: allTransactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify the result is correct regardless of mental grouping
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(5200)
        
        // Manual verification: (3000 + 2000 + 1000) - (500 + 300) = 6000 - 800 = 5200
        expect(result.breakdown.deposits).toBe(6000)
        expect(result.breakdown.withdrawals).toBe(800)
      })

      it('should handle identity element: adding zero-amount transactions should not affect balance', async () => {
        // Arrange: Zero amounts are identity elements for addition
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'deposit', amount: 0, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'withdrawal', amount: 0, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: 0, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'withdrawal', amount: 1000, status: 'completed' })
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
        expect(result.breakdown.internal).toBe(0)
      })
    })

    describe('Breakdown Integrity Validation', () => {
      it('should ensure breakdown components always sum to calculated balance', async () => {
        // Arrange: Test with random-like amounts to verify integrity
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 7341, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 2187, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: 1523, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: -892, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'deposit', amount: 4096, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'withdrawal', amount: 3451, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify mathematical consistency
        expect(result.success).toBe(true)
        
        const expectedBalance = result.breakdown.deposits - result.breakdown.withdrawals + result.breakdown.internal
        expect(result.calculatedBalance).toBe(expectedBalance)
        
        // Verify specific breakdown
        expect(result.breakdown.deposits).toBe(11437)    // 7341 + 4096
        expect(result.breakdown.withdrawals).toBe(5638)  // 2187 + 3451
        expect(result.breakdown.internal).toBe(631)      // 1523 - 892
        expect(result.calculatedBalance).toBe(6430)      // 11437 - 5638 + 631
      })

      it('should maintain breakdown accuracy with large number of mixed internal transfers', async () => {
        // Arrange: Test breakdown with many positive and negative internal transfers
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'internal', amount: 500, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: -200, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: 800, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'internal', amount: -350, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'internal', amount: 1200, status: 'completed' }),
          createTransaction({ id: 'tx-7', type: 'internal', amount: -600, status: 'completed' }),
          createTransaction({ id: 'tx-8', type: 'withdrawal', amount: 3000, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify internal transfer breakdown accuracy
        expect(result.success).toBe(true)
        
        // Internal: 500 - 200 + 800 - 350 + 1200 - 600 = 1350
        expect(result.breakdown.internal).toBe(1350)
        expect(result.breakdown.deposits).toBe(10000)
        expect(result.breakdown.withdrawals).toBe(3000)
        
        const expectedBalance = 10000 - 3000 + 1350
        expect(result.calculatedBalance).toBe(expectedBalance)
        expect(result.calculatedBalance).toBe(8350)
      })

      it('should accurately track breakdown when internal transfers dominate', async () => {
        // Arrange: Test scenario where internal transfers are the primary transaction type
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 5000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'internal', amount: 2000, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: 1500, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: -1000, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'internal', amount: 3000, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'internal', amount: -500, status: 'completed' }),
          createTransaction({ id: 'tx-7', type: 'internal', amount: 2500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify internal-heavy breakdown accuracy
        expect(result.success).toBe(true)
        
        // Internal: 2000 + 1500 - 1000 + 3000 - 500 + 2500 = 7500
        expect(result.breakdown.internal).toBe(7500)
        expect(result.breakdown.deposits).toBe(5000)
        expect(result.breakdown.withdrawals).toBe(0)
        expect(result.calculatedBalance).toBe(12500)
      })
    })

    describe('JavaScript Number Precision Limits', () => {
      it('should handle amounts near Number.MAX_SAFE_INTEGER correctly', async () => {
        // Arrange: Test at JavaScript's maximum safe integer boundary (2^53 - 1)
        // Note: Bitcoin's max supply is 21M BTC = 2.1 quadrillion satoshis = 2.1e15
        // This is well below Number.MAX_SAFE_INTEGER (9.007e15), so we're safe
        const maxSafeSatoshis = Number.MAX_SAFE_INTEGER
        
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: maxSafeSatoshis, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify no precision loss at boundary
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(maxSafeSatoshis)
        expect(result.breakdown.deposits).toBe(maxSafeSatoshis)
      })

      it('should maintain precision with Bitcoin max supply (2.1 quadrillion satoshis)', async () => {
        // Arrange: Bitcoin's absolute maximum supply
        const bitcoinMaxSupplySats = 2100000000000000 // 21M BTC * 100M sats/BTC
        
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: bitcoinMaxSupplySats, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 1000000000, status: 'completed' }) // 10 BTC
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify precise calculation at Bitcoin max supply level
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(bitcoinMaxSupplySats - 1000000000)
        expect(result.breakdown.deposits).toBe(bitcoinMaxSupplySats)
        expect(result.breakdown.withdrawals).toBe(1000000000)
        
        // Verify no precision loss
        const manualCalc = result.breakdown.deposits - result.breakdown.withdrawals
        expect(result.calculatedBalance).toBe(manualCalc)
      })

      it('should maintain precision when summing many large amounts', async () => {
        // Arrange: Test accumulation of large amounts
        const largeAmount = 100000000000 // 1000 BTC in satoshis
        const transactions = Array.from({ length: 20 }, (_, i) =>
          createTransaction({
            id: `tx-${i}`,
            type: 'deposit',
            amount: largeAmount,
            status: 'completed'
          })
        )

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify no precision loss in accumulation
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(largeAmount * 20)
        expect(result.breakdown.deposits).toBe(2000000000000) // 20000 BTC
      })
    })

    describe('Edge Case Mathematical Properties', () => {
      it('should handle alternating deposits and withdrawals of equal amounts (balance cancellation)', async () => {
        // Arrange: Test that deposits and withdrawals cancel correctly
        const amount = 5000
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'deposit', amount, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'withdrawal', amount, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'deposit', amount, status: 'completed' }),
          createTransaction({ id: 'tx-6', type: 'withdrawal', amount, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Balance should be zero (perfect cancellation)
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(0)
        expect(result.breakdown.deposits).toBe(15000)
        expect(result.breakdown.withdrawals).toBe(15000)
      })

      it('should handle inverse operations with internal transfers (additive inverses)', async () => {
        // Arrange: Test that positive and negative internal transfers cancel
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
          createTransaction({ id: 'tx-2', type: 'internal', amount: 3000, status: 'completed' }),
          createTransaction({ id: 'tx-3', type: 'internal', amount: -3000, status: 'completed' }),
          createTransaction({ id: 'tx-4', type: 'internal', amount: 1500, status: 'completed' }),
          createTransaction({ id: 'tx-5', type: 'internal', amount: -1500, status: 'completed' })
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Internal transfers should cancel out
        expect(result.success).toBe(true)
        expect(result.calculatedBalance).toBe(10000)
        expect(result.breakdown.internal).toBe(0)
        expect(result.breakdown.deposits).toBe(10000)
      })

      it('should maintain consistency with prime number amounts (no common factors)', async () => {
        // Arrange: Test with prime numbers to ensure no hidden rounding or factor issues
        const transactions = [
          createTransaction({ id: 'tx-1', type: 'deposit', amount: 7919, status: 'completed' }),      // Prime
          createTransaction({ id: 'tx-2', type: 'withdrawal', amount: 5303, status: 'completed' }),   // Prime
          createTransaction({ id: 'tx-3', type: 'internal', amount: 4787, status: 'completed' }),     // Prime
          createTransaction({ id: 'tx-4', type: 'deposit', amount: 9973, status: 'completed' }),      // Prime
          createTransaction({ id: 'tx-5', type: 'internal', amount: -3391, status: 'completed' })     // Prime
        ]

        mockSupabase.order.mockResolvedValueOnce({
          data: transactions,
          error: null
        })

        // Act
        const result = await calculateUserBalanceFromTransactions('user-123')

        // Assert: Verify exact arithmetic with no common factors
        expect(result.success).toBe(true)
        expect(result.breakdown.deposits).toBe(17892)     // 7919 + 9973
        expect(result.breakdown.withdrawals).toBe(5303)
        expect(result.breakdown.internal).toBe(1396)      // 4787 - 3391
        expect(result.calculatedBalance).toBe(13985)      // 17892 - 5303 + 1396
      })
    })
  })
})
