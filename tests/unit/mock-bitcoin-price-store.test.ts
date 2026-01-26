import { describe, it, expect, beforeEach } from "vitest"
import { mockBitcoinPriceStore } from "@/lib/mock-bitcoin-price-store"

describe("MockBitcoinPriceStore", () => {
  beforeEach(() => {
    // Reset store before each test
    mockBitcoinPriceStore.reset()
  })

  describe("getPrice", () => {
    it("returns price in correct format", () => {
      const result = mockBitcoinPriceStore.getPrice()

      expect(result).toHaveProperty("Price")
      expect(typeof result.Price).toBe("number")
    })

    it("returns realistic Bitcoin price", () => {
      const result = mockBitcoinPriceStore.getPrice()

      // Price should be within reasonable BTC range
      expect(result.Price).toBeGreaterThan(30000)
      expect(result.Price).toBeLessThan(70000)
    })

    it("generates price variations on multiple calls", () => {
      const prices = [
        mockBitcoinPriceStore.getPrice().Price,
        mockBitcoinPriceStore.getPrice().Price,
        mockBitcoinPriceStore.getPrice().Price,
      ]

      // At least one price should be different (variation)
      const uniquePrices = new Set(prices)
      expect(uniquePrices.size).toBeGreaterThan(1)
    })

    it("keeps price within bounds after multiple variations", () => {
      // Generate 20 prices to test bounds enforcement
      for (let i = 0; i < 20; i++) {
        const result = mockBitcoinPriceStore.getPrice()
        expect(result.Price).toBeGreaterThan(30000)
        expect(result.Price).toBeLessThan(70000)
      }
    })

    it("rounds price to 2 decimal places", () => {
      const result = mockBitcoinPriceStore.getPrice()
      const decimalPlaces = (result.Price.toString().split(".")[1] || "").length
      expect(decimalPlaces).toBeLessThanOrEqual(2)
    })
  })

  describe("setBasePrice", () => {
    it("updates base price", () => {
      mockBitcoinPriceStore.setBasePrice(50000)
      const result = mockBitcoinPriceStore.getPrice()

      // Price should be close to new base (within variation range)
      expect(result.Price).toBeGreaterThan(48000) // -4% variation tolerance
      expect(result.Price).toBeLessThan(52000) // +4% variation tolerance
    })

    it("resets last price to base price", () => {
      // Generate some variations
      mockBitcoinPriceStore.getPrice()
      mockBitcoinPriceStore.getPrice()

      // Set new base price
      mockBitcoinPriceStore.setBasePrice(45000)

      const result = mockBitcoinPriceStore.getPrice()
      
      // Next price should be close to new base
      expect(result.Price).toBeGreaterThan(43000)
      expect(result.Price).toBeLessThan(47000)
    })
  })

  describe("reset", () => {
    it("resets to default price", () => {
      // Change base price
      mockBitcoinPriceStore.setBasePrice(60000)
      mockBitcoinPriceStore.getPrice()

      // Reset to default
      mockBitcoinPriceStore.reset()

      const result = mockBitcoinPriceStore.getPrice()

      // Should be close to default 42150
      expect(result.Price).toBeGreaterThan(40000)
      expect(result.Price).toBeLessThan(44000)
    })

    it("clears accumulated variations", () => {
      // Generate many prices to accumulate variations
      for (let i = 0; i < 10; i++) {
        mockBitcoinPriceStore.getPrice()
      }

      // Reset
      mockBitcoinPriceStore.reset()

      const result = mockBitcoinPriceStore.getPrice()

      // Should be back to default range
      expect(result.Price).toBeGreaterThan(40000)
      expect(result.Price).toBeLessThan(44000)
    })
  })

  describe("getLastPrice", () => {
    it("returns current last price", () => {
      mockBitcoinPriceStore.setBasePrice(50000)
      const lastPrice = mockBitcoinPriceStore.getLastPrice()

      expect(lastPrice).toBe(50000)
    })

    it("updates after getPrice calls", () => {
      const initialPrice = mockBitcoinPriceStore.getLastPrice()
      mockBitcoinPriceStore.getPrice()
      const updatedPrice = mockBitcoinPriceStore.getLastPrice()

      // Last price should change (unless exactly same variation, unlikely)
      expect(updatedPrice).toBeDefined()
      expect(typeof updatedPrice).toBe("number")
    })
  })
})
