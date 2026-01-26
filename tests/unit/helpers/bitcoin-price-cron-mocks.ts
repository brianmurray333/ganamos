import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Helper to create mock DIA Data API response
 */
export function createMockDIAResponse(price: number = 50000.00) {
  return {
    Symbol: 'BTC',
    Name: 'Bitcoin',
    Price: price,
    PriceUSD: price,
    VolumeYesterdayUSD: '28000000000',
    Time: new Date().toISOString(),
    Source: 'diadata.org',
  }
}

/**
 * Helper to mock successful external API fetch
 */
export function mockDIAApiSuccess(price: number = 50000.00) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => createMockDIAResponse(price),
  } as Response)
}

/**
 * Helper to mock external API HTTP error
 */
export function mockDIAApiError(status: number = 500) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: status,
    statusText: status === 500 ? 'Internal Server Error' : 'API Error',
    json: async () => ({ error: 'API request failed' }),
  } as Response)
}

/**
 * Helper to mock external API network failure
 */
export function mockDIAApiNetworkFailure(errorMessage: string = 'Network request failed') {
  global.fetch = vi.fn().mockRejectedValue(new Error(errorMessage))
}

/**
 * Helper to mock invalid price data response
 */
export function mockDIAApiInvalidData(priceValue: any = null) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      Symbol: 'BTC',
      Price: priceValue, // Invalid price (null, string, undefined, etc.)
    }),
  } as Response)
}

/**
 * Helper to setup successful database insertion mock
 */
export function mockDatabaseInsertSuccess(mockSupabaseClient: any, insertedPrice: any = null) {
  const defaultPrice = insertedPrice || {
    id: 'test-uuid-123',
    price: 50000.00,
    currency: 'USD',
    source: 'diadata.org',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  mockSupabaseClient.from.mockReturnValue({
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: defaultPrice,
      error: null,
    }),
  })

  return defaultPrice
}

/**
 * Helper to setup database insertion error mock
 */
export function mockDatabaseInsertError(mockSupabaseClient: any, errorMessage: string) {
  mockSupabaseClient.from.mockReturnValue({
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: errorMessage },
    }),
  })
}

/**
 * Helper to setup cleanup function success mock
 */
export function mockCleanupSuccess(mockSupabaseClient: any, deletedCount: number = 5) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: deletedCount,
    error: null,
  })
}

/**
 * Helper to setup cleanup function error mock (non-critical)
 */
export function mockCleanupError(mockSupabaseClient: any, errorMessage: string) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: null,
    error: { message: errorMessage },
  })
}

/**
 * Helper to create mock request with authorization header
 */
export function createMockRequestWithAuth(cronSecret: string) {
  return new NextRequest('http://localhost:3000/api/cron/update-bitcoin-price', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
    },
  })
}

/**
 * Helper to create mock request without authorization
 */
export function createMockRequestWithoutAuth() {
  return new NextRequest('http://localhost:3000/api/cron/update-bitcoin-price', {
    method: 'GET',
  })
}

/**
 * Creates a mock request with Vercel Cron headers for testing
 * @param headerType - Type of Vercel header to include ('x-vercel-cron' or 'x-vercel-id')
 * @returns Mock Request object with specified Vercel header
 */
export function createMockRequestWithVercelHeaders(
  headerType: 'x-vercel-cron' | 'x-vercel-id' = 'x-vercel-cron'
) {
  const headers: Record<string, string> = {}
  
  if (headerType === 'x-vercel-cron') {
    headers['x-vercel-cron'] = '1'
  } else {
    headers['x-vercel-id'] = 'cron_12345abcde'
  }

  return new NextRequest('http://localhost:3000/api/cron/update-bitcoin-price', {
    method: 'GET',
    headers: headers,
  })
}

/**
 * Helper to setup environment variables for tests
 */
export function setupTestEnvironment(overrides: {
  CRON_SECRET?: string
  NEXT_PUBLIC_SUPABASE_URL?: string
  SUPABASE_SECRET_API_KEY?: string
  USE_MOCKS?: string
} = {}) {
  const defaults = {
    CRON_SECRET: 'test-cron-secret-12345',
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_API_KEY: 'test-service-key',
    USE_MOCKS: 'false', // Default to real APIs for unit tests
  }

  const env = { ...defaults, ...overrides }

  process.env.CRON_SECRET = env.CRON_SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  process.env.SUPABASE_SECRET_API_KEY = env.SUPABASE_SECRET_API_KEY
  process.env.USE_MOCKS = env.USE_MOCKS

  return env
}

/**
 * Helper to clear environment variables
 */
export function clearTestEnvironment() {
  delete process.env.CRON_SECRET
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SECRET_API_KEY
  delete process.env.USE_MOCKS
}

/**
 * Helper to verify database insertion was called correctly
 */
export function expectDatabaseInsertCalled(mockQueryBuilder: any, expectedPrice: number) {
  expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
    price: expectedPrice,
    currency: 'USD',
    source: 'diadata.org',
  })
  expect(mockQueryBuilder.select).toHaveBeenCalled()
  expect(mockQueryBuilder.single).toHaveBeenCalled()
}

/**
 * Helper to verify external API was called with correct URL
 */
export function expectDIAApiCalled() {
  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.diadata.org/v1/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000',
    expect.objectContaining({
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  )
}

/**
 * Helper to verify cleanup RPC was called
 */
export function expectCleanupCalled(mockSupabaseClient: any) {
  expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('cleanup_old_bitcoin_prices')
}
