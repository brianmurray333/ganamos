/**
 * Mock Bitcoin Price Store
 * 
 * Provides realistic Bitcoin price data for local development and testing
 * without requiring external API calls to DIA Data.
 * 
 * Features:
 * - Generates realistic BTC prices with small random variations
 * - Singleton pattern for global state management
 * - Configurable base price for testing scenarios
 * - Reset capability for test isolation
 * 
 * Usage:
 *   import { mockBitcoinPriceStore } from '@/lib/mock-bitcoin-price-store'
 *   const price = mockBitcoinPriceStore.getPrice()
 */

/**
 * Bitcoin price response format (matches DIA Data API)
 */
export interface BitcoinPriceResponse {
  Price: number
}

/**
 * Mock Bitcoin Price Store
 * Generates realistic Bitcoin prices with small random variations
 */
class MockBitcoinPriceStore {
  private basePrice: number = 42150 // Starting BTC price in USD
  private lastPrice: number = this.basePrice

  /**
   * Get current Bitcoin price with small random variation
   * Generates ±0.5-2% variation from last price
   */
  getPrice(): BitcoinPriceResponse {
    // Generate variation between -2% and +2%
    const variationPercent = (Math.random() - 0.5) * 4
    const variation = this.lastPrice * (variationPercent / 100)
    
    // Apply variation to last price
    this.lastPrice = this.lastPrice + variation
    
    // Keep price within reasonable bounds (30k-70k)
    if (this.lastPrice < 30000) {
      this.lastPrice = 30000 + Math.random() * 5000
    } else if (this.lastPrice > 70000) {
      this.lastPrice = 65000 + Math.random() * 5000
    }

    // Round to 2 decimal places
    const price = Math.round(this.lastPrice * 100) / 100

    console.log(`[Mock Bitcoin Price] Generated price: $${price.toFixed(2)}`)

    return { Price: price }
  }

  /**
   * Set base price for testing scenarios
   */
  setBasePrice(price: number): void {
    this.basePrice = price
    this.lastPrice = price
    console.log(`[Mock Bitcoin Price] Base price set to: $${price.toFixed(2)}`)
  }

  /**
   * Reset to default price (for test isolation)
   */
  reset(): void {
    this.basePrice = 42150
    this.lastPrice = this.basePrice
    console.log('[Mock Bitcoin Price] Reset to default ($42,150)')
  }

  /**
   * Get current last price (for testing/debugging)
   */
  getLastPrice(): number {
    return this.lastPrice
  }
}

// Singleton instance
export const mockBitcoinPriceStore = new MockBitcoinPriceStore()
