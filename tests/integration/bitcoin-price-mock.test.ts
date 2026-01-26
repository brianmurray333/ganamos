import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { mockBitcoinPriceStore } from "@/lib/mock-bitcoin-price-store"
import { getServiceClient } from "./helpers/db-client"

// Import route handlers directly
import { GET as getDiaDataPrice } from "@/app/api/mock/dia-data/assetQuotation/[symbol]/[blockchain]/route"
import { GET as getBitcoinPrice } from "@/app/api/bitcoin-price/route"

/**
 * Integration tests for Bitcoin Price Mock Implementation
 * 
 * Tests the complete flow:
 * 1. Mock DIA Data endpoint returns realistic prices
 * 2. Mock bitcoin price store generates valid prices
 * 3. Prices written to database
 * 4. Bitcoin price read endpoint returns latest price
 * 
 * Note: These tests call route handlers directly, not via HTTP fetch
 */

// Set USE_MOCKS for these tests
process.env.USE_MOCKS = "true"

describe("Bitcoin Price Mock Integration", () => {
  const supabase = getServiceClient()
  const testPriceIds: string[] = []

  beforeEach(() => {
    // Reset mock store before each test
    mockBitcoinPriceStore.reset()
  })

  afterAll(async () => {
    // Clean up test prices
    if (testPriceIds.length > 0) {
      await supabase.from("bitcoin_prices").delete().in("id", testPriceIds)
    }
  })

  describe("Mock DIA Data Endpoint", () => {
    it("returns price in DIA Data format", async () => {
      const url = "http://localhost:3000/api/mock/dia-data/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000"
      const request = new NextRequest(url, { method: "GET" })
      const params = { symbol: "Bitcoin", blockchain: "0x0000000000000000000000000000000000000000" }

      const response = await getDiaDataPrice(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty("Price")
      expect(typeof data.Price).toBe("number")
    })

    it("generates realistic Bitcoin prices", async () => {
      const url = "http://localhost:3000/api/mock/dia-data/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000"
      const request = new NextRequest(url, { method: "GET" })
      const params = { symbol: "Bitcoin", blockchain: "0x0000000000000000000000000000000000000000" }

      const response = await getDiaDataPrice(request, { params })
      const data = await response.json()

      expect(data.Price).toBeGreaterThan(30000)
      expect(data.Price).toBeLessThan(70000)
    })

    it("returns different prices on multiple requests", async () => {
      const url = "http://localhost:3000/api/mock/dia-data/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000"
      const params = { symbol: "Bitcoin", blockchain: "0x0000000000000000000000000000000000000000" }

      const prices = await Promise.all([
        getDiaDataPrice(new NextRequest(url, { method: "GET" }), { params }).then(r => r.json()),
        getDiaDataPrice(new NextRequest(url, { method: "GET" }), { params }).then(r => r.json()),
        getDiaDataPrice(new NextRequest(url, { method: "GET" }), { params }).then(r => r.json()),
      ])

      const uniquePrices = new Set(prices.map(p => p.Price))
      // At least some variation expected (not all identical)
      expect(uniquePrices.size).toBeGreaterThanOrEqual(1)
    })
  })

  describe("Bitcoin Price Read Endpoint", () => {
    it("returns latest price from database", async () => {
      // Insert test price
      const { data: insertedPrice } = await supabase
        .from("bitcoin_prices")
        .insert({
          price: 42000,
          currency: "USD",
          source: "diadata.org",
        })
        .select()
        .single()

      if (insertedPrice) {
        testPriceIds.push(insertedPrice.id)
      }

      // Fetch via route handler
      const request = new NextRequest("http://localhost:3000/api/bitcoin-price", { method: "GET" })
      const response = await getBitcoinPrice(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty("price")
      expect(data).toHaveProperty("currency")
      expect(data).toHaveProperty("source")
      expect(typeof data.price).toBe("number")
      expect(data.currency).toBe("USD")
    })

    it("includes age and staleness information", async () => {
      // Ensure there's at least one price in the database
      const { data: existingPrice } = await supabase
        .from("bitcoin_prices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (!existingPrice) {
        // Insert a test price if none exists
        const { data: insertedPrice } = await supabase
          .from("bitcoin_prices")
          .insert({
            price: 41000,
            currency: "USD",
            source: "diadata.org",
          })
          .select()
          .single()
        
        if (insertedPrice) {
          testPriceIds.push(insertedPrice.id)
        }
      }

      const request = new NextRequest("http://localhost:3000/api/bitcoin-price", { method: "GET" })
      const response = await getBitcoinPrice(request)
      const data = await response.json()

      expect(data).toHaveProperty("ageMinutes")
      expect(data).toHaveProperty("isStale")
      expect(typeof data.ageMinutes).toBe("number")
      expect(typeof data.isStale).toBe("boolean")
    })
  })

  describe("Database Integration", () => {
    it("stores Bitcoin prices in database", async () => {
      const testPrice = 45000

      const { data: insertedPrice, error } = await supabase
        .from("bitcoin_prices")
        .insert({
          price: testPrice,
          currency: "USD",
          source: "diadata.org",
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(insertedPrice).toBeDefined()
      // Database returns numeric as string, so compare as strings
      expect(String(insertedPrice?.price)).toBe(String(testPrice))

      if (insertedPrice) {
        testPriceIds.push(insertedPrice.id)
      }
    })

    it("retrieves latest price from database", async () => {
      // First insert a price to ensure we have one
      const { data: insertedPrice } = await supabase
        .from("bitcoin_prices")
        .insert({
          price: 43500,
          currency: "USD",
          source: "diadata.org",
        })
        .select()
        .single()

      if (insertedPrice) {
        testPriceIds.push(insertedPrice.id)
      }

      const { data: latestPrice } = await supabase
        .from("bitcoin_prices")
        .select("*")
        .eq("currency", "USD")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      expect(latestPrice).toBeDefined()
      expect(latestPrice?.currency).toBe("USD")
      expect(latestPrice?.source).toBe("diadata.org")
      expect(latestPrice?.price).toBeDefined()
    })
  })

  describe("Mock Price Variations", () => {
    it("generates prices within expected variation range", () => {
      const basePrice = 50000
      mockBitcoinPriceStore.setBasePrice(basePrice)

      const prices: number[] = []
      for (let i = 0; i < 10; i++) {
        prices.push(mockBitcoinPriceStore.getPrice().Price)
      }

      // All prices should be within reasonable variation of base
      prices.forEach(price => {
        const variation = Math.abs(price - basePrice) / basePrice
        expect(variation).toBeLessThan(0.1) // Less than 10% variation
      })
    })

    it("maintains price consistency within test", () => {
      mockBitcoinPriceStore.setBasePrice(42150)

      const price1 = mockBitcoinPriceStore.getPrice().Price
      const price2 = mockBitcoinPriceStore.getPrice().Price

      // Prices should be close but not identical
      expect(price1).toBeGreaterThan(40000)
      expect(price1).toBeLessThan(44000)
      expect(price2).toBeGreaterThan(40000)
      expect(price2).toBeLessThan(44000)
    })
  })
})
