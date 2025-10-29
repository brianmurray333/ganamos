import { vi } from 'vitest'

/**
 * Test Fixtures - Mock Data
 */

// Mock profile data
export const createMockProfile = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  username: 'testuser',
  balance: 10000,
  status: 'active',
  created_at: new Date('2024-01-01').toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createMockProfiles = (count: number) => {
  return Array.from({ length: count }, (_, i) => createMockProfile({
    id: `user-${i + 1}`,
    email: `user${i + 1}@example.com`,
    name: `User ${i + 1}`,
    username: `user${i + 1}`,
    balance: 1000 * (i + 1),
  }))
}

// Mock transaction data
export const createMockTransaction = (overrides = {}) => ({
  id: 'tx-123',
  user_id: 'user-123',
  type: 'deposit',
  amount: 1000,
  status: 'completed',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  memo: 'Test transaction',
  ...overrides,
})

export const createMockTransactions = (count: number, type: string = 'deposit') => {
  return Array.from({ length: count }, (_, i) => createMockTransaction({
    id: `tx-${i + 1}`,
    type,
    amount: 100 * (i + 1),
    created_at: new Date(Date.now() - i * 60000).toISOString(),
  }))
}

// Mock post data
export const createMockPost = (overrides = {}) => ({
  id: 'post-123',
  user_id: 'user-123',
  reward: 500,
  fixed: false,
  fixed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createMockPosts = (count: number, fixed: boolean = false) => {
  return Array.from({ length: count }, (_, i) => createMockPost({
    id: `post-${i + 1}`,
    reward: 100 * (i + 1),
    fixed,
    fixed_at: fixed ? new Date().toISOString() : null,
    created_at: new Date(Date.now() - i * 60000).toISOString(),
  }))
}

// Mock node balance response
export const createMockNodeBalance = (overrides = {}) => ({
  success: true,
  balances: {
    channel_balance: 50000,
    pending_balance: 5000,
    onchain_balance: 10000,
    total_balance: 65000,
    ...overrides,
  },
})

// Mock API health check responses
export const createMockVoltageHealth = (status: 'online' | 'offline' | 'error' = 'online', overrides = {}) => ({
  status,
  nodeBalance: status === 'online' ? 65000 : 0,
  discrepancy: status === 'online' ? 5000 : 0,
  ...(status !== 'online' && { error: 'API unavailable' }),
  ...overrides,
})

export const createMockGroqHealth = (status: 'online' | 'offline' | 'error' = 'online', overrides = {}) => ({
  status,
  ...(status !== 'online' && { error: 'API unavailable' }),
  ...overrides,
})

export const createMockResendHealth = (status: 'online' | 'offline' | 'error' = 'online', overrides = {}) => ({
  status,
  ...(status !== 'online' && { error: 'API unavailable' }),
  ...overrides,
})

// Mock balance audit result
export const createMockBalanceAudit = (overrides = {}) => ({
  status: 'passed' as const,
  totalUsers: 10,
  usersWithDiscrepancies: 0,
  totalDiscrepancy: 0,
  discrepancies: [],
  ...overrides,
})

// Mock balance audit with discrepancies
export const createMockBalanceAuditWithDiscrepancies = () => ({
  status: 'failed' as const,
  totalUsers: 10,
  usersWithDiscrepancies: 2,
  totalDiscrepancy: 1000,
  discrepancies: [
    {
      email: 'user1@example.com',
      profileBalance: 5000,
      calculatedBalance: 4500,
      difference: 500,
    },
    {
      email: 'user2@example.com',
      profileBalance: 3000,
      calculatedBalance: 3500,
      difference: -500,
    },
  ],
})

/**
 * Supabase Mock Helpers
 */

export function createMockSupabaseClient(overrides = {}) {
  const createChainableQuery = (result: any) => {
    const chain: any = {
      from: vi.fn(() => chain),
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(result)),
      then: (resolve: any) => Promise.resolve(result).then(resolve),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    }
    return chain
  }

  const mockClient = {
    from: vi.fn(() => createChainableQuery({ data: null, error: null })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    ...overrides,
  }
  return mockClient
}

export function mockSupabaseProfiles(mockClient: any, profiles: any[]) {
  const result = { data: profiles, error: null }
  const chain: any = {
    select: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
  }
  mockClient.from.mockReturnValueOnce(chain)
}

export function mockSupabaseTransactions(mockClient: any, transactions: any[]) {
  const result = { data: transactions, error: null }
  const chain: any = {
    select: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
  }
  mockClient.from.mockReturnValueOnce(chain)
}

export function mockSupabasePosts(mockClient: any, posts: any[], isCompleted: boolean = false) {
  const result = { data: posts, error: null }
  const chain: any = {
    select: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
  }
  mockClient.from.mockReturnValueOnce(chain)
}

export function mockSupabaseActiveUsers(mockClient: any, userIds: string[]) {
  mockClient.rpc.mockResolvedValueOnce({
    data: userIds,
    error: null,
  })
}

export function mockSupabaseError(mockClient: any, errorMessage: string) {
  const result = { data: null, error: { message: errorMessage } }
  const chain: any = {
    select: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
  }
  mockClient.from.mockReturnValueOnce(chain)
}

// Helper for balance audit queries (multiple queries that return same profiles)
export function mockSupabaseBalanceAudit(mockClient: any, profiles: any[]) {
  const result = { data: profiles, error: null }
  const chain: any = {
    select: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
  }
  // Use mockReturnValue instead of mockReturnValueOnce for balance audit
  // since it's called multiple times for transaction queries
  mockClient.from.mockReturnValue(chain)
}

/**
 * Fetch Mock Helpers (for external API calls)
 */

export function mockFetchNodeBalance(success: boolean = true, balances = {}) {
  const mockResponse = success
    ? createMockNodeBalance(balances)
    : { error: 'Failed to fetch node balance' }

  global.fetch = vi.fn().mockResolvedValue({
    ok: success,
    status: success ? 200 : 500,
    json: async () => mockResponse,
  } as Response)
}

export function mockFetchError(errorMessage: string = 'Network error') {
  global.fetch = vi.fn().mockRejectedValue(new Error(errorMessage))
}

/**
 * Groq API Mock Helpers
 */

export function createMockGroqResponse(content: string = 'OK') {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  }
}

export function mockGroqAPI(success: boolean = true, responseContent: string = 'OK') {
  if (success) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(createMockGroqResponse(responseContent)),
        },
      },
    }
  } else {
    return {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Groq API error')),
        },
      },
    }
  }
}

