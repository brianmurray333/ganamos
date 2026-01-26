import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/bitcoin-price/route'
import {
  createMockRequest,
  createMockPriceData,
  mockRpcSuccess,
  mockRpcEmpty,
  mockRpcNull,
  mockRpcError,
  mockRpcRejection,
  mockFallbackQuery,
  createTimestampMinutesAgo,
  expectRpcCalledWithUSD,
  expectFallbackQueryCalled,
  expectCorsHeaders,
  expectNoCorsHeaders,
} from './helpers/bitcoin-price-mocks'
import { NextRequest } from 'next/server'

// @/lib/supabase mock provided by tests/setup.ts
// Import the global mock client to customize behavior
import { mockSupabaseClient } from '@/tests/setup'

describe('Bitcoin Price API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment to production by default
    process.env.NODE_ENV = 'production'
  })

  describe('Accurate Data Retrieval', () => {
    it('should return Bitcoin price data via RPC call', async () => {
      const mockPriceData = createMockPriceData()
      mockRpcSuccess(mockSupabaseClient, mockPriceData)

      const request = new NextRequest('http://localhost:3000/api/bitcoin-price')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expectRpcCalledWithUSD(mockSupabaseClient)
      expect(data).toMatchObject({
        price: 50000,
        currency: 'USD',
        source: 'DIA',
        ageMinutes: 15,
        isStale: false,
      })
    })

    it('should use fallback query when RPC call fails', async () => {
      const now = new Date()
      const createdAt = new Date(now.getTime() - 20 * 60000) // 20 minutes ago
      const mockPriceData = {
        price: '48000.50',
        currency: 'USD',
        source: 'DIA',
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      }

      // RPC fails
      mockSupabaseClient.rpc.mockRejectedValue(new Error('RPC function not found'))

      // Fallback query succeeds
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockPriceData,
          error: null,
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('bitcoin_prices')
      expect(mockQueryBuilder.select).toHaveBeenCalledWith('*')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('currency', 'USD')
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1)
      expect(data.price).toBe(48000.5)
      expect(data.currency).toBe('USD')
      expect(data.ageMinutes).toBeGreaterThanOrEqual(19)
      expect(data.ageMinutes).toBeLessThanOrEqual(21)
    })

    it('should return 503 when no price data is available', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.error).toBe('No price data available. Price update pending.')
    })

    it('should return 503 when database returns null', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.error).toBe('No price data available. Price update pending.')
    })
  })

  describe('Correct Data Transformation', () => {
    it('should parse decimal price string to float', async () => {
      const mockPriceData = {
        price: '50000.123456', // Decimal string with high precision
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 10,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.price).toBe(50000.123456)
      expect(typeof data.price).toBe('number')
    })

    it('should calculate age_minutes correctly in fallback path', async () => {
      const now = new Date()
      const createdAt = new Date(now.getTime() - 45 * 60000) // 45 minutes ago

      mockSupabaseClient.rpc.mockRejectedValue(new Error('RPC failed'))

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            price: '50000.00',
            currency: 'USD',
            source: 'DIA',
            created_at: createdAt.toISOString(),
          },
          error: null,
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Age should be approximately 45 minutes (allow 1 minute variance for test execution)
      expect(data.ageMinutes).toBeGreaterThanOrEqual(44)
      expect(data.ageMinutes).toBeLessThanOrEqual(46)
    })

    it('should set isStale to false for fresh data (< 60 minutes)', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 30, // Fresh data
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.isStale).toBe(false)
      expect(data.ageMinutes).toBe(30)
    })

    it('should set isStale to true for old data (> 60 minutes)', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date(Date.now() - 90 * 60000).toISOString(), // 90 minutes ago
        age_minutes: 90,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.isStale).toBe(true)
      expect(data.ageMinutes).toBe(90)
    })

    it('should set isStale boundary correctly at exactly 60 minutes', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date(Date.now() - 60 * 60000).toISOString(),
        age_minutes: 60,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.isStale).toBe(false) // Should be false at exactly 60 (> 60 is the threshold)
      expect(data.ageMinutes).toBe(60)
    })

    it('should handle zero age_minutes gracefully', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 0,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.ageMinutes).toBe(0)
      expect(data.isStale).toBe(false)
    })
  })

  describe('Data Propagation to Consumer Pages', () => {
    it('should return numeric price compatible with calculateUsdValue formula', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Verify price can be used in calculateUsdValue formula: (sats / 100000000) * bitcoinPrice
      const testSats = 100000000 // 1 BTC
      const expectedUsd = (testSats / 100000000) * data.price
      expect(expectedUsd).toBe(50000)
      expect(typeof data.price).toBe('number')
    })

    it('should return complete response structure expected by consumers', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: '2024-01-01T12:00:00Z',
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Verify all fields expected by consumer pages
      expect(data).toHaveProperty('price')
      expect(data).toHaveProperty('currency')
      expect(data).toHaveProperty('source')
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('ageMinutes')
      expect(data).toHaveProperty('isStale')

      // Verify types
      expect(typeof data.price).toBe('number')
      expect(typeof data.currency).toBe('string')
      expect(typeof data.source).toBe('string')
      expect(typeof data.timestamp).toBe('string')
      expect(typeof data.ageMinutes).toBe('number')
      expect(typeof data.isStale).toBe('boolean')
    })

    it('should handle high-value prices correctly for wallet calculations', async () => {
      const mockPriceData = {
        price: '95000.50', // High BTC price
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 10,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      // Test with profile page's special formatting (rounds down values >= $100)
      const testSats = 200000000 // 2 BTC
      const usdValue = (testSats / 100000000) * data.price
      expect(usdValue).toBe(190001)
      expect(Math.floor(usdValue)).toBe(190001)
    })
  })

  describe('CORS Headers Configuration', () => {
    it('should include CORS headers in development mode', async () => {
      process.env.NODE_ENV = 'development'

      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should not include CORS headers in production mode', async () => {
      process.env.NODE_ENV = 'production'

      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
    })

    it('should include CORS headers on error responses in development', async () => {
      process.env.NODE_ENV = 'development'

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(500)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should return 500 on database error', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Connection timeout' },
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch current price')
      expect(data.details).toBe('Failed to fetch price from database')
    })

    it('should handle both RPC and fallback query failures', async () => {
      mockSupabaseClient.rpc.mockRejectedValue(new Error('RPC failed'))

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Query failed' },
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch current price')
    })

    it('should include error stack trace in development mode', async () => {
      process.env.NODE_ENV = 'development'

      mockSupabaseClient.rpc.mockRejectedValue(new Error('Test error'))

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Query failed' },
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('stack')
      expect(typeof data.stack).toBe('string')
    })

    it('should not include error stack trace in production mode', async () => {
      process.env.NODE_ENV = 'production'

      mockSupabaseClient.rpc.mockRejectedValue(new Error('Test error'))

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Query failed' },
        }),
      }
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.stack).toBeUndefined()
    })

    it('should handle missing age_minutes field in RPC response', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        // age_minutes field missing
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ageMinutes).toBe(0) // Should default to 0
      expect(data.isStale).toBe(false)
    })
  })

  describe('Data Consistency Validation', () => {
    it('should maintain decimal precision for financial calculations', async () => {
      const mockPriceData = {
        price: '50123.456789', // High-precision decimal
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 10,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.price).toBe(50123.456789)
      
      // Verify precision is maintained in USD calculations
      const sats = 100000000 // 1 BTC
      const usdValue = (sats / 100000000) * data.price
      expect(usdValue).toBe(50123.456789)
    })

    it('should handle edge case of zero-value price', async () => {
      const mockPriceData = {
        price: '0.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 5,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.price).toBe(0)
      expect(typeof data.price).toBe('number')
    })

    it('should preserve timestamp in ISO 8601 format', async () => {
      const isoTimestamp = '2024-01-15T10:30:00.123Z'
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: isoTimestamp,
        age_minutes: 10,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.timestamp).toBe(isoTimestamp)
      // Verify it's a valid ISO date
      expect(new Date(data.timestamp).toISOString()).toBe(isoTimestamp)
    })

    it('should consistently return USD currency', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 10,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.currency).toBe('USD')
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_latest_bitcoin_price', {
        p_currency: 'USD',
      })
    })

    it('should include source attribution in response', async () => {
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 10,
      }

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [mockPriceData],
        error: null,
      })

      const request = createMockRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.source).toBe('DIA')
      expect(typeof data.source).toBe('string')
    })
  })
})