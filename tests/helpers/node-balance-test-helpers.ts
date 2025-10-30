import { NextRequest } from 'next/server'

/**
 * Creates a mock authenticated request for node balance API
 */
export function createAuthorizedRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/node-balance', {
    method: 'GET',
    headers: {
      authorization: 'Bearer test-cron-secret',
    },
  })
}

/**
 * Creates a mock LND response for successful balance queries
 */
export function mockSuccessfulLndResponse(
  channelBalance: string,
  pendingBalance: string,
  onchainBalance: string
) {
  return (endpoint: string) => {
    if (endpoint === '/v1/balance/channels') {
      return Promise.resolve({
        success: true,
        data: { balance: channelBalance, pending_open_balance: pendingBalance },
      })
    }
    if (endpoint === '/v1/balance/blockchain') {
      return Promise.resolve({
        success: true,
        data: { confirmed_balance: onchainBalance },
      })
    }
    return Promise.resolve({ success: false, error: 'Unknown endpoint' })
  }
}

/**
 * Creates a mock LND response where channel balance API fails
 */
export function mockChannelBalanceFailure(errorMessage: string) {
  return (endpoint: string) => {
    if (endpoint === '/v1/balance/channels') {
      return Promise.resolve({
        success: false,
        error: errorMessage,
      })
    }
    if (endpoint === '/v1/balance/blockchain') {
      return Promise.resolve({
        success: true,
        data: { confirmed_balance: '2000' },
      })
    }
    return Promise.resolve({ success: false, error: 'Unknown endpoint' })
  }
}

/**
 * Creates a mock LND response where blockchain balance API fails
 */
export function mockBlockchainBalanceFailure(
  channelBalance: string,
  pendingBalance: string,
  errorMessage: string
) {
  return (endpoint: string) => {
    if (endpoint === '/v1/balance/channels') {
      return Promise.resolve({
        success: true,
        data: { balance: channelBalance, pending_open_balance: pendingBalance },
      })
    }
    if (endpoint === '/v1/balance/blockchain') {
      return Promise.resolve({
        success: false,
        error: errorMessage,
      })
    }
    return Promise.resolve({ success: false, error: 'Unknown endpoint' })
  }
}
