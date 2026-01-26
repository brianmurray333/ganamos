import { vi } from 'vitest'

/**
 * Transaction Testing Utilities
 * 
 * Provides helper functions for testing transaction-related balance calculations.
 * These utilities help validate that balance values match transaction history.
 */

export interface Transaction {
  id: string
  user_id: string
  type: 'deposit' | 'withdrawal' | 'internal'
  amount: number
  status: 'pending' | 'completed' | 'failed'
  created_at: string
}

export interface Profile {
  id: string
  email: string
  balance: number
}

/**
 * Calculate expected balance from transaction history
 * 
 * Only completed transactions affect the balance:
 * - Deposits and internal transfers increase balance
 * - Withdrawals decrease balance
 * - Pending and failed transactions are ignored
 * 
 * @param transactions - Array of transactions to calculate from
 * @returns The expected balance based on transaction history
 */
export function calculateBalanceFromTransactions(transactions: Transaction[]): number {
  return transactions.reduce((sum, tx) => {
    if (tx.status !== 'completed') return sum
    
    if (tx.type === 'deposit' || tx.type === 'internal') {
      return sum + tx.amount
    } else if (tx.type === 'withdrawal') {
      return sum - tx.amount
    }
    return sum
  }, 0)
}

/**
 * Create a mock Supabase client that returns transaction data
 * 
 * @param profile - The user profile to return
 * @param transactions - Array of transactions to return when queried
 */
export function createMockSupabaseWithTransactions(
  profile: Profile,
  transactions: Transaction[]
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: profile,
            error: null,
          }),
        }
      }
      
      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((field: string, value: string) => {
            const filteredTxs = transactions.filter(tx => tx.user_id === value)
            return {
              eq: vi.fn().mockResolvedValue({
                data: filteredTxs,
                error: null,
              }),
            }
          }),
        }
      }
      
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
  }
}

/**
 * Create a test transaction object
 * 
 * @param overrides - Fields to override in the transaction
 */
export function createTestTransaction(
  overrides: Partial<Transaction> = {}
): Transaction {
  const timestamp = Date.now()
  return {
    id: `tx-${timestamp}`,
    user_id: 'test-user-id',
    type: 'deposit',
    amount: 1000,
    status: 'completed',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create multiple test transactions
 * 
 * @param count - Number of transactions to create
 * @param baseOverrides - Base overrides to apply to all transactions
 */
export function createTestTransactions(
  count: number,
  baseOverrides: Partial<Transaction> = {}
): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    createTestTransaction({
      id: `tx-${i + 1}`,
      ...baseOverrides,
    })
  )
}

/**
 * Validate that a profile balance matches transaction history
 * 
 * @param profile - The profile to validate
 * @param transactions - The transaction history to validate against
 * @returns Object with validation result and details
 */
export function validateBalanceMatchesTransactions(
  profile: Profile,
  transactions: Transaction[]
): {
  matches: boolean
  expectedBalance: number
  actualBalance: number
  discrepancy: number
} {
  const expectedBalance = calculateBalanceFromTransactions(transactions)
  const actualBalance = profile.balance
  const discrepancy = actualBalance - expectedBalance

  return {
    matches: expectedBalance === actualBalance,
    expectedBalance,
    actualBalance,
    discrepancy,
  }
}
