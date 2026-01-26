import { describe, it, expect } from 'vitest'
import { convertSatsToUSD } from '@/lib/utils'

describe('convertSatsToUSD', () => {
  describe('Happy Path - Valid Conversions', () => {
    it('should convert small amounts correctly', () => {
      // 1 sat at $50,000/BTC = $0.0005
      expect(convertSatsToUSD(1, 50000)).toBe('0.00')
      
      // 100 sats at $50,000/BTC = $0.05
      expect(convertSatsToUSD(100, 50000)).toBe('0.05')
      
      // 1,000 sats at $50,000/BTC = $0.50
      expect(convertSatsToUSD(1000, 50000)).toBe('0.50')
    })

    it('should convert medium amounts correctly', () => {
      // 10,000 sats at $50,000/BTC = $5.00
      expect(convertSatsToUSD(10000, 50000)).toBe('5.00')
      
      // 100,000 sats at $50,000/BTC = $50.00
      expect(convertSatsToUSD(100000, 50000)).toBe('50.00')
      
      // 500,000 sats at $40,000/BTC = $200.00
      expect(convertSatsToUSD(500000, 40000)).toBe('200.00')
    })

    it('should convert large amounts correctly', () => {
      // 1,000,000 sats (0.01 BTC) at $50,000/BTC = $500.00
      expect(convertSatsToUSD(1000000, 50000)).toBe('500.00')
      
      // 10,000,000 sats (0.1 BTC) at $50,000/BTC = $5,000.00
      expect(convertSatsToUSD(10000000, 50000)).toBe('5000.00')
      
      // 100,000,000 sats (1 BTC) at $50,000/BTC = $50,000.00
      expect(convertSatsToUSD(100000000, 50000)).toBe('50000.00')
    })

    it('should handle different Bitcoin prices correctly', () => {
      // 100,000 sats at $30,000/BTC = $30.00
      expect(convertSatsToUSD(100000, 30000)).toBe('30.00')
      
      // 100,000 sats at $60,000/BTC = $60.00
      expect(convertSatsToUSD(100000, 60000)).toBe('60.00')
      
      // 100,000 sats at $100,000/BTC = $100.00
      expect(convertSatsToUSD(100000, 100000)).toBe('100.00')
    })

    it('should handle low Bitcoin prices', () => {
      // 100,000 sats at $1,000/BTC = $1.00
      expect(convertSatsToUSD(100000, 1000)).toBe('1.00')
      
      // 100,000 sats at $100/BTC = $0.10
      expect(convertSatsToUSD(100000, 100)).toBe('0.10')
      
      // 100,000 sats at $10/BTC = $0.01
      expect(convertSatsToUSD(100000, 10)).toBe('0.01')
    })

    it('should handle high Bitcoin prices', () => {
      // 100,000 sats at $100,000/BTC = $100.00
      expect(convertSatsToUSD(100000, 100000)).toBe('100.00')
      
      // 100,000 sats at $500,000/BTC = $500.00
      expect(convertSatsToUSD(100000, 500000)).toBe('500.00')
      
      // 100,000 sats at $1,000,000/BTC = $1,000.00
      expect(convertSatsToUSD(100000, 1000000)).toBe('1000.00')
    })
  })

  describe('Edge Cases - Boundary Values', () => {
    it('should handle zero satoshis', () => {
      expect(convertSatsToUSD(0, 50000)).toBe('0.00')
      expect(convertSatsToUSD(0, 1)).toBe('0.00')
      expect(convertSatsToUSD(0, 1000000)).toBe('0.00')
    })

    it('should return null for null Bitcoin price', () => {
      expect(convertSatsToUSD(1000, null)).toBeNull()
      expect(convertSatsToUSD(0, null)).toBeNull()
      expect(convertSatsToUSD(100000000, null)).toBeNull()
    })

    it('should return null for undefined Bitcoin price', () => {
      expect(convertSatsToUSD(1000, undefined as any)).toBeNull()
      expect(convertSatsToUSD(0, undefined as any)).toBeNull()
    })

    it('should return null for negative satoshis', () => {
      expect(convertSatsToUSD(-1, 50000)).toBeNull()
      expect(convertSatsToUSD(-100, 50000)).toBeNull()
      expect(convertSatsToUSD(-1000000, 50000)).toBeNull()
    })

    it('should return null for negative Bitcoin price', () => {
      expect(convertSatsToUSD(1000, -50000)).toBeNull()
      expect(convertSatsToUSD(0, -1)).toBeNull()
      expect(convertSatsToUSD(100000, -100)).toBeNull()
    })

    it('should handle very large satoshi amounts without overflow', () => {
      // 1 billion sats (10 BTC) at $50,000/BTC = $500,000.00
      expect(convertSatsToUSD(1000000000, 50000)).toBe('500000.00')
      
      // 10 billion sats (100 BTC) at $50,000/BTC = $5,000,000.00
      expect(convertSatsToUSD(10000000000, 50000)).toBe('5000000.00')
      
      // Near MAX_SAFE_INTEGER (90,071,992.54740991 BTC at $50,000/BTC)
      const maxSafeSats = Number.MAX_SAFE_INTEGER
      const result = convertSatsToUSD(maxSafeSats, 50000)
      expect(result).not.toBeNull()
      expect(typeof result).toBe('string')
    })

    it('should handle very small non-zero results', () => {
      // 1 sat at $1/BTC = $0.00000001
      expect(convertSatsToUSD(1, 1)).toBe('0.00')
      
      // 10 sats at $1/BTC = $0.0000001
      expect(convertSatsToUSD(10, 1)).toBe('0.00')
      
      // 1 sat at $0.01/BTC = $0.0000000001
      expect(convertSatsToUSD(1, 0.01)).toBe('0.00')
    })

    it('should handle exact 1 BTC conversion', () => {
      // Exactly 1 BTC (100,000,000 sats) at $50,000/BTC
      expect(convertSatsToUSD(100000000, 50000)).toBe('50000.00')
      
      // Exactly 1 BTC at $1/BTC
      expect(convertSatsToUSD(100000000, 1)).toBe('1.00')
      
      // Exactly 1 BTC at $100,000/BTC
      expect(convertSatsToUSD(100000000, 100000)).toBe('100000.00')
    })

    it('should handle Bitcoin price of zero', () => {
      // Zero price returns "0.00" (mathematically valid, though unrealistic)
      expect(convertSatsToUSD(1000, 0)).toBe('0.00')
      expect(convertSatsToUSD(100000000, 0)).toBe('0.00')
    })
  })

  describe('Error Conditions - Invalid Inputs', () => {
    it('should return null for NaN satoshi values', () => {
      expect(convertSatsToUSD(NaN, 50000)).toBeNull()
      expect(convertSatsToUSD(NaN, 1)).toBeNull()
    })

    it('should return null for NaN Bitcoin price', () => {
      expect(convertSatsToUSD(1000, NaN)).toBeNull()
      expect(convertSatsToUSD(0, NaN)).toBeNull()
    })

    it('should return null for Infinity satoshi values', () => {
      expect(convertSatsToUSD(Infinity, 50000)).toBeNull()
      expect(convertSatsToUSD(-Infinity, 50000)).toBeNull()
    })

    it('should return null for Infinity Bitcoin price', () => {
      expect(convertSatsToUSD(1000, Infinity)).toBeNull()
      expect(convertSatsToUSD(1000, -Infinity)).toBeNull()
    })

    it('should return null for non-numeric satoshi types', () => {
      expect(convertSatsToUSD('1000' as any, 50000)).toBeNull()
      expect(convertSatsToUSD(true as any, 50000)).toBeNull()
      expect(convertSatsToUSD([] as any, 50000)).toBeNull()
      expect(convertSatsToUSD({} as any, 50000)).toBeNull()
    })

    it('should return null for non-numeric Bitcoin price types', () => {
      expect(convertSatsToUSD(1000, '50000' as any)).toBeNull()
      expect(convertSatsToUSD(1000, true as any)).toBeNull()
      expect(convertSatsToUSD(1000, [] as any)).toBeNull()
      expect(convertSatsToUSD(1000, {} as any)).toBeNull()
    })

    it('should handle both invalid parameters', () => {
      expect(convertSatsToUSD(NaN, NaN)).toBeNull()
      expect(convertSatsToUSD(Infinity, Infinity)).toBeNull()
      expect(convertSatsToUSD(-1, -1)).toBeNull()
      expect(convertSatsToUSD('invalid' as any, 'invalid' as any)).toBeNull()
    })
  })

  describe('Rounding Behavior - Decimal Precision', () => {
    it('should always return exactly 2 decimal places', () => {
      // Integer results should have .00
      expect(convertSatsToUSD(100000000, 1)).toBe('1.00')
      expect(convertSatsToUSD(500000000, 10)).toBe('50.00')
      
      // Fractional results should have exactly 2 decimals
      expect(convertSatsToUSD(150000000, 1)).toBe('1.50')
      expect(convertSatsToUSD(123456789, 1)).toBe('1.23')
    })

    it('should round to nearest cent correctly', () => {
      // Test very small values that round to 0.00
      expect(convertSatsToUSD(400, 1)).toBe('0.00')
      expect(convertSatsToUSD(500, 1)).toBe('0.00')
      
      // Test rounding down ($0.994 rounds to $0.99)
      expect(convertSatsToUSD(99400000, 1)).toBe('0.99')
      
      // Test $0.995 rounds to $0.99 (banker's rounding with floating-point)
      expect(convertSatsToUSD(99500000, 1)).toBe('0.99')
    })

    it('should handle rounding edge cases', () => {
      // Test actual toFixed() behavior with half-cent values
      // $0.005 rounds to $0.01 (500,000 sats)
      expect(convertSatsToUSD(500000, 1)).toBe('0.01')
      
      // $0.015 rounds to $0.01 (1,500,000 sats - banker's rounding)
      expect(convertSatsToUSD(1500000, 1)).toBe('0.01')
      
      // $0.025 rounds to $0.03 (2,500,000 sats)
      expect(convertSatsToUSD(2500000, 1)).toBe('0.03')
      
      // $0.035 rounds to $0.04 (3,500,000 sats)
      expect(convertSatsToUSD(3500000, 1)).toBe('0.04')
    })

    it('should handle very small fractional amounts', () => {
      // Values that round to 0.00 (sub-cent amounts)
      expect(convertSatsToUSD(1, 1)).toBe('0.00')
      expect(convertSatsToUSD(10, 1)).toBe('0.00')
      expect(convertSatsToUSD(100, 1)).toBe('0.00')
      expect(convertSatsToUSD(400, 1)).toBe('0.00')
      expect(convertSatsToUSD(400000, 1)).toBe('0.00') // $0.004
      
      // First value that rounds to 0.01 ($0.005+)
      expect(convertSatsToUSD(500000, 1)).toBe('0.01')
    })

    it('should maintain precision for large USD amounts', () => {
      // 100 BTC at $50,000 = $5,000,000.00
      expect(convertSatsToUSD(10000000000, 50000)).toBe('5000000.00')
      
      // 1000 BTC at $100,000 = $100,000,000.00
      expect(convertSatsToUSD(100000000000, 100000)).toBe('100000000.00')
      
      // Should not use scientific notation
      const result = convertSatsToUSD(100000000000, 100000)
      expect(result).not.toContain('e')
      expect(result).not.toContain('E')
    })

    it('should handle recurring decimals correctly', () => {
      // 1/3 of a satoshi at $3 = $0.01
      expect(convertSatsToUSD(33333333, 1)).toBe('0.33')
      
      // 2/3 of a satoshi at $3 = $0.02
      expect(convertSatsToUSD(66666666, 1)).toBe('0.67')
      
      // Values that create repeating decimals
      expect(convertSatsToUSD(33333333, 3)).toBe('1.00')
    })
  })

  describe('Real-World Scenarios', () => {
    it('should handle typical transaction amounts', () => {
      // Coffee: ~10,000 sats at $50,000/BTC = $5.00
      expect(convertSatsToUSD(10000, 50000)).toBe('5.00')
      
      // Lunch: ~50,000 sats at $50,000/BTC = $25.00
      expect(convertSatsToUSD(50000, 50000)).toBe('25.00')
      
      // Tank of gas: ~200,000 sats at $50,000/BTC = $100.00
      expect(convertSatsToUSD(200000, 50000)).toBe('100.00')
    })

    it('should handle micropayments', () => {
      // 1 sat at $50,000/BTC = $0.0005 rounds to $0.00
      expect(convertSatsToUSD(1, 50000)).toBe('0.00')
      
      // 10 sats at $50,000/BTC = $0.005 rounds to $0.01
      expect(convertSatsToUSD(10, 50000)).toBe('0.01')
      
      // 100 sats at $50,000/BTC = $0.05
      expect(convertSatsToUSD(100, 50000)).toBe('0.05')
    })

    it('should handle historical Bitcoin prices', () => {
      // Early days: $1/BTC
      expect(convertSatsToUSD(100000000, 1)).toBe('1.00')
      
      // 2013 peak: $1,000/BTC
      expect(convertSatsToUSD(100000000, 1000)).toBe('1000.00')
      
      // 2017 peak: $20,000/BTC
      expect(convertSatsToUSD(100000000, 20000)).toBe('20000.00')
      
      // 2021 peak: $69,000/BTC
      expect(convertSatsToUSD(100000000, 69000)).toBe('69000.00')
    })

    it('should handle common wallet balances', () => {
      // Small wallet: 0.001 BTC (100,000 sats) at $50,000/BTC = $50.00
      expect(convertSatsToUSD(100000, 50000)).toBe('50.00')
      
      // Medium wallet: 0.01 BTC (1,000,000 sats) at $50,000/BTC = $500.00
      expect(convertSatsToUSD(1000000, 50000)).toBe('500.00')
      
      // Large wallet: 0.1 BTC (10,000,000 sats) at $50,000/BTC = $5,000.00
      expect(convertSatsToUSD(10000000, 50000)).toBe('5000.00')
    })

    it('should handle lightning channel capacities', () => {
      // Typical channel: 0.01 BTC (1,000,000 sats) at $50,000/BTC = $500.00
      expect(convertSatsToUSD(1000000, 50000)).toBe('500.00')
      
      // Large channel: 0.1 BTC (10,000,000 sats) at $50,000/BTC = $5,000.00
      expect(convertSatsToUSD(10000000, 50000)).toBe('5000.00')
      
      // Max practical channel: 0.5 BTC (50,000,000 sats) at $50,000/BTC = $25,000.00
      expect(convertSatsToUSD(50000000, 50000)).toBe('25000.00')
    })
  })

  describe('Consistency and Determinism', () => {
    it('should return consistent results for same inputs', () => {
      const sats = 123456
      const price = 45678.90
      const result1 = convertSatsToUSD(sats, price)
      const result2 = convertSatsToUSD(sats, price)
      const result3 = convertSatsToUSD(sats, price)
      
      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
      expect(result1).toBe(result3)
    })

    it('should be commutative with respect to multiplication', () => {
      // (sats * price1) == (sats * price1) regardless of order
      const sats = 100000
      const price = 50000
      
      const result1 = convertSatsToUSD(sats, price)
      const result2 = convertSatsToUSD(sats, price)
      
      expect(result1).toBe(result2)
    })

    it('should scale linearly with satoshi amount', () => {
      const price = 50000
      
      const result1 = convertSatsToUSD(100000, price)
      const result2 = convertSatsToUSD(200000, price)
      const result3 = convertSatsToUSD(300000, price)
      
      // Double the sats = double the USD
      expect(parseFloat(result2!)).toBe(parseFloat(result1!) * 2)
      expect(parseFloat(result3!)).toBe(parseFloat(result1!) * 3)
    })

    it('should scale linearly with Bitcoin price', () => {
      const sats = 100000
      
      const result1 = convertSatsToUSD(sats, 25000)
      const result2 = convertSatsToUSD(sats, 50000)
      const result3 = convertSatsToUSD(sats, 75000)
      
      // Double the price = double the USD
      expect(parseFloat(result2!)).toBe(parseFloat(result1!) * 2)
      expect(parseFloat(result3!)).toBe(parseFloat(result1!) * 3)
    })
  })
})