import { vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Balance Calculation Test Helpers
 * 
 * Shared utilities for testing balance calculation logic.
 * These helpers provide consistent mocking and test data creation
 * for balance-related tests.
 */

/**
 * Creates a mock Supabase client configured for balance calculation tests
 * with proper method chaining support.
 * 
 * @returns Mock Supabase client with chainable methods
 */
export function createMockSupabaseForBalanceTests() {
  const mockSupabase = {
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

  return mockSupabase
}

/**
 * Creates a mock implementation of calculateUserBalanceFromTransactions
 * for testing purposes. This implementation matches the expected behavior
 * of the real function.
 * 
 * @param supabaseMock The mock Supabase client to use
 * @returns Mock function that calculates balance from transactions
 */
export function createMockBalanceCalculator(supabaseMock: any) {
  return async (userId: string) => {
    const supabase = createClient('', '')
    
    try {
      // Query matches the actual implementation in scripts/audit-all-balances.js
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      // Filter to only completed transactions (mimics the .eq('status', 'completed') filter)
      const completedTransactions = (transactions || []).filter(tx => tx.status === 'completed')

      let calculatedBalance = 0
      const breakdown = {
        deposits: 0,
        withdrawals: 0,
        internal: 0
      }

      for (const tx of completedTransactions) {
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
        transactionCount: completedTransactions.length
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

/**
 * Sets up the complete mock environment for balance calculation tests.
 * This includes mocking the Supabase client and returning the configured mocks.
 * 
 * @returns Object containing the mock Supabase client and calculator function
 */
export function setupBalanceCalculationMocks() {
  const mockSupabase = createMockSupabaseForBalanceTests()
  
  // Mock the createClient to return our mock
  vi.mocked(createClient).mockReturnValue(mockSupabase as any)
  
  const calculateUserBalanceFromTransactions = createMockBalanceCalculator(mockSupabase)
  
  return {
    mockSupabase,
    calculateUserBalanceFromTransactions
  }
}
