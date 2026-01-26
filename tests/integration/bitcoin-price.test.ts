/**
 * Integration tests for GET /api/bitcoin-price
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * This route uses createServerSupabaseClient (no auth required)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { GET } from '@/app/api/bitcoin-price/route'
import { getServiceClient } from './helpers/db-client'
import { getPool } from '../setup-db'

// Helper to seed a bitcoin price
async function seedBitcoinPrice(
  overrides: {
    price?: number
    currency?: string
    source?: string
    createdAt?: Date
  } = {}
): Promise<{ id: string; price: number }> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const price = overrides.price ?? 50000
    const currency = overrides.currency || 'USD'
    const source = overrides.source || 'DIA'
    const createdAt = overrides.createdAt || new Date()

    const result = await client.query(
      `INSERT INTO bitcoin_prices (price, currency, source, created_at, updated_at)
       VALUES ($1::numeric, $2::text, $3::text, $4::timestamptz, $4::timestamptz)
       RETURNING id, price::float`,
      [price, currency, source, createdAt.toISOString()]
    )

    return result.rows[0]
  } finally {
    client.release()
  }
}

// Helper to clean up bitcoin prices
async function cleanupBitcoinPrices() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Only delete test prices (those created recently in tests)
    await client.query(`DELETE FROM bitcoin_prices WHERE created_at > NOW() - INTERVAL '1 minute'`)
  } finally {
    client.release()
  }
}

describe('GET /api/bitcoin-price', () => {
  beforeEach(async () => {
    await cleanupBitcoinPrices()
  })

  describe('Successful Price Retrieval', () => {
    it('should return latest bitcoin price', async () => {
      await seedBitcoinPrice({ price: 45000 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.price).toBe(45000)
      expect(data.currency).toBe('USD')
    })

    it('should return the most recent price', async () => {
      // Seed older price
      const oldDate = new Date(Date.now() - 60000) // 1 minute ago
      await seedBitcoinPrice({ price: 40000, createdAt: oldDate })

      // Seed newer price
      await seedBitcoinPrice({ price: 50000 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.price).toBe(50000)
    })

    it('should include source information', async () => {
      await seedBitcoinPrice({ price: 48000, source: 'TestSource' })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.source).toBe('TestSource')
    })

    it('should include timestamp', async () => {
      await seedBitcoinPrice({ price: 47000 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.timestamp).toBeDefined()
    })

    it('should include age in minutes', async () => {
      await seedBitcoinPrice({ price: 46000 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.ageMinutes).toBeDefined()
      expect(typeof data.ageMinutes).toBe('number')
    })

    it('should mark fresh price as not stale', async () => {
      await seedBitcoinPrice({ price: 45000 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.isStale).toBe(false)
    })
  })

  describe('Stale Price Detection', () => {
    it('should mark old price as stale (> 60 minutes)', async () => {
      // Delete ALL prices to ensure we only have the old one
      const pool = getPool()
      const client = await pool.connect()
      try {
        await client.query('DELETE FROM bitcoin_prices')
      } finally {
        client.release()
      }

      // Seed price from 90 minutes ago
      const oldDate = new Date(Date.now() - 90 * 60 * 1000)
      await seedBitcoinPrice({ price: 44000, createdAt: oldDate })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.isStale).toBe(true)
      expect(data.ageMinutes).toBeGreaterThan(60)
    })
  })

  describe('No Price Available', () => {
    it('should return 503 when no prices exist', async () => {
      // Ensure no prices exist
      await cleanupBitcoinPrices()
      const pool = getPool()
      const client = await pool.connect()
      try {
        await client.query('DELETE FROM bitcoin_prices')
      } finally {
        client.release()
      }

      const response = await GET()

      expect(response.status).toBe(503)
      const data = await response.json()
      expect(data.error).toContain('No price data available')
    })
  })

  describe('Price Precision', () => {
    it('should handle decimal prices', async () => {
      await seedBitcoinPrice({ price: 45123.45 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.price).toBeCloseTo(45123.45, 2)
    })

    it('should handle very high prices', async () => {
      await seedBitcoinPrice({ price: 150000 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.price).toBe(150000)
    })

    it('should handle very low prices', async () => {
      await seedBitcoinPrice({ price: 100 })

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.price).toBe(100)
    })
  })
})
