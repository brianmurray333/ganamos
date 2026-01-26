import { vi, expect } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Mock LND API response factories for node balance testing
 */

/**
 * Create mock successful channel balance response from LND
 */
export function createMockChannelBalanceResponse(overrides?: {
  balance?: string
  pending_open_balance?: string
}) {
  return {
    balance: overrides?.balance ?? '1000000',
    pending_open_balance: overrides?.pending_open_balance ?? '50000',
    unsettled_balance: '0',
    unsettled_local_balance: '0',
    unsettled_remote_balance: '0',
  }
}

/**
 * Create mock successful blockchain balance response from LND
 */
export function createMockBlockchainBalanceResponse(overrides?: {
  confirmed_balance?: string
  unconfirmed_balance?: string
}) {
  return {
    confirmed_balance: overrides?.confirmed_balance ?? '200000',
    unconfirmed_balance: overrides?.unconfirmed_balance ?? '0',
    total_balance: overrides?.confirmed_balance ?? '200000',
  }
}

/**
 * Create mock successful lndRequest response
 */
export function createMockLndSuccessResponse(data: any) {
  return {
    success: true,
    data,
  }
}

/**
 * Create mock failed lndRequest response
 */
export function createMockLndErrorResponse(error: string, details?: any) {
  return {
    success: false,
    error,
    details,
  }
}

/**
 * Create mock GET request for /api/admin/node-balance
 */
export function createNodeBalanceRequest(): NextRequest {
  return {
    method: 'GET',
    headers: new Headers(),
    url: 'http://localhost:3457/api/admin/node-balance',
  } as any
}

/**
 * Mock lndRequest for successful channel balance retrieval
 */
export function mockLndChannelBalanceSuccess(
  mockLndRequest: any,
  balance: string = '1000000',
  pendingBalance: string = '50000'
) {
  const channelBalanceResponse = createMockChannelBalanceResponse({
    balance,
    pending_open_balance: pendingBalance,
  })
  
  mockLndRequest.mockResolvedValueOnce(
    createMockLndSuccessResponse(channelBalanceResponse)
  )
}

/**
 * Mock lndRequest for successful blockchain balance retrieval
 */
export function mockLndBlockchainBalanceSuccess(
  mockLndRequest: any,
  confirmedBalance: string = '200000'
) {
  const blockchainBalanceResponse = createMockBlockchainBalanceResponse({
    confirmed_balance: confirmedBalance,
  })
  
  mockLndRequest.mockResolvedValueOnce(
    createMockLndSuccessResponse(blockchainBalanceResponse)
  )
}

/**
 * Mock lndRequest for both channel and blockchain balance success
 */
export function mockLndFullBalanceSuccess(
  mockLndRequest: any,
  channelBalance: string = '1000000',
  pendingBalance: string = '50000',
  onchainBalance: string = '200000'
) {
  mockLndChannelBalanceSuccess(mockLndRequest, channelBalance, pendingBalance)
  mockLndBlockchainBalanceSuccess(mockLndRequest, onchainBalance)
}

/**
 * Mock lndRequest for channel balance failure
 */
export function mockLndChannelBalanceError(
  mockLndRequest: any,
  error: string = 'Failed to get channel balance',
  details?: any
) {
  mockLndRequest.mockResolvedValueOnce(
    createMockLndErrorResponse(error, details)
  )
}

/**
 * Mock lndRequest for blockchain balance failure
 */
export function mockLndBlockchainBalanceError(
  mockLndRequest: any,
  error: string = 'Failed to get blockchain balance',
  details?: any
) {
  mockLndRequest.mockResolvedValueOnce(
    createMockLndErrorResponse(error, details)
  )
}

/**
 * Mock lndRequest for configuration errors (missing credentials)
 */
export function mockLndConfigurationError(mockLndRequest: any) {
  mockLndRequest.mockResolvedValue(
    createMockLndErrorResponse('Lightning configuration missing')
  )
}

/**
 * Mock lndRequest for network timeout
 */
