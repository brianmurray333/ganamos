import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Next.js server components
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server')
  
  // Mock NextResponse class that supports both static methods and constructor
  class MockNextResponse {
    status: number
    headers: Map<string, string>
    _data: any

    constructor(body: any, init?: any) {
      this.status = init?.status || 200
      this.headers = new Map(Object.entries(init?.headers || {}))
      this._data = body
    }

    static json(data: any, init?: any) {
      const response = new MockNextResponse(data, init)
      response._data = data
      return {
        json: async () => data,
        status: response.status,
        headers: response.headers,
      }
    }

    async json() {
      return this._data
    }
  }
  
  return {
    ...actual,
    NextResponse: MockNextResponse,
  }
})

// Mock Supabase client
const mockSupabaseClient = {
  rpc: vi.fn(),
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

// Store original fetch and environment
const originalFetch = global.fetch
const originalEnv = process.env.NODE_ENV

describe('Bitcoin Price API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment to development for CORS tests
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    global.fetch = originalFetch
  })

  describe('GET /api/bitcoin-price - Read Cached Price', () => {
    it('should return valid price data with correct structure', async () => {
      // Arrange
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        price: 50000.0,
        currency: 'USD',
        source: 'DIA',
        ageMinutes: 15,
        isStale: false,
        timestamp: mockPriceData.created_at,
      })
      expect(typeof data.price).toBe('number')
      expect(typeof data.ageMinutes).toBe('number')
      expect(typeof data.isStale).toBe('boolean')
    })

    it('should set isStale flag to true when price is older than 60 minutes', async () => {
      // Arrange
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 minutes ago
        age_minutes: 90,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(data.isStale).toBe(true)
      expect(data.ageMinutes).toBeGreaterThan(60)
    })

    it('should set isStale flag to false when price is fresh (< 60 minutes)', async () => {
      // Arrange
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 30,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(data.isStale).toBe(false)
      expect(data.ageMinutes).toBeLessThanOrEqual(60)
    })

    it('should return 503 when no price data is available', async () => {
      // Arrange
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(503)
      expect(data.error).toBe('No price data available. Price update pending.')
    })

    it('should fallback to direct query when RPC function fails', async () => {
      // Arrange
      const mockPriceData = {
        id: 'test-id',
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Mock RPC failure
      mockSupabaseClient.rpc.mockRejectedValueOnce(new Error('RPC function not found'))

      // Mock successful fallback query
      const mockQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockPriceData,
          error: null,
        }),
      }
      mockSupabaseClient.from.mockReturnValueOnce(mockQueryChain)

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.price).toBe(50000.0)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('bitcoin_prices')
      expect(mockQueryChain.select).toHaveBeenCalledWith('*')
      expect(mockQueryChain.eq).toHaveBeenCalledWith('currency', 'USD')
      expect(mockQueryChain.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockQueryChain.limit).toHaveBeenCalledWith(1)
    })

    it('should correctly calculate age_minutes in fallback query', async () => {
      // Arrange
      const createdTime = new Date(Date.now() - 45 * 60 * 1000) // 45 minutes ago
      const mockPriceData = {
        id: 'test-id',
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: createdTime.toISOString(),
        updated_at: createdTime.toISOString(),
      }

      mockSupabaseClient.rpc.mockRejectedValueOnce(new Error('RPC error'))

      const mockQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockPriceData,
          error: null,
        }),
      }
      mockSupabaseClient.from.mockReturnValueOnce(mockQueryChain)

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.ageMinutes).toBeGreaterThanOrEqual(44)
      expect(data.ageMinutes).toBeLessThanOrEqual(46)
    })

    it('should include CORS headers in development mode', async () => {
      // Arrange
      process.env.NODE_ENV = 'development'
      
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()

      // Assert
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should not include CORS headers in production mode', async () => {
      // Arrange
      process.env.NODE_ENV = 'production'
      
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()

      // Assert
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeUndefined()
    })

    it('should return 500 with error details when database query fails', async () => {
      // Arrange
      const dbError = new Error('Database connection failed')
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: dbError,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch current price')
      expect(data.details).toBeDefined()
    })

    it('should correctly parse decimal price to float', async () => {
      // Arrange
      const mockPriceData = {
        price: '50123.45', // String decimal from database
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(data.price).toBe(50123.45)
      expect(typeof data.price).toBe('number')
      expect(data.price.toFixed(2)).toBe('50123.45')
    })
  })

  describe('OPTIONS /api/bitcoin-price - CORS Preflight', () => {
    it('should return 200 with CORS headers in development mode', async () => {
      // Arrange
      process.env.NODE_ENV = 'development'

      // Act
      const { OPTIONS } = await import('@/app/api/bitcoin-price/route')
      const response = await OPTIONS()

      // Assert
      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should return 204 without CORS headers in production mode', async () => {
      // Arrange
      process.env.NODE_ENV = 'production'

      // Act
      const { OPTIONS } = await import('@/app/api/bitcoin-price/route')
      const response = await OPTIONS()

      // Assert
      expect(response.status).toBe(204)
    })
  })

  describe('Data Integrity Validation', () => {
    it('should handle null age_minutes gracefully', async () => {
      // Arrange
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: null, // Missing age calculation
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.ageMinutes).toBe(0)
      expect(data.isStale).toBe(false)
    })

    it('should preserve price precision for financial calculations', async () => {
      // Arrange - Test with high precision decimal
      const mockPriceData = {
        price: '50123.456789', // High precision
        currency: 'USD',
        source: 'DIA',
        created_at: new Date().toISOString(),
        age_minutes: 15,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.price).toBe(50123.456789)
      
      // Verify satoshi to USD conversion precision
      const sats = 100000000 // 1 BTC in satoshis
      const btcAmount = sats / 100000000
      const usdValue = btcAmount * data.price
      expect(usdValue.toFixed(2)).toBe('50123.46')
    })

    it('should handle edge case of exactly 60 minutes age', async () => {
      // Arrange
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        age_minutes: 60,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(data.ageMinutes).toBe(60)
      expect(data.isStale).toBe(false) // Should be false since threshold is > 60
    })

    it('should handle edge case of 61 minutes age (stale threshold)', async () => {
      // Arrange
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
        age_minutes: 61,
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(data.ageMinutes).toBe(61)
      expect(data.isStale).toBe(true)
    })

    it('should handle very large age values without overflow', async () => {
      // Arrange - Test with price older than 30 days (edge of retention policy)
      const mockPriceData = {
        price: '50000.00',
        currency: 'USD',
        source: 'DIA',
        created_at: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days old
        age_minutes: 29 * 24 * 60, // 41,760 minutes
      }

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [mockPriceData],
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.ageMinutes).toBeGreaterThan(40000)
      expect(data.isStale).toBe(true)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle database returning null data', async () => {
      // Arrange
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(503)
      expect(data.error).toContain('No price data available')
    })

    it('should handle RPC failure and fallback query returning no data', async () => {
      // Arrange
      mockSupabaseClient.rpc.mockRejectedValueOnce(new Error('RPC error'))

      const mockQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('No rows found'),
        }),
      }
      mockSupabaseClient.from.mockReturnValueOnce(mockQueryChain)

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch current price')
    })

    it('should include stack trace in development mode errors', async () => {
      // Arrange
      process.env.NODE_ENV = 'development'
      const dbError = new Error('Database connection timeout')
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: dbError,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.stack).toBeDefined()
    })

    it('should not include stack trace in production mode errors', async () => {
      // Arrange
      process.env.NODE_ENV = 'production'
      const dbError = new Error('Database connection timeout')
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: dbError,
      })

      // Act
      const { GET } = await import('@/app/api/bitcoin-price/route')
      const response = await GET()
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.stack).toBeUndefined()
    })
  })
})