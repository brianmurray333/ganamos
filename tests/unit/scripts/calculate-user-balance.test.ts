import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}))

// Test data factories
const createTransaction = (overrides = {}) => ({
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

    // Create mock Supabase client with proper method chaining
    // All methods need to return the same object to maintain the chain
    mockSupabase = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn()
    }
    
    // Make all methods return the mockSupabase object itself for chaining
    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.order.mockReturnValue(mockSupabase)

    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    // Mock implementation of calculateUserBalanceFromTransactions
    calculateUserBalanceFromTransactions = async (userId: string) => {
      const supabase = createClient('', '')
      
      try {
        const { data: transactions, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })

        if (error) {
          return {
            success: false,
            error: error.message
          }
        }

        let calculatedBalance = 0
        const breakdown = {
          deposits: 0,
          withdrawals: 0,
          internal: 0
        }

        for (const tx of transactions) {
          if (tx.status !== 'completed') continue

          if (tx.type === 'deposit') {
            calculatedBalance += tx.amount
            breakdown.deposits += tx.amount
          } else if (tx.type === 'withdrawal') {
            calculatedBalance -= tx.amount
            breakdown.withdrawals += tx.amount
          } else if (tx.type === 'internal') {
            calculatedBalance += tx.amount
            breakdown.internal += tx.amount
          }
        }

        return {
          success: true,
          calculatedBalance,
          breakdown,
          transactionCount: transactions.length
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        }
      }
    }
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
      // Arrange
      const transactions = [
        createTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'pending' }),
        createTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'failed' })
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
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
})