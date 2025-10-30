import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the lndRequest function from lib/lightning
vi.mock('@/lib/lightning', () => ({
  lndRequest: vi.fn(),
}))

import { GET } from '@/app/api/admin/node-balance/route'
import { lndRequest } from '@/lib/lightning'
import {
  createAuthorizedRequest,
  mockSuccessfulLndResponse,
  mockChannelBalanceFailure,
  mockBlockchainBalanceFailure,
} from '@/tests/helpers/node-balance-test-helpers'

describe('Node Balance Admin API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set default environment variables
    process.env.LND_REST_URL = 'https://test-lnd-node.example.com'
    process.env.LND_ADMIN_MACAROON = 'test-macaroon-hex'
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  describe('Authorization Enforcement', () => {
    it('should reject requests without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
      expect(vi.mocked(lndRequest)).not.toHaveBeenCalled()
    })

    it('should reject requests with invalid CRON_SECRET', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
      expect(vi.mocked(lndRequest)).not.toHaveBeenCalled()
    })

    it('should accept requests with valid CRON_SECRET', async () => {
      // Mock successful LND responses
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000000', pending_open_balance: '500000' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const request = new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(vi.mocked(lndRequest)).toHaveBeenCalledTimes(2)
    })

    it('should allow requests when CRON_SECRET is not configured', async () => {
      // Remove CRON_SECRET from environment
      delete process.env.CRON_SECRET

      // Mock successful LND responses
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000000', pending_open_balance: '500000' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const request = new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Accurate Balance Retrieval and Aggregation', () => {
    const createAuthorizedRequest = () => {
      return new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })
    }

    it('should retrieve and aggregate balances from LND APIs', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000000', pending_open_balance: '500000' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances).toBeDefined()
      expect(data.balances.channel_balance).toBe(1000000)
      expect(data.balances.pending_balance).toBe(500000)
      expect(data.balances.onchain_balance).toBe(2000000)
      expect(data.balances.total_balance).toBe(3500000)
      
      // Verify aggregation formula
      expect(data.balances.total_balance).toBe(
        data.balances.channel_balance + 
        data.balances.pending_balance + 
        data.balances.onchain_balance
      )
    })

    it('should call both LND API endpoints', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000', pending_open_balance: '500' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      await GET(createAuthorizedRequest())

      expect(vi.mocked(lndRequest)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(lndRequest)).toHaveBeenCalledWith('/v1/balance/channels')
      expect(vi.mocked(lndRequest)).toHaveBeenCalledWith('/v1/balance/blockchain')
    })

    it('should handle string balance values correctly', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '50000000', pending_open_balance: '10000000' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '25000000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(data.balances.channel_balance).toBe(50000000)
      expect(data.balances.pending_balance).toBe(10000000)
      expect(data.balances.onchain_balance).toBe(25000000)
      expect(data.balances.total_balance).toBe(85000000)
      
      // Verify all are numbers, not strings
      expect(typeof data.balances.channel_balance).toBe('number')
      expect(typeof data.balances.pending_balance).toBe('number')
      expect(typeof data.balances.onchain_balance).toBe('number')
      expect(typeof data.balances.total_balance).toBe('number')
    })

    it('should handle zero balances correctly', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '0', pending_open_balance: '0' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '0' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(0)
      expect(data.balances.pending_balance).toBe(0)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(0)
    })

    it('should handle missing balance fields gracefully', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: {}, // Missing balance fields
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: {}, // Missing confirmed_balance
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(0)
      expect(data.balances.pending_balance).toBe(0)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(0)
    })

    it('should handle large balance values', async () => {
      // Test with 21 million BTC in satoshis (max Bitcoin supply)
      const maxSupplySats = '2100000000000000'
      
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: maxSupplySats, pending_open_balance: '0' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '0' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(2100000000000000)
      expect(data.balances.total_balance).toBe(2100000000000000)
    })
  })

  describe('Response Schema Validation', () => {
    const createAuthorizedRequest = () => {
      return new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })
    }

    it('should return correct response structure on success', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000', pending_open_balance: '500' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      // Verify top-level structure
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('balances')
      expect(typeof data.success).toBe('boolean')
      expect(typeof data.balances).toBe('object')

      // Verify balances object structure
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')

      // Verify all balance values are numbers
      expect(typeof data.balances.channel_balance).toBe('number')
      expect(typeof data.balances.pending_balance).toBe('number')
      expect(typeof data.balances.onchain_balance).toBe('number')
      expect(typeof data.balances.total_balance).toBe('number')
    })

    it('should return error structure on failure', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'Connection refused',
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error')
      expect(typeof data.error).toBe('string')
      expect(data.error).toBe('Failed to get node balance')
    })
  })

  describe('LND API Error Handling', () => {
    const createAuthorizedRequest = () => {
      return new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })
    }

    it('should handle channel balance API failure', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: false,
            error: 'Connection timeout',
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
      expect(data.details).toBe('Connection timeout')
    })

    it('should handle blockchain balance API failure', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000', pending_open_balance: '500' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: false,
            error: 'Node not synced',
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // Should default to 0 for failed blockchain call
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.channel_balance).toBe(1000)
    })

    it('should handle network errors from lndRequest', async () => {
      vi.mocked(lndRequest).mockRejectedValue(new Error('Network error'))

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should handle both LND APIs failing', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'LND node unreachable',
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
    })

    it('should handle malformed LND response data', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: 'invalid-number', pending_open_balance: 'also-invalid' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: 'not-a-number' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // parseInt() of invalid strings results in NaN, which serializes to null in JSON
      expect(data.balances.channel_balance).toBeNull()
      expect(data.balances.pending_balance).toBeNull()
      expect(data.balances.onchain_balance).toBeNull()
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    const createAuthorizedRequest = () => {
      return new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })
    }

    it('should handle partial LND response success', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000000', pending_open_balance: '500000' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: false,
            error: 'Blockchain sync in progress',
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(1000000)
      expect(data.balances.pending_balance).toBe(500000)
      expect(data.balances.onchain_balance).toBe(0) // Should default to 0 on failure
      expect(data.balances.total_balance).toBe(1500000)
    })

    it('should handle null balance values', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: null, pending_open_balance: null },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: null },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // null || "0" returns "0", so parseInt returns 0
      expect(data.balances.channel_balance).toBe(0)
      expect(data.balances.pending_balance).toBe(0)
      expect(data.balances.onchain_balance).toBe(0)
    })

    it('should handle negative balance values', async () => {
      // While unlikely in real scenarios, test robustness
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '-1000', pending_open_balance: '-500' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '-2000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(-1000)
      expect(data.balances.pending_balance).toBe(-500)
      expect(data.balances.onchain_balance).toBe(-2000)
      expect(data.balances.total_balance).toBe(-3500)
    })

    it('should handle empty data object from LND', async () => {
      vi.mocked(lndRequest).mockResolvedValue({
        success: true,
        data: null,
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      // Should fail due to accessing properties on null
      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should handle mixed valid and invalid balance values', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000000', pending_open_balance: 'invalid' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response = await GET(createAuthorizedRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balances.channel_balance).toBe(1000000)
      expect(data.balances.pending_balance).toBeNull() // Invalid string becomes NaN, serializes to null
      expect(data.balances.onchain_balance).toBe(2000000)
    })
  })

  describe('Environment Variable Configuration', () => {
    it('should handle missing LND_REST_URL', async () => {
      delete process.env.LND_REST_URL

      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'Lightning configuration missing',
      })

      const request = new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
    })

    it('should handle missing LND_ADMIN_MACAROON', async () => {
      delete process.env.LND_ADMIN_MACAROON

      vi.mocked(lndRequest).mockResolvedValue({
        success: false,
        error: 'Lightning configuration missing',
      })

      const request = new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
    })
  })

  describe('Data Consistency and Integrity', () => {
    const createAuthorizedRequest = () => {
      return new NextRequest('http://localhost:3000/api/admin/node-balance', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })
    }

    it('should maintain consistent total_balance calculation', async () => {
      const testCases = [
        { channel: '1000000', pending: '500000', onchain: '2000000', expected: 3500000 },
        { channel: '0', pending: '0', onchain: '1000', expected: 1000 },
        { channel: '5000', pending: '3000', onchain: '2000', expected: 10000 },
        { channel: '100000000', pending: '0', onchain: '0', expected: 100000000 },
      ]

      for (const testCase of testCases) {
        vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
          if (endpoint === '/v1/balance/channels') {
            return Promise.resolve({
              success: true,
              data: { 
                balance: testCase.channel, 
                pending_open_balance: testCase.pending 
              },
            })
          }
          if (endpoint === '/v1/balance/blockchain') {
            return Promise.resolve({
              success: true,
              data: { confirmed_balance: testCase.onchain },
            })
          }
          return Promise.resolve({ success: false, error: 'Unknown endpoint' })
        })

        const response = await GET(createAuthorizedRequest())
        const data = await response.json()

        expect(data.balances.total_balance).toBe(testCase.expected)
        expect(data.balances.total_balance).toBe(
          data.balances.channel_balance + 
          data.balances.pending_balance + 
          data.balances.onchain_balance
        )
      }
    })

    it('should return consistent response structure across multiple calls', async () => {
      vi.mocked(lndRequest).mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: { balance: '1000', pending_open_balance: '500' },
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: { confirmed_balance: '2000' },
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      const response1 = await GET(createAuthorizedRequest())
      const data1 = await response1.json()

      const response2 = await GET(createAuthorizedRequest())
      const data2 = await response2.json()

      // Both responses should have identical structure
      expect(Object.keys(data1).sort()).toEqual(Object.keys(data2).sort())
      expect(Object.keys(data1.balances).sort()).toEqual(Object.keys(data2.balances).sort())
      
      // Values should be identical
      expect(data1).toEqual(data2)
    })
  })
})