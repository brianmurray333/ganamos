import { vi } from 'vitest'

/**
 * Node Balance API Mock Utilities
 * 
 * Provides reusable mock factories for testing the /api/admin/node-balance endpoint.
 * These mocks simulate lndRequest responses without making real LND API calls.
 */

// Type definitions for LND API responses
export interface LndChannelBalanceResponse {
  balance: string
  pending_open_balance: string
}

export interface LndBlockchainBalanceResponse {
  confirmed_balance: string
}

export interface LndRequestResult {
  success: boolean
  data?: any
  error?: string
  details?: any
}

/**
 * Create a successful mock response for channel balance
 */
export function createMockChannelBalance(
  balance: number = 500000,
  pendingBalance: number = 50000
): LndRequestResult {
  return {
    success: true,
    data: {
      balance: balance.toString(),
      pending_open_balance: pendingBalance.toString(),
    },
  }
}

/**
 * Create a successful mock response for blockchain balance
 */
export function createMockBlockchainBalance(
  confirmedBalance: number = 100000
): LndRequestResult {
  return {
    success: true,
    data: {
      confirmed_balance: confirmedBalance.toString(),
    },
  }
}

/**
 * Create a mock for LND API error response
 */
export function createLndErrorMock(
  errorMessage: string = 'LND API error',
  details?: any
): LndRequestResult {
  return {
    success: false,
    error: errorMessage,
    details: details,
  }
}

/**
 * Create a mock for configuration error (missing env vars)
 */
export function createConfigErrorMock(): LndRequestResult {
  return {
    success: false,
    error: 'Lightning configuration missing',
  }
}

/**
 * Create a mock for network timeout error
 */
export function createNetworkTimeoutMock(): LndRequestResult {
  return {
    success: false,
    error: 'Failed to communicate with Lightning node',
    details: 'Network timeout',
  }
}

/**
 * Create a mock for malformed JSON response
 */
export function createMalformedResponseMock(): LndRequestResult {
  return {
    success: false,
    error: 'Invalid response format: unknown',
    details: 'Status: 200, Body: <html>Not JSON</html>...',
  }
}

/**
 * Create a mock lndRequest function with predefined responses
 * 
 * @param channelBalanceResponse - Response for /v1/balance/channels call
 * @param blockchainBalanceResponse - Response for /v1/balance/blockchain call
 */
export function createMockLndRequest(
  channelBalanceResponse: LndRequestResult,
  blockchainBalanceResponse: LndRequestResult
) {
  return vi.fn((endpoint: string) => {
    if (endpoint === '/v1/balance/channels') {
      return Promise.resolve(channelBalanceResponse)
    }
    if (endpoint === '/v1/balance/blockchain') {
      return Promise.resolve(blockchainBalanceResponse)
    }
    return Promise.resolve(createLndErrorMock('Unknown endpoint'))
  })
}

/**
 * Create a mock for successful balance fetch with all three balance types
 */
export function createSuccessfulBalanceMock(
  channelBalance: number = 500000,
  pendingBalance: number = 50000,
  onChainBalance: number = 100000
) {
  return createMockLndRequest(
    createMockChannelBalance(channelBalance, pendingBalance),
    createMockBlockchainBalance(onChainBalance)
  )
}

/**
 * Create a mock where channel balance fails (hard failure)
 */
export function createChannelBalanceFailureMock(
  errorMessage: string = 'Failed to get channel balance'
) {
  return createMockLndRequest(
    createLndErrorMock(errorMessage),
    createMockBlockchainBalance() // Won't be called due to early return
  )
}

/**
 * Create a mock where on-chain balance fails (soft failure - should default to 0)
 */
export function createOnChainBalanceFailureMock(
  channelBalance: number = 500000,
  pendingBalance: number = 50000
) {
  return createMockLndRequest(
    createMockChannelBalance(channelBalance, pendingBalance),
    createLndErrorMock('Failed to get blockchain balance')
  )
}

/**
 * Create a mock for zero balances (new node or empty wallet)
 */
export function createZeroBalanceMock() {
  return createSuccessfulBalanceMock(0, 0, 0)
}

/**
 * Create a mock for large balance values (stress test)
 */
export function createLargeBalanceMock(
  channelBalance: number = 100000000,
  pendingBalance: number = 10000000,
  onChainBalance: number = 50000000
) {
  return createSuccessfulBalanceMock(channelBalance, pendingBalance, onChainBalance)
}

/**
 * Create a mock where lndRequest throws an exception
 */
export function createExceptionMock(errorMessage: string = 'Unexpected error') {
  return vi.fn(() => {
    throw new Error(errorMessage)
  })
}

/**
 * Create a mock for missing environment variables scenario
 */
export function createMissingEnvVarsMock() {
  return createMockLndRequest(
    createConfigErrorMock(),
    createConfigErrorMock()
  )
}