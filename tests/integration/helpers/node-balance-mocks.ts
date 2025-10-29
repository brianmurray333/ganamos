import { NextRequest } from 'next/server'
import { expect } from 'vitest'

/**
 * Mock data fixtures for node-balance API tests
 * Follows the same pattern as bitcoin-price-mocks.ts
 */

// ===== LND API Response Fixtures =====

export const MOCK_CHANNEL_BALANCE_SUCCESS = {
  success: true,
  data: {
    balance: '5000000',
    pending_open_balance: '500000',
  },
}

export const MOCK_BLOCKCHAIN_BALANCE_SUCCESS = {
  success: true,
  data: {
    confirmed_balance: '1000000',
  },
}

export const MOCK_CHANNEL_BALANCE_LARGE = {
  success: true,
  data: {
    balance: '100000000000', // 1000 BTC in sats
    pending_open_balance: '50000000000',
  },
}

export const MOCK_BLOCKCHAIN_BALANCE_LARGE = {
  success: true,
  data: {
    confirmed_balance: '25000000000',
  },
}

export const MOCK_CHANNEL_BALANCE_ZERO = {
  success: true,
  data: {
    balance: '0',
    pending_open_balance: '0',
  },
}

export const MOCK_BLOCKCHAIN_BALANCE_ZERO = {
  success: true,
  data: {
    confirmed_balance: '0',
  },
}

export const MOCK_CHANNEL_BALANCE_FAILURE = {
  success: false,
  error: 'Failed to connect to LND node',
  details: { code: 'ECONNREFUSED' },
}

export const MOCK_BLOCKCHAIN_BALANCE_FAILURE = {
  success: false,
  error: 'Blockchain API timeout',
  details: { code: 'ETIMEDOUT' },
}

// ===== Helper Functions =====

/**
 * Create a mock NextRequest with optional headers
 */
export function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  const headersObj = new Headers()
  Object.entries(headers).forEach(([key, value]) => {
    headersObj.set(key, value)
  })

  return {
    headers: headersObj,
    method: 'GET',
    url: 'http://localhost:3000/api/admin/node-balance',
  } as any
}

/**
 * Create a mock NextRequest with valid authorization header
 */
export function createAuthorizedRequest(secret: string = 'test-secret-123'): NextRequest {
  return createMockRequest({
    authorization: `Bearer ${secret}`,
  })
}

/**
 * Create a mock NextRequest with invalid authorization header
 */
export function createUnauthorizedRequest(): NextRequest {
  return createMockRequest({
    authorization: 'Bearer wrong-secret',
  })
}

/**
 * Helper to create custom balance response mocks
 */
export function createMockChannelBalance(
  balance: string,
  pendingBalance: string = '0',
  success: boolean = true
) {
  return {
    success,
    data: success ? {
      balance,
      pending_open_balance: pendingBalance,
    } : undefined,
    error: success ? undefined : 'Mock error',
  }
}

/**
 * Helper to create custom blockchain balance response mocks
 */
export function createMockBlockchainBalance(
  confirmedBalance: string,
  success: boolean = true
) {
  return {
    success,
    data: success ? {
      confirmed_balance: confirmedBalance,
    } : undefined,
    error: success ? undefined : 'Mock error',
  }
}

/**
 * Helper to verify response schema for successful requests
 */
export function expectSuccessResponseSchema(data: any) {
  expect(data).toHaveProperty('success', true)
  expect(data).toHaveProperty('balances')
  expect(data.balances).toHaveProperty('channel_balance')
  expect(data.balances).toHaveProperty('pending_balance')
  expect(data.balances).toHaveProperty('onchain_balance')
  expect(data.balances).toHaveProperty('total_balance')
  expect(data).not.toHaveProperty('error')
}

/**
 * Helper to verify response schema for error requests
 */
export function expectErrorResponseSchema(data: any) {
  expect(data).toHaveProperty('error')
  expect(typeof data.error).toBe('string')
  expect(data).not.toHaveProperty('balances')
}

/**
 * Helper to verify all balance values are numbers
 */
export function expectBalancesAreNumbers(balances: any) {
  expect(typeof balances.channel_balance).toBe('number')
  expect(typeof balances.pending_balance).toBe('number')
  expect(typeof balances.onchain_balance).toBe('number')
  expect(typeof balances.total_balance).toBe('number')
}

/**
 * Helper to verify total balance calculation
 */
export function expectCorrectTotalBalance(
  balances: any,
  expectedChannel: number,
  expectedPending: number,
  expectedOnchain: number
) {
  const expectedTotal = expectedChannel + expectedPending + expectedOnchain
  expect(balances.channel_balance).toBe(expectedChannel)
  expect(balances.pending_balance).toBe(expectedPending)
  expect(balances.onchain_balance).toBe(expectedOnchain)
  expect(balances.total_balance).toBe(expectedTotal)
}
