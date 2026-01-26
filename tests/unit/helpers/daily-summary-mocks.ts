import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Mock Request Factories
 * Create NextRequest objects with or without authorization headers
 */

export function createMockRequestWithAuth(cronSecret: string, method: 'GET' | 'POST' = 'GET'): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/daily-summary', {
    method,
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
    },
  })
}

export function createMockRequestWithoutAuth(method: 'GET' | 'POST' = 'GET'): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/daily-summary', {
    method,
  })
}

/**
 * Environment Setup/Cleanup
 */

export function setupTestEnvironment() {
  process.env.CRON_SECRET = 'test-cron-secret-12345'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SECRET_API_KEY = 'test-service-role-key'
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3457'
}

export function clearTestEnvironment() {
  delete process.env.CRON_SECRET
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SECRET_API_KEY
  delete process.env.RESEND_API_KEY
  delete process.env.GROQ_API_KEY
  delete process.env.NEXT_PUBLIC_APP_URL
}

/**
 * Mock Data Generators
 */

export function createMockNodeBalanceResponse(overrides?: {
  channel_balance?: number
  pending_balance?: number
  onchain_balance?: number
  total_balance?: number
}) {
  const channel_balance = overrides?.channel_balance ?? 1000000
  const pending_balance = overrides?.pending_balance ?? 50000
  const onchain_balance = overrides?.onchain_balance ?? 200000
  const total_balance = overrides?.total_balance ?? (channel_balance + pending_balance + onchain_balance)

  return {
    success: true,
    balances: {
      channel_balance,
      pending_balance,
      onchain_balance,
      total_balance,
    },
  }
}

export function createMockBalanceAuditResult(overrides?: {
  status?: 'passed' | 'failed'
  totalUsers?: number
  usersWithDiscrepancies?: number
  totalDiscrepancy?: number
}) {
  return {
    status: overrides?.status ?? 'passed',
    totalUsers: overrides?.totalUsers ?? 100,
    usersWithDiscrepancies: overrides?.usersWithDiscrepancies ?? 0,
    totalDiscrepancy: overrides?.totalDiscrepancy ?? 0,
    discrepancies: [],
  }
}

export function createMockAPIHealthResult(overrides?: {
  voltage?: { status: 'online' | 'offline' | 'error'; error?: string }
  groq?: { status: 'online' | 'offline' | 'error'; error?: string }
  resend?: { status: 'online' | 'offline' | 'error'; error?: string }
}) {
  return {
    voltage: overrides?.voltage ?? {
      status: 'online' as const,
      nodeBalance: 1250000,
      discrepancy: 0,
    },
    groq: overrides?.groq ?? { status: 'online' as const },
    resend: overrides?.resend ?? { status: 'online' as const },
  }
}

export function createMock24HourMetrics(overrides?: {
  transactionCount?: number
  depositCount?: number
  depositAmount?: number
  withdrawalCount?: number
  withdrawalAmount?: number
  rewardsCount?: number
  rewardsAmount?: number
  earningsCount?: number
  earningsAmount?: number
  activeUsers?: number
}) {
  return {
    transactions: {
      count: overrides?.transactionCount ?? 50,
    },
    deposits: {
      count: overrides?.depositCount ?? 20,
      amount: overrides?.depositAmount ?? 500000,
    },
    withdrawals: {
      count: overrides?.withdrawalCount ?? 15,
      amount: overrides?.withdrawalAmount ?? 300000,
    },
    rewards: {
      count: overrides?.rewardsCount ?? 10,
      amount: overrides?.rewardsAmount ?? 100000,
    },
    earnings: {
      count: overrides?.earningsCount ?? 8,
      amount: overrides?.earningsAmount ?? 80000,
    },
    activeUsers: overrides?.activeUsers ?? 25,
  }
}

/**
 * Mock External APIs
 */

export function mockNodeBalanceApiSuccess(balances?: {
  channel_balance?: number
  pending_balance?: number
  onchain_balance?: number
  total_balance?: number
}) {
  const mockResponse = createMockNodeBalanceResponse(balances)
  
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  } as Response)
}

export function mockNodeBalanceApiError(statusCode: number = 500) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: statusCode,
    statusText: `Error ${statusCode}`,
    json: async () => ({ error: `Node balance API error ${statusCode}` }),
  } as Response)
}

export function mockNodeBalanceApiNetworkFailure(errorMessage: string = 'Network timeout') {
  global.fetch = vi.fn().mockRejectedValue(new Error(errorMessage))
}

export function mockGroqApiSuccess() {
  return vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: 'OK',
        },
      },
    ],
  })
}

export function mockGroqApiError(errorMessage: string = 'Groq API error') {
  return vi.fn().mockRejectedValue(new Error(errorMessage))
}

export function mockResendApiSuccess() {
  return vi.fn().mockResolvedValue({
    data: [
      { name: 'ganamos.earth', status: 'verified' },
    ],
  })
}

export function mockResendApiError(errorMessage: string = 'Resend API error') {
  return vi.fn().mockRejectedValue(new Error(errorMessage))
}