export function mockLndNetworkTimeout(mockLndRequest: any) {
  mockLndRequest.mockResolvedValue(
    createMockLndErrorResponse(
      'Failed to communicate with Lightning node',
      'Network timeout after 30000ms'
    )
  )
}

/**
 * Mock lndRequest for malformed response
 */
export function mockLndMalformedResponse(mockLndRequest: any) {
  mockLndRequest.mockResolvedValue(
    createMockLndErrorResponse(
      'Invalid response format: text/html',
      'Status: 200, Body: <!DOCTYPE html>...'
    )
  )
}

/**
 * Assertion helper: Verify successful balance response structure
 */
export function expectSuccessfulBalanceResponse(
  response: Response,
  data: any,
  expectedBalances: {
    channel_balance: number
    pending_balance: number
    onchain_balance: number
    total_balance: number
  }
) {
  expect(response.status).toBe(200)
  expect(data).toEqual({
    success: true,
    balances: {
      channel_balance: expectedBalances.channel_balance,
      pending_balance: expectedBalances.pending_balance,
      onchain_balance: expectedBalances.onchain_balance,
      total_balance: expectedBalances.total_balance,
    },
  })
}

/**
 * Assertion helper: Verify error response structure
 */
export function expectErrorResponse(
  response: Response,
  data: any,
  expectedError: string,
  expectedStatus: number = 500
) {
  expect(response.status).toBe(expectedStatus)
  expect(data).toHaveProperty('error', expectedError)
  expect(data).toHaveProperty('details')
}

/**
 * Assertion helper: Verify balance aggregation is correct
 */
export function expectBalanceAggregation(data: any) {
  const { channel_balance, pending_balance, onchain_balance, total_balance } = data.balances
  
  expect(total_balance).toBe(channel_balance + pending_balance + onchain_balance)
}

/**
 * Assertion helper: Verify lndRequest was called with correct endpoint
 */
export function expectLndRequestCalled(
  mockLndRequest: any,
  endpoint: string,
  callIndex: number = 0
) {
  expect(mockLndRequest).toHaveBeenNthCalledWith(callIndex + 1, endpoint)
}

/**
 * Setup environment variables for Lightning configuration
 */
export function setupLightningEnvironment() {
  process.env.LND_REST_URL = 'https://test-lnd-node.voltage.cloud'
  process.env.LND_ADMIN_MACAROON = '0201036c6e640224030a10deadbeefdeadbeefdeadbeefdeadbeef1201301a0c0a04696e666f12047265616400022974696d65203c2032303234313233313232333035392026262072657175657374732e6d6574686f64203d3d2022474554220000062093b3e1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab'
}

/**
 * Clear Lightning environment variables
 */
export function clearLightningEnvironment() {
  delete process.env.LND_REST_URL
  delete process.env.LND_ADMIN_MACAROON
}

/**
 * Setup environment with missing LND_REST_URL
 */
export function setupMissingLndUrl() {
  delete process.env.LND_REST_URL
  process.env.LND_ADMIN_MACAROON = '0201036c6e640224030a10deadbeefdeadbeefdeadbeefdeadbeef'
}

/**
 * Setup environment with missing LND_ADMIN_MACAROON
 */
export function setupMissingLndMacaroon() {
  process.env.LND_REST_URL = 'https://test-lnd-node.voltage.cloud'
  delete process.env.LND_ADMIN_MACAROON
}

/**
 * Test data constants
 */
export const TEST_BALANCES = {
  CHANNEL: 1000000,
  PENDING: 50000,
  ONCHAIN: 200000,
  TOTAL: 1250000,
}

export const LARGE_BALANCES = {
  CHANNEL: 2100000000000000, // 21M BTC in sats
  PENDING: 100000000000,
  ONCHAIN: 500000000000,
  TOTAL: 2100600000000000,
}

export const ZERO_BALANCES = {
  CHANNEL: 0,
  PENDING: 0,
  ONCHAIN: 0,
  TOTAL: 0,
}