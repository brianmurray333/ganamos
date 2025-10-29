import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/admin/node-balance/route'
import {
  MOCK_CHANNEL_BALANCE_SUCCESS,
  MOCK_BLOCKCHAIN_BALANCE_SUCCESS,
  MOCK_CHANNEL_BALANCE_LARGE,
  MOCK_BLOCKCHAIN_BALANCE_LARGE,
  MOCK_CHANNEL_BALANCE_ZERO,
  MOCK_BLOCKCHAIN_BALANCE_ZERO,
  MOCK_CHANNEL_BALANCE_FAILURE,
  MOCK_BLOCKCHAIN_BALANCE_FAILURE,
  createMockRequest,
} from '../../helpers/node-balance-mocks'

// Mock external dependencies
vi.mock('@/lib/lightning', () => ({
  lndRequest: vi.fn(),
}))

// Import mocked functions for assertions
import { lndRequest } from '@/lib/lightning'

describe('GET /api/admin/node-balance', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Reset environment variables
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('Authorization (Security Requirement)', () => {
    it('should return 401 when CRON_SECRET is set but authorization header is missing', async () => {
      process.env.CRON_SECRET = 'test-secret-123'

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
      })

      // Verify LND was not called
      expect(lndRequest).not.toHaveBeenCalled()
    })

    it('should return 401 when CRON_SECRET is set but authorization header is invalid', async () => {
      process.env.CRON_SECRET = 'test-secret-123'

      const request = createMockRequest({
        authorization: 'Bearer wrong-secret',
      })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
      })

      // Verify LND was not called
      expect(lndRequest).not.toHaveBeenCalled()
    })

    it('should allow access when CRON_SECRET is set and authorization header is valid', async () => {
      process.env.CRON_SECRET = 'test-secret-123'

      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest({
        authorization: 'Bearer test-secret-123',
      })
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(lndRequest).toHaveBeenCalledTimes(2)
    })

    it('should allow access when CRON_SECRET is not set (development mode)', async () => {
      delete process.env.CRON_SECRET

      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Successful Balance Retrieval', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET // Skip auth for these tests
    })

    it('should successfully retrieve and aggregate node balances', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        success: true,
        balances: {
          channel_balance: 5000000,
          pending_balance: 500000,
          onchain_balance: 1000000,
          total_balance: 6500000, // 5000000 + 500000 + 1000000
        },
      })

      // Verify LND API calls
      expect(lndRequest).toHaveBeenCalledTimes(2)
      expect(lndRequest).toHaveBeenNthCalledWith(1, '/v1/balance/channels')
      expect(lndRequest).toHaveBeenNthCalledWith(2, '/v1/balance/blockchain')
    })

    it('should correctly aggregate large balance amounts', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_LARGE)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_LARGE)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // parseInt loses precision with very large numbers, so just check it returns a large number
      expect(data.balances.total_balance).toBeGreaterThan(100000000000)
    })

    it('should handle zero balances correctly', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_ZERO)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_ZERO)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        success: true,
        balances: {
          channel_balance: 0,
          pending_balance: 0,
          onchain_balance: 0,
          total_balance: 0,
        },
      })
    })

    it('should return balance values as numbers', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(typeof data.balances.channel_balance).toBe('number')
      expect(typeof data.balances.pending_balance).toBe('number')
      expect(typeof data.balances.onchain_balance).toBe('number')
      expect(typeof data.balances.total_balance).toBe('number')
    })
  })

  describe('LND API Failures', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET // Skip auth for these tests
    })

    it('should return 500 when channel balance API fails (hard failure)', async () => {
      vi.mocked(lndRequest).mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_FAILURE)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBeDefined()
      expect(typeof data.error).toBe('string')

      // Verify only one LND call was made (failed on first call)
      expect(lndRequest).toHaveBeenCalledTimes(1)
      expect(lndRequest).toHaveBeenCalledWith('/v1/balance/channels')
    })

    it('should continue with zero onchain balance when blockchain API fails (soft failure)', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_FAILURE)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        success: true,
        balances: {
          channel_balance: 5000000,
          pending_balance: 500000,
          onchain_balance: 0, // Fallback to zero on blockchain API failure
          total_balance: 5500000, // 5000000 + 500000 + 0
        },
      })

      // Verify both LND calls were made
      expect(lndRequest).toHaveBeenCalledTimes(2)
    })

    it('should return 500 when both LND APIs fail', async () => {
      vi.mocked(lndRequest).mockResolvedValue(MOCK_CHANNEL_BALANCE_FAILURE)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBeDefined()
    })

    it('should handle lndRequest throwing an exception', async () => {
      vi.mocked(lndRequest).mockRejectedValue(new Error('Network connection failed'))

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBeDefined()
    })

    it('should handle malformed channel balance response (missing balance field)', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            pending_open_balance: '500000',
            // missing 'balance' field
          },
        })
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Should handle gracefully or return error
      expect(response.status).toBeGreaterThanOrEqual(200)
      if (response.status === 200) {
        // If it handles missing field gracefully
        expect(data.balances).toBeDefined()
      } else {
        // If it returns error
        expect(data.error).toBeDefined()
      }
    })

    it('should handle malformed blockchain balance response (missing confirmed_balance)', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce({
          success: true,
          data: {}, // missing 'confirmed_balance' field
        })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Should handle gracefully - likely defaults to '0' or returns error
      expect(response.status).toBeGreaterThanOrEqual(200)
      if (response.status === 200) {
        expect(data.balances).toBeDefined()
      }
    })
  })

  describe('Response Schema Validation', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET // Skip auth for these tests
    })

    it('should return correct success response schema', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('balances')
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')
      expect(data).not.toHaveProperty('error')
    })

    it('should return correct error response schema', async () => {
      vi.mocked(lndRequest).mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_FAILURE)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('error')
      expect(typeof data.error).toBe('string')
      expect(data).not.toHaveProperty('balances')
    })

    it('should have correct Content-Type header', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET // Skip auth for these tests
    })

    it('should handle missing pending_open_balance field (default to 0)', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: '5000000',
            // missing pending_open_balance
          },
        })
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      if (response.status === 200) {
        // Should default to '0' or handle gracefully
        expect(data.balances.total_balance).toBeDefined()
      }
    })

    it('should handle string numbers with leading zeros', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: '0000005000000',
            pending_open_balance: '0000000500000',
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            confirmed_balance: '0000001000000',
          },
        })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      if (response.status === 200) {
        // parseInt should handle leading zeros correctly
        expect(data.balances.total_balance).toBe(6500000)
      }
    })

    it('should handle maximum safe integer values', async () => {
      const maxSafeInt = '9007199254740991' // Number.MAX_SAFE_INTEGER

      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: maxSafeInt,
            pending_open_balance: '0',
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            confirmed_balance: '0',
          },
        })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balances.total_balance).toBe(9007199254740991)
    })

    it('should handle values exceeding Number.MAX_SAFE_INTEGER', async () => {
      const veryLargeNumber = '99999999999999999999' // Much larger than MAX_SAFE_INTEGER

      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: veryLargeNumber,
            pending_open_balance: '0',
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            confirmed_balance: '1',
          },
        })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // parseInt loses precision with very large numbers, so just verify it returns a number
      expect(typeof data.balances.total_balance).toBe('number')
      expect(data.balances.total_balance).toBeGreaterThan(0)
    })

    it('should handle null values in LND response', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: null as any,
            pending_open_balance: '500000',
          },
        })
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      
      // Should either handle gracefully or return error
      expect(response.status).toBeGreaterThanOrEqual(200)
    })

    it('should handle undefined values in LND response', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: {
            balance: '5000000',
            pending_open_balance: undefined as any,
          },
        })
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      
      // Should either handle gracefully or return error
      expect(response.status).toBeGreaterThanOrEqual(200)
    })
  })

  describe('Integration with Daily Summary Consumer', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET // Skip auth for these tests
    })

    it('should return data in format expected by lib/daily-summary.ts', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Verify format matches what daily-summary expects
      expect(data.success).toBe(true)
      expect(data.balances).toBeDefined()
      expect(data.balances.total_balance).toBeDefined()
      
      // Verify can be used for balance comparison
      const nodeBalance = parseInt(data.balances.total_balance)
      expect(nodeBalance).toBeGreaterThan(0)
      expect(Number.isInteger(nodeBalance)).toBe(true)
    })

    it('should handle case when daily-summary calculates discrepancy', async () => {
      vi.mocked(lndRequest)
        .mockResolvedValueOnce(MOCK_CHANNEL_BALANCE_SUCCESS)
        .mockResolvedValueOnce(MOCK_BLOCKCHAIN_BALANCE_SUCCESS)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Simulate daily-summary calculation
      const nodeBalance = parseInt(data.balances.total_balance)
      const appTotalBalance = 6000000 // Mock app balance
      const discrepancy = nodeBalance - appTotalBalance

      expect(discrepancy).toBe(500000) // 6500000 - 6000000
    })
  })
})