export function mockEmailSendSuccess(messageId: string = 'test-message-id-123') {
  return vi.fn().mockResolvedValue({
    success: true,
    messageId,
  })
}

export function mockEmailSendError(errorMessage: string = 'Email sending failed') {
  return vi.fn().mockResolvedValue({
    success: false,
    error: errorMessage,
  })
}

/**
 * Mock Supabase Client
 */

export function mockSupabaseProfilesQuery(mockSupabaseClient: any, profiles: Array<{ id: string; balance: number }>) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }

  // Mock the final resolution
  Object.assign(mockQueryBuilder, {
    then: vi.fn((resolve) => {
      resolve({ data: profiles, error: null })
      return Promise.resolve({ data: profiles, error: null })
    }),
  })

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return mockQueryBuilder
    }
    return mockQueryBuilder
  })

  return mockQueryBuilder
}

export function mockSupabaseTransactionsQuery(
  mockSupabaseClient: any,
  transactions: Array<{ type: string; amount: number; status: string }>
) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }

  Object.assign(mockQueryBuilder, {
    then: vi.fn((resolve) => {
      resolve({ data: transactions, error: null })
      return Promise.resolve({ data: transactions, error: null })
    }),
  })

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'transactions') {
      return mockQueryBuilder
    }
    return {
      select: vi.fn().mockReturnThis(),
    }
  })

  return mockQueryBuilder
}

export function mockSupabasePostsQuery(
  mockSupabaseClient: any,
  posts: Array<{ reward: number; fixed?: boolean }>
) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }

  Object.assign(mockQueryBuilder, {
    then: vi.fn((resolve) => {
      resolve({ data: posts, error: null })
      return Promise.resolve({ data: posts, error: null })
    }),
  })

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'posts') {
      return mockQueryBuilder
    }
    return {
      select: vi.fn().mockReturnThis(),
    }
  })

  return mockQueryBuilder
}

export function mockSupabaseRpcActiveUsers(mockSupabaseClient: any, userIds: string[] = ['user1', 'user2']) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: userIds,
    error: null,
  })
}

export function mockSupabaseDatabaseError(mockSupabaseClient: any, errorMessage: string = 'Database error') {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }

  Object.assign(mockQueryBuilder, {
    then: vi.fn((resolve, reject) => {
      reject(new Error(errorMessage))
      return Promise.reject(new Error(errorMessage))
    }),
  })

  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  mockSupabaseClient.rpc.mockRejectedValue(new Error(errorMessage))
}

/**
 * Mock lib/daily-summary.ts functions
 */

export function mockGetDailySummaryDataSuccess(overrides?: {
  nodeBalance?: any
  appTotalBalance?: number
  balanceAudit?: any
  apiHealth?: any
  last24Hours?: any
}) {
  return vi.fn().mockResolvedValue({
    nodeBalance: overrides?.nodeBalance ?? createMockNodeBalanceResponse().balances,
    appTotalBalance: overrides?.appTotalBalance ?? 1250000,
    balanceAudit: overrides?.balanceAudit ?? createMockBalanceAuditResult(),
    apiHealth: overrides?.apiHealth ?? createMockAPIHealthResult(),
    last24Hours: overrides?.last24Hours ?? createMock24HourMetrics(),
  })
}

export function mockGetDailySummaryDataError(errorMessage: string = 'Failed to get summary data') {
  return vi.fn().mockRejectedValue(new Error(errorMessage))
}

export function mockSendDailySummaryEmailSuccess(messageId: string = 'test-email-id-123') {
  return vi.fn().mockResolvedValue({
    success: true,
    messageId,
  })
}

export function mockSendDailySummaryEmailError(errorMessage: string = 'Email sending failed') {
  return vi.fn().mockResolvedValue({
    success: false,
    error: errorMessage,
  })
}

/**
 * Assertion Helpers
 */

export function expectSuccessResponse(response: any, data: any) {
  expect(response.status).toBe(200)
  expect(data.success).toBe(true)
  expect(data.message).toBe('Daily summary email sent successfully')
  expect(data.messageId).toBeDefined()
  expect(typeof data.messageId).toBe('string')
}

export function expectUnauthorizedResponse(response: any, data: any) {
  expect(response.status).toBe(401)
  expect(data.error).toBe('Unauthorized')
  expect(data.success).toBeUndefined()
}

export function expectErrorResponse(response: any, data: any, expectedError: string) {
  expect(response.status).toBe(500)
  expect(data.error).toBe(expectedError)
  expect(data.details).toBeDefined()
  expect(typeof data.details).toBe('string')
}

export function expectNodeBalanceFetchCalled(appUrl: string = 'http://localhost:3457') {
  expect(global.fetch).toHaveBeenCalledWith(
    `${appUrl}/api/admin/node-balance`
  )
}

export function expectEmailSendCalled(toEmail: string = 'admin@example.com') {
  // This would check that sendEmail was called with correct parameters
  // Implementation depends on how sendEmail is mocked
}