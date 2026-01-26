import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/admin/node-balance/route'
import { NextRequest } from 'next/server'
import {
  createNodeBalanceRequest,
  mockLndFullBalanceSuccess,
  mockLndChannelBalanceSuccess,
  mockLndChannelBalanceError,
  mockLndBlockchainBalanceSuccess,
  mockLndBlockchainBalanceError,
  mockLndConfigurationError,
  mockLndNetworkTimeout,
  mockLndMalformedResponse,
  expectSuccessfulBalanceResponse,
  expectErrorResponse,
  expectBalanceAggregation,
  expectLndRequestCalled,
  setupLightningEnvironment,
  clearLightningEnvironment,
  setupMissingLndUrl,
  setupMissingLndMacaroon,
  TEST_BALANCES,
  LARGE_BALANCES,
  ZERO_BALANCES,
} from '@/tests/unit/helpers/node-balance-mocks'

// Mock the Lightning module
vi.mock('@/lib/lightning', () => ({
  lndRequest: vi.fn(),
}))

// Import mocked function for assertions
import { lndRequest } from '@/lib/lightning'

describe('GET /api/admin/node-balance - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupLightningEnvironment()
  })

  afterEach(() => {
    clearLightningEnvironment()
    vi.restoreAllMocks()
  })

  describe('Successful Balance Retrieval', () => {
    it('should return aggregated node balance when both LND APIs succeed', async () => {
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        TEST_BALANCES.CHANNEL.toString(),
        TEST_BALANCES.PENDING.toString(),
        TEST_BALANCES.ONCHAIN.toString()
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectSuccessfulBalanceResponse(response, data, {
        channel_balance: TEST_BALANCES.CHANNEL,
        pending_balance: TEST_BALANCES.PENDING,
        onchain_balance: TEST_BALANCES.ONCHAIN,
        total_balance: TEST_BALANCES.TOTAL,
      })
    })

    it('should call lndRequest twice with correct endpoints', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      await GET(request)

      expect(lndRequest).toHaveBeenCalledTimes(2)
      expectLndRequestCalled(vi.mocked(lndRequest), '/v1/balance/channels', 0)
      expectLndRequestCalled(vi.mocked(lndRequest), '/v1/balance/blockchain', 1)
    })

    it('should correctly aggregate channel, pending, and onchain balances', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectBalanceAggregation(data)
    })

    it('should handle zero balances correctly', async () => {
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        ZERO_BALANCES.CHANNEL.toString(),
        ZERO_BALANCES.PENDING.toString(),
        ZERO_BALANCES.ONCHAIN.toString()
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectSuccessfulBalanceResponse(response, data, {
        channel_balance: ZERO_BALANCES.CHANNEL,
        pending_balance: ZERO_BALANCES.PENDING,
        onchain_balance: ZERO_BALANCES.ONCHAIN,
        total_balance: ZERO_BALANCES.TOTAL,
      })
    })

    it('should handle large balance values correctly', async () => {
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        LARGE_BALANCES.CHANNEL.toString(),
        LARGE_BALANCES.PENDING.toString(),
        LARGE_BALANCES.ONCHAIN.toString()
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectSuccessfulBalanceResponse(response, data, {
        channel_balance: LARGE_BALANCES.CHANNEL,
        pending_balance: LARGE_BALANCES.PENDING,
        onchain_balance: LARGE_BALANCES.ONCHAIN,
        total_balance: LARGE_BALANCES.TOTAL,
      })
    })

    it('should parse balance strings to integers correctly', async () => {
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        '1234567',
        '89012',
        '345678'
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(typeof data.balances.channel_balance).toBe('number')
      expect(typeof data.balances.pending_balance).toBe('number')
      expect(typeof data.balances.onchain_balance).toBe('number')
      expect(typeof data.balances.total_balance).toBe('number')
      expect(data.balances.total_balance).toBe(1234567 + 89012 + 345678)
    })
  })

  describe('Channel Balance API Errors (Hard Failures)', () => {
    it('should return 500 when channel balance API fails', async () => {
      mockLndChannelBalanceError(
        vi.mocked(lndRequest),
        'LND API error: 500 Internal Server Error',
        { message: 'Internal LND error' }
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toBe('LND API error: 500 Internal Server Error')
    })

    it('should not call blockchain API when channel API fails', async () => {
      mockLndChannelBalanceError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      await GET(request)

      expect(lndRequest).toHaveBeenCalledTimes(1)
      expectLndRequestCalled(vi.mocked(lndRequest), '/v1/balance/channels', 0)
    })

    it('should log error details when channel balance fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error')
      mockLndChannelBalanceError(
        vi.mocked(lndRequest),
        'Connection refused'
      )

      const request = createNodeBalanceRequest()
      await GET(request)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to get node balance:',
        'Connection refused'
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Blockchain Balance API Errors (Soft Failures)', () => {
    it('should gracefully fallback to 0 onchain balance when blockchain API fails', async () => {
      mockLndChannelBalanceSuccess(vi.mocked(lndRequest), '1000000', '50000')
      mockLndBlockchainBalanceError(
        vi.mocked(lndRequest),
        'Blockchain sync in progress'
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(1000000)
      expect(data.balances.pending_balance).toBe(50000)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(1050000)
    })

    it('should still call blockchain API even after successful channel API', async () => {
      mockLndChannelBalanceSuccess(vi.mocked(lndRequest))
      mockLndBlockchainBalanceError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      await GET(request)

      expect(lndRequest).toHaveBeenCalledTimes(2)
      expectLndRequestCalled(vi.mocked(lndRequest), '/v1/balance/channels', 0)
      expectLndRequestCalled(vi.mocked(lndRequest), '/v1/balance/blockchain', 1)
    })

    it('should not return error when only blockchain API fails', async () => {
      mockLndChannelBalanceSuccess(vi.mocked(lndRequest))
      mockLndBlockchainBalanceError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).not.toHaveProperty('error')
      expect(data.success).toBe(true)
    })
  })

  describe('Configuration Errors', () => {
    it('should return 500 when LND_REST_URL is missing', async () => {
      setupMissingLndUrl()
      mockLndConfigurationError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toBe('Lightning configuration missing')
    })

    it('should return 500 when LND_ADMIN_MACAROON is missing', async () => {
      setupMissingLndMacaroon()
      mockLndConfigurationError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toBe('Lightning configuration missing')
    })

    it('should return 500 when both credentials are missing', async () => {
      clearLightningEnvironment()
      mockLndConfigurationError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
    })
  })

  describe('Network and Communication Errors', () => {
    it('should handle network timeout errors', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'Network timeout after 30000ms',
      })

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toContain('Network timeout')
    })

    it('should handle connection refused errors', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'ECONNREFUSED',
      })

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toContain('ECONNREFUSED')
    })

    it('should handle DNS resolution failures', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'Failed to communicate with Lightning node',
        details: 'ENOTFOUND: getaddrinfo ENOTFOUND lnd-node.invalid',
      })

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
    })
  })

  describe('Response Format Errors', () => {
    it('should handle malformed JSON responses from LND', async () => {
      mockLndMalformedResponse(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toContain('Invalid response format')
    })

    it('should handle non-JSON responses', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'Invalid response format: text/html',
        details: 'Status: 503, Body: Service Unavailable...',
      })

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expectErrorResponse(response, data, 'Failed to get node balance', 500)
      expect(data.details).toContain('text/html')
    })

    it('should handle missing balance fields in response', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {}, // Missing balance and pending_open_balance
        })
        .mockResolvedValueOnce({
          success: true,
          data: {}, // Missing confirmed_balance
        })

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balances.channel_balance).toBe(0)
      expect(data.balances.pending_balance).toBe(0)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle string values that cannot be parsed as integers', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: 'invalid',
            pending_open_balance: 'not-a-number',
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            confirmed_balance: 'NaN',
          },
        })

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // parseInt on invalid strings returns NaN, which becomes null in JSON
      expect(Number.isNaN(data.balances.channel_balance) || data.balances.channel_balance === null).toBe(true)
      expect(Number.isNaN(data.balances.pending_balance) || data.balances.pending_balance === null).toBe(true)
      expect(Number.isNaN(data.balances.onchain_balance) || data.balances.onchain_balance === null).toBe(true)
    })

    it('should handle negative balance values', async () => {
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        '-1000',
        '-50',
        '-200'
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balances.channel_balance).toBe(-1000)
      expect(data.balances.pending_balance).toBe(-50)
      expect(data.balances.onchain_balance).toBe(-200)
      expect(data.balances.total_balance).toBe(-1250)
    })

    it('should handle floating point balance values', async () => {
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        '1000.5',
        '50.75',
        '200.25'
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // parseInt truncates decimals
      expect(data.balances.channel_balance).toBe(1000)
      expect(data.balances.pending_balance).toBe(50)
      expect(data.balances.onchain_balance).toBe(200)
    })

    it('should handle very large balance values near JavaScript MAX_SAFE_INTEGER', async () => {
      const maxSafe = Number.MAX_SAFE_INTEGER.toString()
      mockLndFullBalanceSuccess(
        vi.mocked(lndRequest),
        maxSafe,
        '0',
        '0'
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balances.channel_balance).toBe(Number.MAX_SAFE_INTEGER)
      expect(data.balances.total_balance).toBe(Number.MAX_SAFE_INTEGER)
    })
  })

  describe('Response Structure Validation', () => {
    it('should return response with success field set to true', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', true)
    })

    it('should return response with balances object containing all required fields', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('balances')
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')
    })

    it('should not include error field in successful response', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).not.toHaveProperty('error')
    })

    it('should include error and details fields in error response', async () => {
      mockLndChannelBalanceError(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('details')
      expect(data).not.toHaveProperty('success')
      expect(data).not.toHaveProperty('balances')
    })
  })

  describe('Unexpected Errors', () => {
    it('should return 500 with generic error message on unexpected exceptions', async () => {
      vi.mocked(lndRequest).mockRejectedValue(
        new Error('Unexpected error occurred')
      )

      const request = createNodeBalanceRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Internal server error',
      })
    })

    it('should log unexpected errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error')
      const testError = new Error('Test unexpected error')
      vi.mocked(lndRequest).mockRejectedValue(testError)

      const request = createNodeBalanceRequest()
      await GET(request)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Node balance API error:',
        testError
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Authorization and Security', () => {
    // NOTE: This test documents current behavior where NO authentication exists
    // This is a SECURITY VULNERABILITY that should be fixed in a separate PR
    // The endpoint currently allows unauthenticated access to sensitive financial data
    it('should allow unauthenticated requests (SECURITY GAP - NO AUTH CURRENTLY)', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      // Create request without any authorization headers
      const request = createNodeBalanceRequest()

      const response = await GET(request)
      const data = await response.json()

      // Currently returns 200 because NO auth checks exist
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances).toBeDefined()
    })

    // TODO: Add test for admin authorization when it's implemented
    // it('should return 401 when admin authorization is missing', async () => { ... })
    // TODO: Add test for CRON_SECRET verification when it's implemented
    // it('should verify CRON_SECRET for scheduled access', async () => { ... })
  })

  describe('Performance and Reliability', () => {
    it('should complete successfully within reasonable time', async () => {
      mockLndFullBalanceSuccess(vi.mocked(lndRequest))

      const request = createNodeBalanceRequest()
      const startTime = Date.now()
      
      await GET(request)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('should handle multiple concurrent requests correctly', async () => {
      // Mock successful responses for multiple calls
      vi.mocked(lndRequest).mockImplementation((endpoint) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: {
              balance: '1000000',
              pending_open_balance: '50000',
            },
          })
        } else if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: {
              confirmed_balance: '200000',
            },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const requests = Array.from({ length: 5 }, () => createNodeBalanceRequest())
      const responses = await Promise.all(requests.map(req => GET(req)))
      const dataArray = await Promise.all(responses.map(res => res.json()))

      // All requests should succeed with same balance data
      dataArray.forEach(data => {
        expect(data.success).toBe(true)
        expect(data.balances.total_balance).toBe(1250000)
      })
    })
  })
})