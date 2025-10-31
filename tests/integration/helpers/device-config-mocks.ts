import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Mock data factories for device config testing
 * Follows patterns from device-fixtures.ts and bitcoin-price-mocks.ts
 */

export const VALID_PET_TYPES = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle'] as const
export type PetType = typeof VALID_PET_TYPES[number]

// Test device data
export const TEST_DEVICES = {
  paired: {
    id: 'device-123',
    user_id: 'user-456',
    pairing_code: 'ABC123',
    pet_name: 'Fluffy',
    pet_type: 'cat' as PetType,
    status: 'paired' as const,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  disconnected: {
    id: 'device-789',
    user_id: 'user-456',
    pairing_code: 'XYZ789',
    pet_name: 'Buddy',
    pet_type: 'dog' as PetType,
    status: 'disconnected' as const,
    last_seen_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
}

// Test profile data
export const TEST_PROFILES = {
  primary: {
    id: 'user-456',
    balance: 50000,
    name: 'Test User',
  },
  withoutName: {
    id: 'user-789',
    balance: 25000,
    name: null,
  },
}

// Test transaction data
export const TEST_TRANSACTIONS = {
  withMessage: {
    id: 'tx-123',
    message: 'Payment received',
    to_user_id: 'user-456',
    type: 'receive',
    created_at: new Date().toISOString(),
  },
  noMessage: {
    id: 'tx-456',
    message: null,
    to_user_id: 'user-456',
    type: 'receive',
    created_at: new Date().toISOString(),
  },
}

/**
 * Helper to create mock device with overrides
 */
export function createMockDevice(overrides: Partial<typeof TEST_DEVICES.paired> = {}) {
  return {
    ...TEST_DEVICES.paired,
    ...overrides,
  }
}

/**
 * Helper to create mock profile with overrides
 */
export function createMockProfile(overrides: Partial<typeof TEST_PROFILES.primary> = {}) {
  return {
    ...TEST_PROFILES.primary,
    ...overrides,
  }
}

/**
 * Helper to create mock transaction with overrides
 */
export function createMockTransaction(overrides: Partial<typeof TEST_TRANSACTIONS.withMessage> = {}) {
  return {
    ...TEST_TRANSACTIONS.withMessage,
    ...overrides,
  }
}

/**
 * Helper to create mock Bitcoin price data (reusing bitcoin-price-mocks pattern)
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
 * Helper to create timestamp N minutes ago
 */
export function createTimestampMinutesAgo(minutes: number): string {
  const date = new Date(Date.now() - minutes * 60000)
  return date.toISOString()
}

/**
 * Create mock Supabase client with chainable methods
 */
export function createMockSupabaseClient() {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
  }
}

/**
 * Setup mock for successful device lookup by deviceId
 */
export function mockDeviceLookupByIdSuccess(mockSupabaseClient: any, device = TEST_DEVICES.paired) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: device,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for successful device lookup by pairingCode
 */
export function mockDeviceLookupByCodeSuccess(mockSupabaseClient: any, device = TEST_DEVICES.paired) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: device,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for device not found (404)
 */
export function mockDeviceNotFound(mockSupabaseClient: any) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for disconnected device (should not be returned)
 */
export function mockDeviceDisconnected(mockSupabaseClient: any) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for successful profile lookup
 */
export function mockProfileLookupSuccess(mockSupabaseClient: any, profile = TEST_PROFILES.primary) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: profile,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for profile not found (404)
 */
export function mockProfileNotFound(mockSupabaseClient: any) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Profile not found', code: 'PGRST116' },
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for last_seen_at update
 */
export function mockLastSeenAtUpdate(mockSupabaseClient: any) {
  const mockUpdateBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder)
  return mockUpdateBuilder
}

/**
 * Setup mock for transaction lookup with message
 */
export function mockTransactionWithMessage(mockSupabaseClient: any, transaction = TEST_TRANSACTIONS.withMessage) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: transaction,
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for transaction lookup with no message
 */
export function mockTransactionNoMessage(mockSupabaseClient: any) {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for successful RPC bitcoin price call
 */
export function mockBitcoinPriceRpcSuccess(mockSupabaseClient: any, priceData = createMockPriceData()) {
  mockSupabaseClient.rpc.mockResolvedValueOnce({
    data: [priceData],
    error: null,
  })
}

/**
 * Setup mock for RPC failure with fallback query success
 */
export function mockBitcoinPriceRpcFailureWithFallback(mockSupabaseClient: any, priceData = createMockPriceData()) {
  // RPC throws error
  mockSupabaseClient.rpc.mockRejectedValueOnce(new Error('RPC function not available'))
  
  // Fallback query succeeds
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { price: priceData.price },
      error: null,
    }),
  }
  mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Setup mock for stale bitcoin price (>60 minutes old)
 */
export function mockBitcoinPriceStale(mockSupabaseClient: any) {
  const stalePriceData = createMockPriceData({
    created_at: createTimestampMinutesAgo(90),
    age_minutes: 90,
  })
  mockSupabaseClient.rpc.mockResolvedValueOnce({
    data: [stalePriceData],
    error: null,
  })
}

/**
 * Setup mock for no bitcoin price available
 */
export function mockBitcoinPriceNotAvailable(mockSupabaseClient: any) {
  mockSupabaseClient.rpc.mockResolvedValueOnce({
    data: [],
    error: null,
  })
}