/**
 * Resend API Mock Helpers
 */

export function createMockResendDomains(count: number = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `domain-${i + 1}`,
    name: `example${i + 1}.com`,
    status: 'verified',
  }))
}

export function mockResendAPI(success: boolean = true, domainsCount: number = 1) {
  if (success) {
    return {
      domains: {
        list: vi.fn().mockResolvedValue({
          data: createMockResendDomains(domainsCount),
          error: null,
        }),
      },
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: 'email-123' },
          error: null,
        }),
      },
    }
  } else {
    return {
      domains: {
        list: vi.fn().mockRejectedValue(new Error('Resend API error')),
      },
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Failed to send email' },
        }),
      },
    }
  }
}

/**
 * Environment Variable Helpers
 */

export function setTestEnvVars() {
  process.env.CRON_SECRET = 'test-cron-secret-123'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  process.env.GROQ_API_KEY = 'test-groq-api-key'
  process.env.RESEND_API_KEY = 'test-resend-api-key'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3457'
}

export function clearTestEnvVars() {
  delete process.env.CRON_SECRET
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.GROQ_API_KEY
  delete process.env.RESEND_API_KEY
  delete process.env.NEXT_PUBLIC_APP_URL
}

/**
 * Assertion Helpers
 */

export function expectValidDailySummaryData(data: any) {
  // Node balance structure
  expect(data).toHaveProperty('nodeBalance')
  expect(data.nodeBalance).toHaveProperty('channel_balance')
  expect(data.nodeBalance).toHaveProperty('pending_balance')
  expect(data.nodeBalance).toHaveProperty('onchain_balance')
  expect(data.nodeBalance).toHaveProperty('total_balance')

  // App total balance
  expect(data).toHaveProperty('appTotalBalance')
  expect(typeof data.appTotalBalance).toBe('number')

  // Balance audit
  expect(data).toHaveProperty('balanceAudit')
  expect(data.balanceAudit).toHaveProperty('status')
  expect(data.balanceAudit).toHaveProperty('totalUsers')
  expect(data.balanceAudit).toHaveProperty('usersWithDiscrepancies')
  expect(data.balanceAudit).toHaveProperty('totalDiscrepancy')
  expect(data.balanceAudit).toHaveProperty('discrepancies')

  // API health
  expect(data).toHaveProperty('apiHealth')
  expect(data.apiHealth).toHaveProperty('voltage')
  expect(data.apiHealth).toHaveProperty('groq')
  expect(data.apiHealth).toHaveProperty('resend')

  // 24-hour metrics
  expect(data).toHaveProperty('last24Hours')
  expect(data.last24Hours).toHaveProperty('transactions')
  expect(data.last24Hours).toHaveProperty('deposits')
  expect(data.last24Hours).toHaveProperty('withdrawals')
  expect(data.last24Hours).toHaveProperty('rewards')
  expect(data.last24Hours).toHaveProperty('earnings')
  expect(data.last24Hours).toHaveProperty('activeUsers')
}

export function expectValidEmailHTML(html: string) {
  expect(html).toContain('<h2>Ganamos Daily Summary')
  expect(html).toContain('<h3>Node & App Balances</h3>')
  expect(html).toContain('<h3>Last 24 Hours Activity</h3>')
  expect(html).toContain('<h3>Balance Audit</h3>')
  expect(html).toContain('<h3>API Health Checks</h3>')
  expect(html).toContain('Generated at')
}

export function expectBalanceAuditPassed(html: string) {
  expect(html).toContain('✅ Balance audit check confirmed')
  expect(html).not.toContain('⚠️ Balance discrepancies detected!')
}

export function expectBalanceAuditFailed(html: string) {
  expect(html).toContain('⚠️ Balance discrepancies detected!')
  expect(html).toContain('Users with Discrepancies:')
}

export function expectAPIHealthOnline(html: string, apiName: string) {
  expect(html).toContain(`✅ ${apiName} API: Online`)
}

export function expectAPIHealthOffline(html: string, apiName: string) {
  expect(html).toContain(`❌ ${apiName} API:`)
}