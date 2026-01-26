import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestTransaction } from '../helpers/transaction-test-utils'

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn()
  }
}

// Mock the Supabase client creation
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}))

// Console spies - declared at module level, re-created in beforeEach
let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

describe('calculateUserBalance (scripts/calculate-balance.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Re-create console spies before each test (prevents vi.clearAllMocks from breaking them)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Setup default chainable mock structure
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn()
    }

    mockSupabase.from.mockReturnValue(mockChain)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Balance Calculation Logic', () => {
    it('should correctly calculate balance with only deposits', async () => {
      // Arrange
      const profile = { balance: 1750 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single
        .mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order
        .mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Verify Supabase calls
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
      expect(mockSupabase.from).toHaveBeenCalledWith('transactions')
      expect(mockChain.eq).toHaveBeenCalledWith('id', expect.any(String))
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', expect.any(String))
      
      // Verify console output contains calculated balance
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('1750')
      expect(logCalls).toContain('Calculated Balance: 1750')
      expect(logCalls).toContain('Balance is consistent!')
    })

    it('should correctly calculate balance with deposits and withdrawals', async () => {
      // Arrange
      const profile = { balance: 2200 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 2000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'withdrawal', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'withdrawal', amount: 300, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 2200')
      expect(logCalls).toContain('Deposits: +3000')
      expect(logCalls).toContain('Withdrawals: -800')
    })

    it('should correctly handle internal transfers with positive and negative amounts', async () => {
      // Arrange
      const profile = { balance: 1300 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'internal', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -200, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 1300')
      expect(logCalls).toContain('Internal: +300')
    })

    it('should only count completed transactions and ignore pending/failed', async () => {
      // Arrange
      const profile = { balance: 1000 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 500, status: 'pending' }),
        createTestTransaction({ id: 'tx-3', type: 'deposit', amount: 250, status: 'failed' }),
        createTestTransaction({ id: 'tx-4', type: 'withdrawal', amount: 200, status: 'pending' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Only tx-1 (completed) should be counted
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 1000')
      expect(logCalls).toContain('Deposits: +1000')
    })
  })

  describe('Edge Cases', () => {
    it('should handle user with no transactions', async () => {
      // Arrange
      const profile = { balance: 0 }
      const transactions: any[] = []

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 0')
      expect(logCalls).toContain('Balance is consistent!')
    })

    it('should handle very large transaction amounts (21M sats)', async () => {
      // Arrange - 0.21 BTC in satoshis
      const profile = { balance: 21000000 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 21000000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('21000000')
      expect(logCalls).toContain('Balance is consistent!')
    })

    it('should handle negative balance (more withdrawals than deposits)', async () => {
      // Arrange
      const profile = { balance: -500 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ type: 'withdrawal', amount: 1500, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: -500')
    })

    it('should detect balance mismatch and log warning', async () => {
      // Arrange - Profile balance doesn't match calculated balance
      const profile = { balance: 5000 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 1000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('WARNING: Balance mismatch detected!')
      expect(logCalls).toContain('Profile Balance: 5000')
      expect(logCalls).toContain('Calculated Balance: 1000')
      expect(logCalls).toContain('Difference: 4000')
    })

    it('should handle zero amount transactions', async () => {
      // Arrange
      const profile = { balance: 800 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'deposit', amount: 0, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'withdrawal', amount: 200, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Zero amount should not affect calculation
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 800')
    })
  })

  describe('Free Sats Users - Promotional Balance Scenarios', () => {
    it('should detect discrepancy for free sats users with 5000 sats but no transactions', async () => {
      // Arrange - Common scenario: 5000 free sats in profile, no transaction history
      const profile = { balance: 5000 }
      const transactions: any[] = []

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('WARNING: Balance mismatch detected!')
      expect(logCalls).toContain('Profile Balance: 5000')
      expect(logCalls).toContain('Calculated Balance: 0')
      expect(logCalls).toContain('Difference: 5000')
    })

    it('should show negative calculated balance when free sats user withdraws', async () => {
      // Arrange - Free sats user makes withdrawal but free sats not in transaction history
      const profile = { balance: 3000 }
      const transactions = [
        createTestTransaction({ type: 'withdrawal', amount: 2000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Calculated should be -2000 (withdrawal only)
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: -2000')
      expect(logCalls).toContain('WARNING: Balance mismatch detected!')
      expect(logCalls).toContain('Difference: 5000')
    })

    it('should not include promotional amounts in transaction-based calculation', async () => {
      // Arrange - Free sats user with additional deposit
      const profile = { balance: 6000 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 1000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Should only calculate 1000, not include free 5000 sats
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 1000')
      expect(logCalls).toContain('Profile Balance: 6000')
      expect(logCalls).toContain('Difference: 5000')
    })
  })

  describe('Error Handling', () => {
    it('should handle profile fetch error', async () => {
      // Arrange
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Profile not found', code: '404' }
      })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching profile:',
        expect.objectContaining({ message: 'Profile not found' })
      )
    })

    it('should handle transaction fetch error', async () => {
      // Arrange
      const profile = { balance: 1000 }
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed', code: '500' }
      })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching transactions:',
        expect.objectContaining({ message: 'Database connection failed' })
      )
    })

    it('should handle network timeout gracefully', async () => {
      // Arrange
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockRejectedValueOnce(new Error('Network timeout'))

      // Act & Assert - Should not throw
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await expect(calculateBalance()).resolves.not.toThrow()
    })
  })

  describe('Complex Real-World Scenarios', () => {
    it('should handle typical user journey with mixed transactions', async () => {
      // Arrange - Deposit, purchases (internal), rewards, withdrawal
      const profile = { balance: 2500 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'deposit', amount: 10000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'internal', amount: -2500, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -1500, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 500, status: 'completed' }),
        createTestTransaction({ id: 'tx-5', type: 'internal', amount: -1000, status: 'completed' }),
        createTestTransaction({ id: 'tx-6', type: 'withdrawal', amount: 3000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - 10000 - 2500 - 1500 + 500 - 1000 - 3000 = 2500
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 2500')
      expect(logCalls).toContain('Balance is consistent!')
    })

    it('should handle merchant scenario with multiple incoming/outgoing payments', async () => {
      // Arrange - Business receiving payments and paying suppliers
      const profile = { balance: 2000 }
      const transactions = [
        createTestTransaction({ id: 'tx-1', type: 'internal', amount: 5000, status: 'completed' }),
        createTestTransaction({ id: 'tx-2', type: 'internal', amount: 3000, status: 'completed' }),
        createTestTransaction({ id: 'tx-3', type: 'internal', amount: -2000, status: 'completed' }),
        createTestTransaction({ id: 'tx-4', type: 'internal', amount: 4500, status: 'completed' }),
        createTestTransaction({ id: 'tx-5', type: 'internal', amount: -1500, status: 'completed' }),
        createTestTransaction({ id: 'tx-6', type: 'withdrawal', amount: 7000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - 5000 + 3000 - 2000 + 4500 - 1500 - 7000 = 2000
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 2000')
    })

    it('should handle all pending transactions scenario', async () => {
      // Arrange - User has transactions but none completed
      const profile = { balance: 0 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 10000, status: 'pending' }),
        createTestTransaction({ type: 'deposit', amount: 5000, status: 'pending' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - No completed transactions = 0 balance
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 0')
      expect(logCalls).toContain('Balance is consistent!')
    })
  })

  describe('Performance and Large Datasets', () => {
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
      const profile = { balance: 0 }

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const startTime = Date.now()
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()
      const duration = Date.now() - startTime

      // Assert - Should complete quickly
      expect(duration).toBeLessThan(1000) // 1 second max
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 0')
    })

    it('should handle transactions with various amounts correctly', async () => {
      // Arrange - Prime numbers to test precision
      // Expected: 7919 - 2187 + 1523 - 892 + 4096 - 3451 = 7008
      const profile = { balance: 7008 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 7919, status: 'completed' }),
        createTestTransaction({ type: 'withdrawal', amount: 2187, status: 'completed' }),
        createTestTransaction({ type: 'internal', amount: 1523, status: 'completed' }),
        createTestTransaction({ type: 'internal', amount: -892, status: 'completed' }),
        createTestTransaction({ type: 'deposit', amount: 4096, status: 'completed' }),
        createTestTransaction({ type: 'withdrawal', amount: 3451, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Verify exact arithmetic
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Calculated Balance: 7008')
      expect(logCalls).toContain('Balance is consistent!')
    })
  })

  describe('Transaction Breakdown Verification', () => {
    it('should accurately report breakdown with mixed transaction types', async () => {
      // Arrange
      const profile = { balance: 10500 }
      const transactions = [
        createTestTransaction({ type: 'deposit', amount: 10000, status: 'completed' }),
        createTestTransaction({ type: 'withdrawal', amount: 3000, status: 'completed' }),
        createTestTransaction({ type: 'internal', amount: 2000, status: 'completed' }),
        createTestTransaction({ type: 'internal', amount: -1500, status: 'completed' }),
        createTestTransaction({ type: 'deposit', amount: 5000, status: 'completed' }),
        createTestTransaction({ type: 'withdrawal', amount: 2000, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert - Verify breakdown accuracy
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Deposits: +15000')
      expect(logCalls).toContain('Withdrawals: -5000')
      expect(logCalls).toContain('Internal: +500')
      expect(logCalls).toContain('Calculated Balance: 10500')
    })

    it('should show breakdown integrity with only internal transfers', async () => {
      // Arrange
      const profile = { balance: 1200 }
      const transactions = [
        createTestTransaction({ type: 'internal', amount: 1000, status: 'completed' }),
        createTestTransaction({ type: 'internal', amount: -300, status: 'completed' }),
        createTestTransaction({ type: 'internal', amount: 500, status: 'completed' })
      ]

      // Setup mocks
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
      expect(logCalls).toContain('Internal: +1200')
      expect(logCalls).toContain('Calculated Balance: 1200')
    })
  })

  describe('Supabase Query Validation', () => {
    it('should query profiles table with correct user ID', async () => {
      // Arrange
      const profile = { balance: 0 }
      const transactions: any[] = []
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
      expect(mockChain.select).toHaveBeenCalledWith('balance')
      expect(mockChain.eq).toHaveBeenCalledWith('id', expect.any(String))
    })

    it('should query transactions table with correct filters and ordering', async () => {
      // Arrange
      const profile = { balance: 0 }
      const transactions: any[] = []
      const mockChain = mockSupabase.from() as any
      mockChain.single.mockResolvedValueOnce({ data: profile, error: null })
      mockChain.order.mockResolvedValueOnce({ data: transactions, error: null })

      // Act
      const { default: calculateBalance } = await import('../../../scripts/calculate-balance')
      await calculateBalance()

      // Assert
      expect(mockSupabase.from).toHaveBeenCalledWith('transactions')
      expect(mockChain.select).toHaveBeenCalledWith('*')
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', expect.any(String))
      expect(mockChain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })
  })
})