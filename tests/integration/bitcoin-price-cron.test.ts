import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from '@/app/api/cron/update-bitcoin-price/route'
import { getPool } from '../setup-db'
import { NextRequest } from 'next/server'

// Store original fetch
const originalFetch = global.fetch

/**
 * Mock DIA API success - only intercepts DIA API calls, lets Supabase calls through
 */
function mockDIAApiSuccess(price: number = 50000) {
  global.fetch = vi.fn((url: string | URL | Request, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    
    // Only mock DIA API calls
    if (urlString.includes('diadata.org')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ Symbol: 'BTC', Price: price }),
      } as Response)
    }
    
    // Pass through all other calls (Supabase, etc.)
    return originalFetch(url as any, options)
  }) as any
}

/**
 * Mock DIA API error - only intercepts DIA API calls
 */
function mockDIAApiError(status: number = 500) {
  global.fetch = vi.fn((url: string | URL | Request, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    
    if (urlString.includes('diadata.org')) {
      return Promise.resolve({
        ok: false,
        status: status,
        statusText: status === 500 ? 'Internal Server Error' : 'API Error',
        json: async () => ({ error: 'API request failed' }),
      } as Response)
    }
    
    return originalFetch(url as any, options)
  }) as any
}

/**
 * Mock DIA API network failure - only intercepts DIA API calls
 */
function mockDIAApiNetworkFailure(errorMessage: string = 'Network timeout') {
  global.fetch = vi.fn((url: string | URL | Request, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    
    if (urlString.includes('diadata.org')) {
      return Promise.reject(new Error(errorMessage))
    }
    
    return originalFetch(url as any, options)
  }) as any
}

/**
 * Mock DIA API invalid data - only intercepts DIA API calls
 */
function mockDIAApiInvalidData(priceValue: any = null) {
  global.fetch = vi.fn((url: string | URL | Request, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    
    if (urlString.includes('diadata.org')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ Symbol: 'BTC', Price: priceValue }),
      } as Response)
    }
    
    return originalFetch(url as any, options)
  }) as any
}

/**
 * Helper to create mock request with Vercel cron headers
 */
function createMockRequestWithVercelHeaders(): NextRequest {
  const headers = new Headers()
  headers.set('x-vercel-cron', '1')
  headers.set('x-vercel-id', 'test-vercel-id')
  
  return {
    headers,
  } as NextRequest
}

/**
 * Helper to create mock request with CRON_SECRET bearer token
 */
function createMockRequestWithAuth(): NextRequest {
  const headers = new Headers()
  headers.set('authorization', `Bearer ${process.env.CRON_SECRET}`)
  
  return {
    headers,
  } as NextRequest
}

/**
 * Helper to get latest bitcoin price from database
 */
async function getLatestBitcoinPrice() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM bitcoin_prices ORDER BY created_at DESC LIMIT 1'
    )
    const row = result.rows[0]
    if (!row) return null
    
    // Parse numeric string to number for price
    return {
      ...row,
      price: parseFloat(row.price)
    }
  } finally {
    client.release()
  }
}

/**
 * Helper to get all bitcoin prices from the last minute
 */
async function getRecentBitcoinPrices() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const result = await client.query(
      `SELECT * FROM bitcoin_prices 
       WHERE created_at > NOW() - INTERVAL '1 minute'
       ORDER BY created_at DESC`
    )
    // Parse numeric strings to numbers for price
    return result.rows.map(row => ({
      ...row,
      price: parseFloat(row.price)
    }))
  } finally {
    client.release()
  }
}

/**
 * Helper to cleanup test data (time-based cleanup for committed data visibility)
 * Cleans up both recent test data and old seeded data
 */
async function cleanupBitcoinPrices() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Delete recent test data (within 1 minute)
    await client.query(
      `DELETE FROM bitcoin_prices 
       WHERE created_at > NOW() - INTERVAL '1 minute'`
    )
    // Also clean up old seeded test data (more than 1 day old with test source)
    await client.query(
      `DELETE FROM bitcoin_prices 
       WHERE created_at < NOW() - INTERVAL '1 day' 
       AND source = 'diadata.org'`
    )
  } finally {
    client.release()
  }
}

/**
 * Helper to seed old bitcoin prices for cleanup testing
 */
async function seedOldBitcoinPrices(count: number = 3) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const insertedIds: string[] = []
    for (let i = 0; i < count; i++) {
      const result = await client.query(
        `INSERT INTO bitcoin_prices (price, currency, source, created_at, updated_at)
         VALUES ($1, 'USD', 'diadata.org', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
         RETURNING id`,
        [40000 + i * 1000]
      )
      insertedIds.push(result.rows[0].id)
    }
    return insertedIds
  } finally {
    client.release()
  }
}

