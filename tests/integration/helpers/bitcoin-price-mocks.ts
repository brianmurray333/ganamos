import { vi } from 'vitest'

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

/**
 * Helper to create mock DIA Data API response data
 */
export function createMockDiaApiResponse(overrides: {
  Price?: number
  Symbol?: string
  Name?: string
  Address?: string
  Blockchain?: string
  Time?: string
} = {}) {
  return {
    Symbol: 'BTC',
    Name: 'Bitcoin',
    Address: '0x0000000000000000000000000000000000000000',
    Blockchain: 'Bitcoin',
    Price: 50000.00,
    Time: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Helper to mock successful DIA Data API fetch response
 */
export function mockFetchDiaApiSuccess(fetchMock: any, price: number = 50000.00) {
  const mockResponse = createMockDiaApiResponse({ Price: price })
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  })
}

/**
 * Helper to mock DIA Data API fetch error response
 */
export function mockFetchDiaApiError(fetchMock: any, status: number = 500) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error: 'API Error' }),
  })
}

/**
 * Helper to mock DIA Data API fetch with invalid price data
 */
export function mockFetchDiaApiInvalidData(fetchMock: any, invalidPrice: any) {
  const mockResponse = createMockDiaApiResponse({ Price: invalidPrice })
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  })
}

/**
 * Helper to mock DIA Data API fetch rejection (network error)
 */
export function mockFetchDiaApiRejection(fetchMock: any, errorMessage: string = 'Network error') {
  fetchMock.mockRejectedValueOnce(new Error(errorMessage))
}

/**
 * Helper to create mock Supabase service client with insert/RPC capabilities
 */
export function createMockSupabaseServiceClient() {
  const mockInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }

  const mockClient = {
    from: vi.fn(() => ({
      insert: vi.fn(() => mockInsertChain),
    })),
    rpc: vi.fn(),
  }

  return { mockClient, mockInsertChain }
}

/**
 * Helper to mock successful Supabase insert operation
 */
export function mockSupabaseInsertSuccess(
  mockInsertChain: any,
  insertedData: any = null
) {
  const defaultInsertedData = {
    id: 1,
    price: 50000.00,
    currency: 'USD',
    source: 'diadata.org',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  mockInsertChain.single.mockResolvedValue({
    data: insertedData || defaultInsertedData,
    error: null,
  })
}

/**
 * Helper to mock failed Supabase insert operation
 */
export function mockSupabaseInsertError(
  mockInsertChain: any,
  errorMessage: string = 'Insert failed'
) {
  mockInsertChain.single.mockResolvedValue({
    data: null,
    error: { message: errorMessage },
  })
}

/**
 * Helper to mock successful cleanup RPC call
 */
export function mockCleanupRpcSuccess(mockClient: any, deletedCount: number = 5) {
  mockClient.rpc.mockResolvedValue({
    data: deletedCount,
    error: null,
  })
}

/**
 * Helper to mock failed cleanup RPC call
 */
export function mockCleanupRpcError(mockClient: any, errorMessage: string = 'Cleanup failed') {
  mockClient.rpc.mockResolvedValue({
    data: null,
    error: { message: errorMessage },
  })
}

/**
 * Helper to mock cleanup RPC rejection
 */
export function mockCleanupRpcRejection(mockClient: any, errorMessage: string = 'RPC not found') {
  mockClient.rpc.mockRejectedValue(new Error(errorMessage))
}

/**
 * Helper to verify fetch was called with DIA Data API URL
 */
export function expectFetchCalledWithDiaApi(fetchMock: any) {
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.diadata.org/v1/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000',
    expect.objectContaining({
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  )
}

/**
 * Helper to verify Supabase insert was called with correct data
 */
export function expectInsertCalledWithPrice(mockClient: any, price: number) {
  expect(mockClient.from).toHaveBeenCalledWith('bitcoin_prices')
  const fromResult = mockClient.from.mock.results[0].value
  expect(fromResult.insert).toHaveBeenCalledWith({
    price,
    currency: 'USD',
    source: 'diadata.org',
  })
}

/**
 * Helper to verify cleanup RPC was called
 */
export function expectCleanupRpcCalled(mockClient: any) {
  expect(mockClient.rpc).toHaveBeenCalledWith('cleanup_old_bitcoin_prices')
}