/**
 * Setup complete successful flow with all mocks
 */
export function setupSuccessfulConfigFlow(
  mockSupabaseClient: any,
  options: {
    device?: typeof TEST_DEVICES.paired
    profile?: typeof TEST_PROFILES.primary
    transaction?: typeof TEST_TRANSACTIONS.withMessage | null
    priceData?: ReturnType<typeof createMockPriceData>
  } = {}
) {
  const device = options.device || TEST_DEVICES.paired
  const profile = options.profile || TEST_PROFILES.primary
  const transaction = options.transaction
  const priceData = options.priceData || createMockPriceData()

  // Device lookup
  mockDeviceLookupByIdSuccess(mockSupabaseClient, device)
  
  // Profile lookup
  mockProfileLookupSuccess(mockSupabaseClient, profile)
  
  // last_seen_at update
  mockLastSeenAtUpdate(mockSupabaseClient)
  
  // Transaction lookup
  if (transaction === null) {
    mockTransactionNoMessage(mockSupabaseClient)
  } else {
    mockTransactionWithMessage(mockSupabaseClient, transaction || TEST_TRANSACTIONS.withMessage)
  }
  
  // Bitcoin price lookup
  mockBitcoinPriceRpcSuccess(mockSupabaseClient, priceData)
}

/**
 * Create test request with deviceId parameter
 */
export function createRequestWithDeviceId(deviceId: string) {
  return new NextRequest(`http://localhost:3000/api/device/config?deviceId=${deviceId}`)
}

/**
 * Create test request with pairingCode parameter
 */
export function createRequestWithPairingCode(pairingCode: string) {
  return new NextRequest(`http://localhost:3000/api/device/config?pairingCode=${pairingCode}`)
}

/**
 * Create test request with no parameters
 */
export function createRequestWithNoParams() {
  return new NextRequest('http://localhost:3000/api/device/config')
}

/**
 * Assertion helper: Verify device query was called correctly
 */
export function expectDeviceQueried(mockQueryBuilder: any, statusFilter = 'paired') {
  expect(mockQueryBuilder.select).toHaveBeenCalledWith('*')
  expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', statusFilter)
}

/**
 * Assertion helper: Verify profile query was called correctly
 */
export function expectProfileQueried(mockQueryBuilder: any, userId: string) {
  expect(mockQueryBuilder.select).toHaveBeenCalledWith('id, balance, name')
  expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', userId)
  expect(mockQueryBuilder.single).toHaveBeenCalled()
}

/**
 * Assertion helper: Verify last_seen_at update was called
 */
export function expectLastSeenAtUpdated(mockUpdateBuilder: any, deviceId: string) {
  expect(mockUpdateBuilder.update).toHaveBeenCalledWith(
    expect.objectContaining({
      last_seen_at: expect.any(String),
    })
  )
  expect(mockUpdateBuilder.eq).toHaveBeenCalledWith('id', deviceId)
}

/**
 * Assertion helper: Verify transaction query was called correctly
 */
export function expectTransactionQueried(mockQueryBuilder: any, userId: string) {
  expect(mockQueryBuilder.select).toHaveBeenCalledWith('message')
  expect(mockQueryBuilder.eq).toHaveBeenCalledWith('to_user_id', userId)
  expect(mockQueryBuilder.eq).toHaveBeenCalledWith('type', 'receive')
  expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1)
  expect(mockQueryBuilder.single).toHaveBeenCalled()
}

/**
 * Assertion helper: Verify RPC call for bitcoin price
 */
export function expectBitcoinPriceRpcCalled(mockSupabaseClient: any) {
  expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_latest_bitcoin_price', {
    p_currency: 'USD',
  })
}

/**
 * Assertion helper: Verify response structure
 */
export async function expectSuccessResponse(response: Response, expectedFields?: Partial<{
  deviceId: string
  petName: string
  petType: string
  userId: string
  userName: string
  balance: number
  btcPrice: number | null
  pollInterval: number
  serverUrl: string
  lastMessage: string
}>) {
  expect(response.status).toBe(200)
  const data = await response.json()
  
  expect(data).toHaveProperty('success', true)
  expect(data).toHaveProperty('config')
  expect(data.config).toHaveProperty('deviceId')
  expect(data.config).toHaveProperty('petName')
  expect(data.config).toHaveProperty('petType')
  expect(data.config).toHaveProperty('userId')
  expect(data.config).toHaveProperty('userName')
  expect(data.config).toHaveProperty('balance')
  expect(data.config).toHaveProperty('btcPrice')
  expect(data.config).toHaveProperty('pollInterval')
  expect(data.config).toHaveProperty('serverUrl')
  expect(data.config).toHaveProperty('lastMessage')
  
  if (expectedFields) {
    Object.entries(expectedFields).forEach(([key, value]) => {
      expect(data.config[key]).toBe(value)
    })
  }
  
  return data
}

/**
 * Assertion helper: Verify error response
 */
export async function expectErrorResponse(response: Response, expectedStatus: number, expectedError?: string) {
  expect(response.status).toBe(expectedStatus)
  const data = await response.json()
  
  expect(data).toHaveProperty('success', false)
  expect(data).toHaveProperty('error')
  
  if (expectedError) {
    expect(data.error).toContain(expectedError)
  }
  
  return data
}