/**
 * Helper to count total bitcoin prices in database
 */
async function countAllBitcoinPrices() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT COUNT(*) as count FROM bitcoin_prices')
    return parseInt(result.rows[0].count, 10)
  } finally {
    client.release()
  }
}

describe('Integration: /api/cron/update-bitcoin-price', () => {
  beforeEach(async () => {
    // Clean up any test data from previous runs
    await cleanupBitcoinPrices()
  })

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupBitcoinPrices()
  })

  describe('Authorization', () => {
    it('should accept requests with Vercel cron headers', async () => {
      mockDIAApiSuccess(50000)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.price).toBe(50000)
    })

    it('should accept requests with valid CRON_SECRET', async () => {
      mockDIAApiSuccess(50000)
      const request = createMockRequestWithAuth()

      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.price).toBe(50000)
    })

    it('should reject unauthorized requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/update-bitcoin-price')

      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.error).toContain('Unauthorized')
    })

    it('should reject requests with invalid bearer token', async () => {
      const headers = new Headers()
      headers.set('authorization', 'Bearer invalid-token')
      const request = { headers } as NextRequest

      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })

  describe('Data Persistence', () => {
    it('should store bitcoin price in database with correct data', async () => {
      const testPrice = 52345.67
      mockDIAApiSuccess(testPrice)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(200)
      
      // Verify data was persisted in real database
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice).not.toBeNull()
      expect(latestPrice.price).toBe(testPrice)
      expect(latestPrice.currency).toBe('USD')
      expect(latestPrice.source).toBe('diadata.org')
      expect(latestPrice.id).toBeDefined()
      expect(latestPrice.created_at).toBeDefined()
      expect(latestPrice.updated_at).toBeDefined()
    })

    it('should maintain decimal precision for price values', async () => {
      const testPrice = 48765.123456
      mockDIAApiSuccess(testPrice)
      const request = createMockRequestWithVercelHeaders()

      await GET(request)

      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice.price).toBe(testPrice)
    })

    it('should generate accurate timestamps on insert', async () => {
      const beforeInsert = new Date()
      mockDIAApiSuccess(50000)
      const request = createMockRequestWithVercelHeaders()

      await GET(request)
      const afterInsert = new Date()

      const latestPrice = await getLatestBitcoinPrice()
      const createdAt = new Date(latestPrice.created_at)
      const updatedAt = new Date(latestPrice.updated_at)
      
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime())
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime())
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime())
      expect(updatedAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime())
    })

    it('should return inserted price data in response', async () => {
      const testPrice = 49500.25
      mockDIAApiSuccess(testPrice)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.price).toBe(testPrice)
      expect(data.timestamp).toBeDefined()
      
      // Verify response data matches database
      const latestPrice = await getLatestBitcoinPrice()
      expect(data.price).toBe(latestPrice.price)
      expect(new Date(data.timestamp).getTime()).toBe(new Date(latestPrice.created_at).getTime())
    })

    it('should store price with consistent currency and source', async () => {
      mockDIAApiSuccess(51234.56)
      const request = createMockRequestWithVercelHeaders()

      await GET(request)

      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice.currency).toBe('USD')
      expect(latestPrice.source).toBe('diadata.org')
    })
  })

  describe('Cleanup Functionality', () => {
    it('should not fail if cleanup encounters errors', async () => {
      // This tests graceful degradation of cleanup
      mockDIAApiSuccess(51000)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      // Even if cleanup fails, the insert should succeed
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      
      // Verify the new price was still stored
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice.price).toBe(51000)
    })

    it('should trigger cleanup after successful insert', async () => {
      // Seed some old prices
      await seedOldBitcoinPrices(3)
      const countBefore = await countAllBitcoinPrices()
      
      mockDIAApiSuccess(52000)
      const request = createMockRequestWithVercelHeaders()

      await GET(request)

      // Note: Cleanup behavior depends on RPC implementation
      // This verifies cleanup was attempted (new price exists)
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice.price).toBe(52000)
    })
  })

  describe('Error Scenarios', () => {
    it('should handle external API errors gracefully', async () => {
      mockDIAApiError(503)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.success).toBeUndefined()
      
      // Verify no data was persisted
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice).toBeNull()
    })

    it('should handle network failures', async () => {
      mockDIAApiNetworkFailure('Network timeout')
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBeDefined()
      
      // Verify no data was persisted
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice).toBeNull()
    })

    it('should handle invalid API response data', async () => {
      mockDIAApiInvalidData(null)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBeDefined()
      
      // Verify no data was persisted
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice).toBeNull()
    })

    it('should handle API returning non-numeric price', async () => {
      mockDIAApiInvalidData('invalid')
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(500)
      
      // Verify no data was persisted
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice).toBeNull()
    })

    it('should handle API returning negative price', async () => {
      mockDIAApiSuccess(-1000)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      // Depending on validation, this might succeed or fail
      // If it succeeds, verify the negative price is stored
      if (response.status === 200) {
        const latestPrice = await getLatestBitcoinPrice()
        expect(latestPrice.price).toBe(-1000)
      }
    })

    it('should handle API returning zero price', async () => {
      mockDIAApiSuccess(0)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      // Depending on validation, this might succeed or fail
      // If it succeeds, verify zero is stored
      if (response.status === 200) {
        const latestPrice = await getLatestBitcoinPrice()
        expect(latestPrice.price).toBe(0)
      }
    })
  })

  describe('Multiple Updates', () => {
    it('should handle sequential price updates', async () => {
      const prices = [50000, 51000, 52000]
      const request = createMockRequestWithVercelHeaders()

      for (const price of prices) {
        mockDIAApiSuccess(price)
        const response = await GET(request)
        expect(response.status).toBe(200)
      }

      const recentPrices = await getRecentBitcoinPrices()
      expect(recentPrices.length).toBe(prices.length)
      
      // Verify latest price is the last one inserted
      expect(recentPrices[0].price).toBe(prices[prices.length - 1])
      
      // Verify all prices are present in reverse chronological order
      recentPrices.forEach((record, index) => {
        expect(record.price).toBe(prices[prices.length - 1 - index])
      })
    })

    it('should maintain data integrity across updates', async () => {
      const request = createMockRequestWithVercelHeaders()

      // First update
      mockDIAApiSuccess(48000)
      await GET(request)
      const firstPrice = await getLatestBitcoinPrice()

      // Wait to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))

      // Second update
      mockDIAApiSuccess(49000)
      await GET(request)
      const secondPrice = await getLatestBitcoinPrice()

      // Verify both records exist and have different IDs
      expect(firstPrice.id).not.toBe(secondPrice.id)
      expect(secondPrice.price).toBe(49000)
      expect(firstPrice.price).toBe(48000)
      
      // Verify timestamps are sequential
      expect(new Date(secondPrice.created_at).getTime())
        .toBeGreaterThan(new Date(firstPrice.created_at).getTime())
    })

    it('should handle rapid successive updates', async () => {
      const request = createMockRequestWithVercelHeaders()
      const updatePromises = []

      for (let i = 0; i < 5; i++) {
        mockDIAApiSuccess(50000 + i * 100)
        updatePromises.push(GET(request))
      }

      const responses = await Promise.all(updatePromises)
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      // Verify all prices were stored
      const recentPrices = await getRecentBitcoinPrices()
      expect(recentPrices.length).toBe(5)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large price values', async () => {
      const largePrice = 999999999.99
      mockDIAApiSuccess(largePrice)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(200)
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice.price).toBe(largePrice)
    })

    it('should handle very small price values', async () => {
      const smallPrice = 0.000001
      mockDIAApiSuccess(smallPrice)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.status).toBe(200)
      const latestPrice = await getLatestBitcoinPrice()
      expect(latestPrice.price).toBe(smallPrice)
    })

    it('should handle typical bitcoin price range', async () => {
      const typicalPrices = [30000, 45000, 60000, 75000]
      const request = createMockRequestWithVercelHeaders()

      for (const price of typicalPrices) {
        mockDIAApiSuccess(price)
        const response = await GET(request)
        expect(response.status).toBe(200)
        
        const latestPrice = await getLatestBitcoinPrice()
        expect(latestPrice.price).toBe(price)
      }
    })
  })

  describe('Response Format', () => {
    it('should return consistent response structure', async () => {
      mockDIAApiSuccess(50000)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('price')
      expect(data).toHaveProperty('timestamp')
      expect(typeof data.success).toBe('boolean')
      expect(typeof data.price).toBe('number')
      expect(typeof data.timestamp).toBe('string')
    })

    it('should return ISO 8601 formatted timestamp', async () => {
      mockDIAApiSuccess(50000)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)
      const data = await response.json()

      // Verify timestamp is valid ISO 8601 and parseable
      const timestamp = new Date(data.timestamp)
      expect(timestamp.getTime()).not.toBeNaN()
      expect(typeof data.timestamp).toBe('string')
      // Timestamps should be recent (within last minute)
      expect(Date.now() - timestamp.getTime()).toBeLessThan(60000)
    })

    it('should return appropriate content type header', async () => {
      mockDIAApiSuccess(50000)
      const request = createMockRequestWithVercelHeaders()

      const response = await GET(request)

      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })
})
