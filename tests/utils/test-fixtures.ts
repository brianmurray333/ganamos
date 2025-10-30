import type { DailySummaryData } from '@/lib/daily-summary'
import type { Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Transaction = Database['public']['Tables']['transactions']['Row']

/**
 * Generate mock profile data
 */
export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id || '550e8400-e29b-41d4-a716-446655440000',
    email: overrides.email || 'test@example.com',
    name: overrides.name || 'Test User',
    username: overrides.username || 'testuser',
    avatar_url: overrides.avatar_url || null,
    balance: overrides.balance || 100000,
    created_at: overrides.created_at || '2024-01-01T00:00:00Z',
    updated_at: overrides.updated_at || '2024-01-01T00:00:00Z',
    fixed_issues_count: overrides.fixed_issues_count || 0
  }
}

/**
 * Generate mock transaction data
 */
export function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id || '550e8400-e29b-41d4-a716-446655440001',
    user_id: overrides.user_id || '550e8400-e29b-41d4-a716-446655440000',
    type: overrides.type || 'deposit',
    amount: overrides.amount || 50000,
    status: overrides.status || 'completed',
    r_hash_str: overrides.r_hash_str || null,
    payment_request: overrides.payment_request || null,
    payment_hash: overrides.payment_hash || null,
    memo: overrides.memo || null,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString()
  }
}

/**
 * Generate mock daily summary data
 */
export function createMockDailySummaryData(overrides: Partial<DailySummaryData> = {}): DailySummaryData {
  return {
    nodeBalance: overrides.nodeBalance || {
      channel_balance: 1000000,
      pending_balance: 50000,
      onchain_balance: 100000,
      total_balance: 1150000
    },
    appTotalBalance: overrides.appTotalBalance || 1150000,
    balanceAudit: overrides.balanceAudit || {
      status: 'passed',
      totalUsers: 10,
      usersWithDiscrepancies: 0,
      totalDiscrepancy: 0,
      discrepancies: []
    },
    apiHealth: overrides.apiHealth || {
      voltage: {
        status: 'online',
        nodeBalance: 1150000,
        discrepancy: 0
      },
      groq: {
        status: 'online'
      },
      resend: {
        status: 'online'
      }
    },
    last24Hours: overrides.last24Hours || {
      transactions: { count: 25 },
      deposits: { count: 10, amount: 500000 },
      withdrawals: { count: 5, amount: 200000 },
      rewards: { count: 8, amount: 300000 },
      earnings: { count: 6, amount: 250000 },
      activeUsers: 15
    }
  }
}

/**
 * Generate mock daily summary data with balance discrepancies
 */
export function createMockDailySummaryDataWithDiscrepancies(): DailySummaryData {
  return createMockDailySummaryData({
    balanceAudit: {
      status: 'failed',
      totalUsers: 10,
      usersWithDiscrepancies: 2,
      totalDiscrepancy: 10000,
      discrepancies: [
        {
          email: 'user1@example.com',
          profileBalance: 100000,
          calculatedBalance: 95000,
          difference: 5000
        },
        {
          email: 'user2@example.com',
          profileBalance: 50000,
          calculatedBalance: 55000,
          difference: -5000
        }
      ]
    }
  })
}

/**
 * Generate mock daily summary data with API failures
 */
export function createMockDailySummaryDataWithAPIFailures(): DailySummaryData {
  return createMockDailySummaryData({
    apiHealth: {
      voltage: {
        status: 'error',
        nodeBalance: 0,
        discrepancy: 0,
        error: 'Failed to connect to Lightning node'
      },
      groq: {
        status: 'offline',
        error: 'Groq API timeout'
      },
      resend: {
        status: 'error',
        error: 'Invalid API key'
      }
    }
  })
}