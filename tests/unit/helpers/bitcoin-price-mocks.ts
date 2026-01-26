import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Create mock NextRequest for bitcoin-price endpoint
 */
export function createMockRequest() {
  return new NextRequest('http://localhost:3000/api/bitcoin-price')
}

/**
 * Helper to create mock Bitcoin price data with sensible defaults
 */
export function createMockPriceData(overrides: {
  price?: string
  currency?: string
  source?: string
  created_at?: string
  age_minutes?: number
} = {}) {
  return {
    price: '50000.00',
    currency: 'USD',
    source: 'DIA',
    created_at: new Date().toISOString(),
    age_minutes: 15,
    ...overrides,
  }
}

/**
 * Helper to setup successful RPC mock response
 */
export function mockRpcSuccess(mockSupabaseClient: any, priceData: any) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: [priceData],
    error: null,
  })
}

/**
 * Helper to setup empty RPC mock response (no data)
 */
export function mockRpcEmpty(mockSupabaseClient: any) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: [],
    error: null,
  })
}

/**
 * Helper to setup null RPC mock response
 */
export function mockRpcNull(mockSupabaseClient: any) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: null,
    error: null,
  })
}

/**
 * Helper to setup RPC error response
 */
export function mockRpcError(mockSupabaseClient: any, errorMessage: string) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: null,
    error: { message: errorMessage },
  })
}

/**
 * Helper to setup RPC rejection (throws error)
 */
export function mockRpcRejection(mockSupabaseClient: any, errorMessage: string) {
  mockSupabaseClient.rpc.mockRejectedValue(new Error(errorMessage))
}

/**
 * Helper to create a mock query builder for fallback queries
 */
export function createMockQueryBuilder(priceData: any | null, error: any = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: priceData,
      error,
    }),
  }
}

/**
 * Helper to setup fallback query mock
 */
export function mockFallbackQuery(mockSupabaseClient: any, priceData: any | null, error: any = null) {
  const mockQueryBuilder = createMockQueryBuilder(priceData, error)
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Helper to create a timestamp N minutes ago
 */
export function createTimestampMinutesAgo(minutes: number): string {
  const date = new Date(Date.now() - minutes * 60000)
  return date.toISOString()
}

/**
 * Helper to verify RPC call was made with correct parameters
 */
export function expectRpcCalledWithUSD(mockSupabaseClient: any) {
  expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_latest_bitcoin_price', {
    p_currency: 'USD',
  })
}

/**
 * Helper to verify fallback query was called correctly
 */
export function expectFallbackQueryCalled(mockQueryBuilder: any) {
  expect(mockQueryBuilder.select).toHaveBeenCalledWith('*')
  expect(mockQueryBuilder.eq).toHaveBeenCalledWith('currency', 'USD')
  expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1)
}

/**
 * Helper to verify CORS headers in development mode
 */
export function expectCorsHeaders(response: Response) {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
}

/**
 * Helper to verify no CORS headers in production mode
 */
export function expectNoCorsHeaders(response: Response) {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
  expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
}
