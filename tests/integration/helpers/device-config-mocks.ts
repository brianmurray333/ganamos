import { vi } from 'vitest'

/**
 * Mock data factories for device config tests
 */

export function createMockDevice(overrides = {}) {
  return {
    id: 'device-123',
    user_id: 'user-456',
    pairing_code: 'ABC123',
    pet_name: 'Fluffy',
    pet_type: 'cat',
    status: 'paired',
    last_seen_at: '2024-01-15T10:00:00Z',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

export function createMockProfile(overrides = {}) {
  return {
    id: 'user-456',
    balance: 50000,
    name: 'Test User',
    ...overrides,
  }
}

export function createMockTransaction(overrides = {}) {
  return {
    message: 'Payment received',
    ...overrides,
  }
}

export function createMockBitcoinPrice(overrides = {}) {
  return {
    price: '45000.00',
    currency: 'USD',
    source: 'coinbase',
    created_at: new Date().toISOString(),
    age_minutes: 5,
    ...overrides,
  }
}

/**
 * Creates a chainable query builder mock for a specific table
 */
export function createMockQueryBuilder(returnValue: any) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(returnValue),
    update: vi.fn().mockReturnThis(),
  }
}

/**
 * Sets up successful device lookup by deviceId
 */
export function mockDeviceLookupByDeviceId(
  mockSupabaseClient: any,
  device = createMockDevice()
) {
  const queryBuilder = createMockQueryBuilder({
    data: device,
    error: null,
  })
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'devices') {
      return queryBuilder
    }
    return createMockQueryBuilder({ data: null, error: null })
  })
  
  return queryBuilder
}

/**
 * Sets up successful device lookup by pairingCode
 */
export function mockDeviceLookupByPairingCode(
  mockSupabaseClient: any,
  device = createMockDevice()
) {
  const queryBuilder = createMockQueryBuilder({
    data: device,
    error: null,
  })
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'devices') {
      return queryBuilder
    }
    return createMockQueryBuilder({ data: null, error: null })
  })
  
  return queryBuilder
}

/**
 * Sets up device lookup failure (not found)
 */
export function mockDeviceNotFound(mockSupabaseClient: any) {
  const queryBuilder = createMockQueryBuilder({
    data: null,
    error: { message: 'Device not found', code: 'PGRST116' },
  })
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'devices') {
      return queryBuilder
    }
    return createMockQueryBuilder({ data: null, error: null })
  })
  
  return queryBuilder
}

/**
 * Sets up successful profile lookup
 */
export function mockProfileLookup(
  mockSupabaseClient: any,
  profile = createMockProfile()
) {
  const deviceQueryBuilder = createMockQueryBuilder({
    data: createMockDevice(),
    error: null,
  })
  
  const profileQueryBuilder = createMockQueryBuilder({
    data: profile,
    error: null,
  })
  
  const updateQueryBuilder = createMockQueryBuilder({
    data: null,
    error: null,
  })
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'devices') {
      // Check if this is an update call by checking the call stack
      const stack = new Error().stack || ''
      if (stack.includes('update')) {
        return updateQueryBuilder
      }
      return deviceQueryBuilder
    }
    if (table === 'profiles') {
      return profileQueryBuilder
    }
    return createMockQueryBuilder({ data: null, error: null })
  })
  
  return { deviceQueryBuilder, profileQueryBuilder, updateQueryBuilder }
}

/**
 * Sets up profile lookup failure (not found)
 */
export function mockProfileNotFound(mockSupabaseClient: any) {
  const deviceQueryBuilder = createMockQueryBuilder({
    data: createMockDevice(),
    error: null,
  })
  
  const profileQueryBuilder = createMockQueryBuilder({
    data: null,
    error: { message: 'Profile not found', code: 'PGRST116' },
  })
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'devices') {
      return deviceQueryBuilder
    }
    if (table === 'profiles') {
      return profileQueryBuilder
    }
    return createMockQueryBuilder({ data: null, error: null })
  })
  
  return { deviceQueryBuilder, profileQueryBuilder }
}

/**
 * Sets up successful last transaction message lookup
 */
export function mockLastTransactionMessage(
  mockSupabaseClient: any,
  message = 'Payment received'
) {
  const transactionQueryBuilder = createMockQueryBuilder({
    data: { message },
    error: null,
  })
  
  // Preserve existing device and profile mocks
  const existingFrom = mockSupabaseClient.from
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'transactions') {
      return transactionQueryBuilder
    }
    // Call original mock for other tables
    return existingFrom(table)
  })
  
  return transactionQueryBuilder
}

/**
 * Sets up successful Bitcoin price RPC call
 */
export function mockBitcoinPriceRpcSuccess(
  mockSupabaseClient: any,
  priceData = createMockBitcoinPrice()
) {
  mockSupabaseClient.rpc.mockResolvedValue({
    data: [priceData],
    error: null,
  })
}

/**
 * Sets up Bitcoin price RPC failure with table fallback success
 */
