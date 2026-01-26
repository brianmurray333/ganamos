import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  Transaction,
  Profile,
  calculateBalanceFromTransactions,
  createMockSupabaseWithTransactions,
} from '@/tests/unit/helpers/transaction-test-utils'

// Note: This test suite validates balance calculation logic against transaction data
// It uses a mock Supabase client to simulate transaction queries and balance reconciliation

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

describe('Balance Accuracy Validation Against Transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Balance Reconciliation', () => {
    it('should match balance with only deposit transactions', async () => {
      const userId = 'user-123'
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          user_id: userId,
          type: 'deposit',
          amount: 1000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'tx-2',
          user_id: userId,
          type: 'deposit',
          amount: 500,
          status: 'completed',
          created_at: '2024-01-02T00:00:00Z',
        },
      ]

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const mockSupabase = createMockSupabaseWithTransactions(profile, transactions)
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(1500)
    })

    it('should match balance with deposits and withdrawals', async () => {
      const userId = 'user-456'
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          user_id: userId,
          type: 'deposit',
          amount: 2000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'tx-2',
          user_id: userId,
          type: 'withdrawal',
          amount: 300,
          status: 'completed',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'tx-3',
          user_id: userId,
          type: 'deposit',
          amount: 1000,
          status: 'completed',
          created_at: '2024-01-03T00:00:00Z',
        },
      ]

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(2700) // 2000 - 300 + 1000
    })

    it('should match balance with internal transfers', async () => {
      const userId = 'user-789'
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          user_id: userId,
          type: 'deposit',
          amount: 5000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'tx-2',
          user_id: userId,
          type: 'internal',
          amount: 500,
          status: 'completed',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'tx-3',
          user_id: userId,
          type: 'withdrawal',
          amount: 1000,
          status: 'completed',
          created_at: '2024-01-03T00:00:00Z',
        },
      ]

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(4500) // 5000 + 500 - 1000
    })

    it('should exclude pending transactions from balance calculation', async () => {
      const userId = 'user-pending'
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          user_id: userId,
          type: 'deposit',
          amount: 1000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'tx-2',
          user_id: userId,
          type: 'deposit',
          amount: 500,
          status: 'pending',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'tx-3',
          user_id: userId,
          type: 'withdrawal',
          amount: 200,
          status: 'completed',
          created_at: '2024-01-03T00:00:00Z',
        },
      ]

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(800) // 1000 + 0 (pending) - 200
    })

    it('should exclude failed transactions from balance calculation', async () => {
      const userId = 'user-failed'
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          user_id: userId,
          type: 'deposit',
          amount: 2000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'tx-2',
          user_id: userId,
          type: 'withdrawal',
          amount: 500,
          status: 'failed',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'tx-3',
          user_id: userId,
          type: 'deposit',
          amount: 1000,
          status: 'failed',
          created_at: '2024-01-03T00:00:00Z',
        },
      ]

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(2000) // 2000 + 0 (failed) - 0 (failed)
    })

    it('should handle user with no transactions (zero balance)', async () => {
      const userId = 'user-no-tx'
      const transactions: Transaction[] = []

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(0)
    })

    it('should handle complex transaction history', async () => {
      const userId = 'user-complex'
      const transactions: Transaction[] = [
        // Initial deposits
        { id: 'tx-1', user_id: userId, type: 'deposit', amount: 10000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: userId, type: 'deposit', amount: 5000, status: 'completed', created_at: '2024-01-02T00:00:00Z' },
        
        // Some withdrawals
        { id: 'tx-3', user_id: userId, type: 'withdrawal', amount: 2000, status: 'completed', created_at: '2024-01-03T00:00:00Z' },
        { id: 'tx-4', user_id: userId, type: 'withdrawal', amount: 1500, status: 'completed', created_at: '2024-01-04T00:00:00Z' },
        
        // Internal transfers (rewards, boosts, etc.)
        { id: 'tx-5', user_id: userId, type: 'internal', amount: 500, status: 'completed', created_at: '2024-01-05T00:00:00Z' },
        { id: 'tx-6', user_id: userId, type: 'internal', amount: 300, status: 'completed', created_at: '2024-01-06T00:00:00Z' },
        
        // Mixed status transactions
        { id: 'tx-7', user_id: userId, type: 'deposit', amount: 1000, status: 'pending', created_at: '2024-01-07T00:00:00Z' },
        { id: 'tx-8', user_id: userId, type: 'withdrawal', amount: 500, status: 'failed', created_at: '2024-01-08T00:00:00Z' },
        
        // More completed transactions
        { id: 'tx-9', user_id: userId, type: 'deposit', amount: 2000, status: 'completed', created_at: '2024-01-09T00:00:00Z' },
        { id: 'tx-10', user_id: userId, type: 'withdrawal', amount: 800, status: 'completed', created_at: '2024-01-10T00:00:00Z' },
      ]

      const expectedBalance = calculateBalanceFromTransactions(transactions)
      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: expectedBalance,
      }

      const calculatedBalance = calculateBalanceFromTransactions(transactions)

      // Expected: 10000 + 5000 - 2000 - 1500 + 500 + 300 + 0(pending) + 0(failed) + 2000 - 800 = 13500
      expect(profile.balance).toBe(calculatedBalance)
      expect(profile.balance).toBe(13500)
    })
  })

  describe('Balance Discrepancy Detection', () => {
    it('should detect when profile balance does not match transaction history', async () => {
      const userId = 'user-discrepancy'
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          user_id: userId,
          type: 'deposit',
          amount: 1000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]

      const calculatedBalance = calculateBalanceFromTransactions(transactions)
      const incorrectBalance = 1500 // Intentional discrepancy

      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: incorrectBalance,
      }

      expect(profile.balance).not.toBe(calculatedBalance)
      expect(profile.balance - calculatedBalance).toBe(500) // Discrepancy amount
    })

    it('should flag negative discrepancies (balance lower than expected)', async () => {
      const userId = 'user-negative-disc'
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: userId, type: 'deposit', amount: 5000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: userId, type: 'withdrawal', amount: 1000, status: 'completed', created_at: '2024-01-02T00:00:00Z' },
      ]

      const calculatedBalance = calculateBalanceFromTransactions(transactions)
      const incorrectBalance = 3500 // Lower than expected 4000

      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: incorrectBalance,
      }

      expect(profile.balance).toBeLessThan(calculatedBalance)
      expect(calculatedBalance - profile.balance).toBe(500)
    })

    it('should flag positive discrepancies (balance higher than expected)', async () => {
      const userId = 'user-positive-disc'
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: userId, type: 'deposit', amount: 2000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
      ]

      const calculatedBalance = calculateBalanceFromTransactions(transactions)
      const incorrectBalance = 2500 // Higher than expected 2000

      const profile: Profile = {
        id: userId,
        email: 'test@example.com',
        balance: incorrectBalance,
      }

      expect(profile.balance).toBeGreaterThan(calculatedBalance)
      expect(profile.balance - calculatedBalance).toBe(500)
    })
  })

  describe('Transaction Type Handling', () => {
    it('should correctly add deposit amounts to balance', () => {
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: 'user-1', type: 'deposit', amount: 1000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: 'user-1', type: 'deposit', amount: 2000, status: 'completed', created_at: '2024-01-02T00:00:00Z' },
      ]

      const balance = calculateBalanceFromTransactions(transactions)
      expect(balance).toBe(3000)
    })

    it('should correctly subtract withdrawal amounts from balance', () => {
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: 'user-1', type: 'deposit', amount: 5000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: 'user-1', type: 'withdrawal', amount: 2000, status: 'completed', created_at: '2024-01-02T00:00:00Z' },
      ]

      const balance = calculateBalanceFromTransactions(transactions)
      expect(balance).toBe(3000)
    })

    it('should correctly add internal transfer amounts to balance', () => {
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: 'user-1', type: 'deposit', amount: 1000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: 'user-1', type: 'internal', amount: 500, status: 'completed', created_at: '2024-01-02T00:00:00Z' },
      ]

      const balance = calculateBalanceFromTransactions(transactions)
      expect(balance).toBe(1500)
    })
  })

  describe('Transaction Status Filtering', () => {
    it('should only include completed transactions in balance', () => {
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: 'user-1', type: 'deposit', amount: 1000, status: 'completed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: 'user-1', type: 'deposit', amount: 500, status: 'pending', created_at: '2024-01-02T00:00:00Z' },
        { id: 'tx-3', user_id: 'user-1', type: 'deposit', amount: 300, status: 'failed', created_at: '2024-01-03T00:00:00Z' },
      ]

      const balance = calculateBalanceFromTransactions(transactions)
      expect(balance).toBe(1000)
    })

    it('should handle all pending transactions (zero balance)', () => {
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: 'user-1', type: 'deposit', amount: 1000, status: 'pending', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: 'user-1', type: 'deposit', amount: 500, status: 'pending', created_at: '2024-01-02T00:00:00Z' },
      ]

      const balance = calculateBalanceFromTransactions(transactions)
      expect(balance).toBe(0)
    })

    it('should handle all failed transactions (zero balance)', () => {
      const transactions: Transaction[] = [
        { id: 'tx-1', user_id: 'user-1', type: 'deposit', amount: 1000, status: 'failed', created_at: '2024-01-01T00:00:00Z' },
        { id: 'tx-2', user_id: 'user-1', type: 'withdrawal', amount: 500, status: 'failed', created_at: '2024-01-02T00:00:00Z' },
      ]

      const balance = calculateBalanceFromTransactions(transactions)
      expect(balance).toBe(0)
    })
  })
})