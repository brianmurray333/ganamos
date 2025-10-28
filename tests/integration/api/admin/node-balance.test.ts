import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { GET } from '@/app/api/admin/node-balance/route'
import { NextRequest } from 'next/server'
import * as lightning from '@/lib/lightning'

// Mock the lightning module
vi.mock('@/lib/lightning', () => ({
  lndRequest: vi.fn()
}))

describe('GET /api/admin/node-balance', () => {
  const mockLndRequest = vi.mocked(lightning.lndRequest)
  
  // Store original environment variables
  const originalEnv = process.env
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
    
    // Set up default environment variables
    process.env = {
      ...originalEnv,
      CRON_SECRET: 'test-secret-123',
      LND_REST_URL: 'https://test-lnd.example.com',
      LND_ADMIN_MACAROON: 'test-macaroon'
    }
  })
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  const createMockRequest = (authToken?: string): NextRequest => {
    const headers = new Headers()
    if (authToken !== undefined) {
      headers.set('authorization', authToken)
    }
    
    return new NextRequest('http://localhost:3457/api/admin/node-balance', {
      method: 'GET',
      headers
    })
  }

  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should return 401 when authorization token is invalid', async () => {
      const request = createMockRequest('Bearer invalid-token')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should return 401 when authorization header format is incorrect', async () => {
      const request = createMockRequest('test-secret-123') // Missing "Bearer" prefix
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should allow request when CRON_SECRET is not set (development mode)', async () => {
      delete process.env.CRON_SECRET
      
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '100000', pending_open_balance: '0' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '50000' }
      })
      
      const request = createMockRequest() // No auth header
      const response = await GET(request)
      
      expect(response.status).toBe(200)
    })

    it('should proceed to balance retrieval with valid authorization', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '100000', pending_open_balance: '0' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '50000' }
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      expect(mockLndRequest).toHaveBeenCalledTimes(2)
    })
  })

  describe('Balance Retrieval - Success Path', () => {
    beforeEach(() => {
      // Mock successful LND responses for all success tests
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '250000', pending_open_balance: '50000' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '100000' }
      })
    })

    it('should return 200 with aggregated balance data when all APIs succeed', async () => {
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        balances: {
          channel_balance: 250000,
          pending_balance: 50000,
          onchain_balance: 100000,
          total_balance: 400000
        }
      })
    })

    it('should correctly aggregate channel + pending + onchain balances', async () => {
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      const { channel_balance, pending_balance, onchain_balance, total_balance } = data.balances
      expect(total_balance).toBe(channel_balance + pending_balance + onchain_balance)
      expect(total_balance).toBe(400000)
    })

    it('should call LND APIs in correct sequence (channels then blockchain)', async () => {
      const request = createMockRequest('Bearer test-secret-123')
      await GET(request)
      
      expect(mockLndRequest).toHaveBeenCalledTimes(2)
      expect(mockLndRequest).toHaveBeenNthCalledWith(1, '/v1/balance/channels')
      expect(mockLndRequest).toHaveBeenNthCalledWith(2, '/v1/balance/blockchain')
    })

    it('should handle string balance values from LND API', async () => {
      // LND returns string values that need to be parsed
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      // Verify all balances are numbers, not strings
      expect(typeof data.balances.channel_balance).toBe('number')
      expect(typeof data.balances.pending_balance).toBe('number')
      expect(typeof data.balances.onchain_balance).toBe('number')
      expect(typeof data.balances.total_balance).toBe('number')
    })
  })

  describe('Balance Retrieval - Zero Balances', () => {
    it('should handle zero balances correctly', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '0', pending_open_balance: '0' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '0' }
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.balances.total_balance).toBe(0)
    })

    it('should handle missing balance fields (default to 0)', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: {} // Empty data object
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: {}
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.balances.channel_balance).toBe(0)
      expect(data.balances.pending_balance).toBe(0)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(0)
    })
  })

  describe('Error Handling - Channel Balance API (Hard Failure)', () => {
    it('should return 500 when channel balance API fails', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: false,
        error: 'LND node connection failed'
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to get node balance',
        details: 'LND node connection failed'
      })
    })

    it('should not call blockchain API when channel balance fails', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: false,
        error: 'Connection timeout'
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      await GET(request)
      
      // Should only call channel balance API, not blockchain
      expect(mockLndRequest).toHaveBeenCalledTimes(1)
      expect(mockLndRequest).toHaveBeenCalledWith('/v1/balance/channels')
    })

    it('should handle channel balance API network errors', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: false,
        error: 'Network error: ECONNREFUSED'
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
      expect(data.details).toContain('Network error')
    })
  })

  describe('Error Handling - Blockchain Balance API (Soft Failure)', () => {
    beforeEach(() => {
      // Channel balance succeeds
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '200000', pending_open_balance: '25000' }
      })
    })

    it('should continue with onchain_balance=0 when blockchain API fails', async () => {
      // Blockchain balance fails
      mockLndRequest.mockResolvedValueOnce({
        success: false,
        error: 'Blockchain API timeout'
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(225000) // Only channel + pending
    })

    it('should still aggregate correctly when blockchain balance is unavailable', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: false,
        error: 'Service unavailable'
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      const { channel_balance, pending_balance, onchain_balance, total_balance } = data.balances
      expect(onchain_balance).toBe(0)
      expect(total_balance).toBe(channel_balance + pending_balance + onchain_balance)
    })
  })

  describe('Error Handling - Unexpected Exceptions', () => {
    it('should return 500 for unexpected errors during processing', async () => {
      mockLndRequest.mockRejectedValueOnce(new Error('Unexpected internal error'))
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Internal server error' })
    })

    it('should handle malformed data parsing errors', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: 'not-a-number', pending_open_balance: 'invalid' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: 'invalid' }
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      // parseInt returns NaN for invalid values, NaN arithmetic results in NaN,
      // and JSON.stringify converts NaN to null
      expect(response.status).toBe(200)
      expect(data.balances.total_balance).toBe(null)
    })
  })

  describe('Environment Configuration', () => {
    it('should handle missing LND configuration (tested via lndRequest mock)', async () => {
      // Simulate lndRequest returning config error
      mockLndRequest.mockResolvedValueOnce({
        success: false,
        error: 'Lightning configuration missing'
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data.details).toBe('Lightning configuration missing')
    })
  })

  describe('Response Format Validation', () => {
    it('should return correct response structure with all required fields', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '100000', pending_open_balance: '20000' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '30000' }
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      // Validate response structure
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('balances')
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')
    })

    it('should return Content-Type: application/json header', async () => {
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { balance: '100000', pending_open_balance: '0' }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '0' }
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      
      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })

  describe('Large Balance Values', () => {
    it('should handle large satoshi amounts correctly', async () => {
      // Test with large values (e.g., multiple BTC in satoshis)
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { 
          balance: '100000000',        // 1 BTC in sats
          pending_open_balance: '50000000'  // 0.5 BTC
        }
      })
      mockLndRequest.mockResolvedValueOnce({
        success: true,
        data: { confirmed_balance: '25000000' } // 0.25 BTC
      })
      
      const request = createMockRequest('Bearer test-secret-123')
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.balances.total_balance).toBe(175000000) // 1.75 BTC
      expect(data.balances.channel_balance).toBe(100000000)
      expect(data.balances.pending_balance).toBe(50000000)
      expect(data.balances.onchain_balance).toBe(25000000)
    })
  })
})