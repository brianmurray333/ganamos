import { vi } from 'vitest'
import { createSuccessResponse } from '@/tests/utils/database'

/**
 * Helper to create a mock Supabase client for daily-summary tests
 * Creates a chainable mock that resolves queries with thenable objects
 */
export function createMockSupabaseClient() {
  // Create a chainable mock where each method can be both chainable AND thenable
  const createChainableQuery = (finalResult: any) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue(finalResult),
      then: (resolve: any) => Promise.resolve(finalResult).then(resolve),
      catch: (reject: any) => Promise.resolve(finalResult).catch(reject),
    }
    
    // Make the chain thenable so it can be awaited directly
    Object.setPrototypeOf(chain, Promise.prototype)
    
    return chain
  }
  
  const mockClient: any = {
    from: vi.fn((table: string) => createChainableQuery(createSuccessResponse([]))),
    rpc: vi.fn(),
  }
  return mockClient
}

/**
 * Setup mock Supabase responses for balance audit tests
 */
export function setupMockSupabaseForAudit(
  mockSupabase: any,
  profiles: any[],
  transactionsMap: Record<string, any[]>
) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue(createSuccessResponse(profiles)),
      }
    }
    if (table === 'transactions') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((field: string, value: string) => ({
          eq: vi.fn().mockResolvedValue(
            createSuccessResponse(transactionsMap[value] || [])
          ),
        })),
      }
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue(createSuccessResponse([])),
    }
  })
  
  mockSupabase.rpc = vi.fn().mockResolvedValue(createSuccessResponse(0))
}

/**
 * Setup mock external APIs (fetch, Groq, Resend)
 */
export function setupMockAPIs(Groq: any, Resend: any) {
  // Mock fetch for node-balance API
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      balances: {
        channel_balance: 100000,
        pending_balance: 0,
        onchain_balance: 50000,
        total_balance: 150000,
      },
    }),
  })

  // Mock Groq SDK
  Groq.mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }],
        }),
      },
    },
  }))

  // Mock Resend SDK with domains property
  Resend.mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: 'test-email-id' }),
    },
    domains: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  }))
}