export function mockBitcoinPriceRpcFailureFallback(
  mockSupabaseClient: any,
  priceData = createMockBitcoinPrice()
) {
  // RPC fails
  mockSupabaseClient.rpc.mockRejectedValue(new Error('RPC call failed'))
  
  // Fallback table query succeeds
  const priceQueryBuilder = createMockQueryBuilder({
    data: { price: priceData.price },
    error: null,
  })
  
  const existingFrom = mockSupabaseClient.from
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'bitcoin_prices') {
      return priceQueryBuilder
    }
    return existingFrom(table)
  })
  
  return priceQueryBuilder
}

/**
 * Sets up complete successful device config scenario
 */
export function mockCompleteDeviceConfigSuccess(
  mockSupabaseClient: any,
  options: {
    device?: any
    profile?: any
    transaction?: any
    bitcoinPrice?: any
  } = {}
) {
  const device = options.device || createMockDevice()
  const profile = options.profile || createMockProfile()
  const transaction = options.transaction || createMockTransaction()
  const bitcoinPrice = options.bitcoinPrice || createMockBitcoinPrice()
  
  // Device lookup
  const deviceQueryBuilder = createMockQueryBuilder({
    data: device,
    error: null,
  })
  
  // Profile lookup
  const profileQueryBuilder = createMockQueryBuilder({
    data: profile,
    error: null,
  })
  
  // Update last_seen_at
  const updateQueryBuilder = createMockQueryBuilder({
    data: null,
    error: null,
  })
  
  // Transaction lookup
  const transactionQueryBuilder = createMockQueryBuilder({
    data: transaction,
    error: null,
  })
  
  // Bitcoin price table (fallback)
  const priceQueryBuilder = createMockQueryBuilder({
    data: { price: bitcoinPrice.price },
    error: null,
  })
  
  let isUpdateCall = false
  
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'devices') {
      // Return update builder if .update() was called
      if (isUpdateCall) {
        isUpdateCall = false
        return updateQueryBuilder
      }
      return deviceQueryBuilder
    }
    if (table === 'profiles') {
      return profileQueryBuilder
    }
    if (table === 'transactions') {
      return transactionQueryBuilder
    }
    if (table === 'bitcoin_prices') {
      return priceQueryBuilder
    }
    return createMockQueryBuilder({ data: null, error: null })
  })
  
  // Track when update is called
  updateQueryBuilder.update = vi.fn(() => {
    isUpdateCall = true
    return updateQueryBuilder
  })
  
  // Bitcoin price RPC
  mockSupabaseClient.rpc.mockResolvedValue({
    data: [bitcoinPrice],
    error: null,
  })
  
  return {
    deviceQueryBuilder,
    profileQueryBuilder,
    updateQueryBuilder,
    transactionQueryBuilder,
    priceQueryBuilder,
  }
}

/**
 * Expectation helpers
 */

export function expectDeviceQueryCalled(
  mockSupabaseClient: any,
  field: 'id' | 'pairing_code',
  value: string
) {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
  const fromCall = mockSupabaseClient.from.mock.results.find(
    (result: any) => result.value && typeof result.value.select === 'function'
  )
  if (fromCall) {
    expect(fromCall.value.select).toHaveBeenCalledWith('*')
    expect(fromCall.value.eq).toHaveBeenCalledWith('status', 'paired')
    expect(fromCall.value.eq).toHaveBeenCalledWith(field, value)
  }
}

export function expectProfileQueryCalled(
  mockSupabaseClient: any,
  userId: string
) {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles')
  // Find the specific from('profiles') call
  const profilesCallIndex = mockSupabaseClient.from.mock.calls.findIndex(
    (call: any) => call[0] === 'profiles'
  )
  if (profilesCallIndex >= 0) {
    const profileQueryBuilder = mockSupabaseClient.from.mock.results[profilesCallIndex].value
    expect(profileQueryBuilder.select).toHaveBeenCalled()
    expect(profileQueryBuilder.eq).toHaveBeenCalledWith('id', userId)
  }
}

export function expectLastSeenAtUpdated(
  mockSupabaseClient: any,
  deviceId: string
) {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices')
  // Find the update call (there should be multiple devices calls)
  const fromCalls = mockSupabaseClient.from.mock.results
  const updateCall = fromCalls.find(
    (result: any) => result.value && typeof result.value.update === 'function'
  )
  if (updateCall) {
    expect(updateCall.value.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_seen_at: expect.any(String),
      })
    )
    expect(updateCall.value.eq).toHaveBeenCalledWith('id', deviceId)
  }
}

export function expectTransactionQueryCalled(
  mockSupabaseClient: any,
  userId: string
) {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith('transactions')
  // Find the specific from('transactions') call
  const transactionsCallIndex = mockSupabaseClient.from.mock.calls.findIndex(
    (call: any) => call[0] === 'transactions'
  )
  if (transactionsCallIndex >= 0) {
    const transactionQueryBuilder = mockSupabaseClient.from.mock.results[transactionsCallIndex].value
    expect(transactionQueryBuilder.select).toHaveBeenCalled()
    expect(transactionQueryBuilder.eq).toHaveBeenCalledWith('to_user_id', userId)
    expect(transactionQueryBuilder.eq).toHaveBeenCalledWith('type', 'receive')
  }
}

export function expectBitcoinPriceRpcCalled(mockSupabaseClient: any) {
  expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
    'get_latest_bitcoin_price',
    {
      p_currency: 'USD',
    }
  )
}