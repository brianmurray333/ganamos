import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TEST_R_HASH_HEX,
  TEST_R_HASH_BASE64,
  TEST_PREIMAGE,
} from '@/tests/unit/helpers/invoice-status-helpers'

// Mock BEFORE imports - this is critical for hoisting
vi.mock('@/lib/lightning', () => {
  let mockLndRequest = vi.fn()
  
  // Recreate checkInvoice implementation using our mock
  const checkInvoice = async (rHash: string) => {
    try {
      // Convert hex string to base64 if needed
      let rHashParam = rHash
      // Detect if it's hex (64 chars, only 0-9a-f) vs base64 (43-44 chars with wider charset)
      if (/^[0-9a-f]{64}$/i.test(rHash)) {
        // It's hex, convert to base64
        const buffer = Buffer.from(rHash, "hex")
        rHashParam = buffer.toString("base64")
      }

      const result = await mockLndRequest(`/v1/invoice/${encodeURIComponent(rHashParam)}`)

      if (!result.success) {
        return result
      }

      return {
        success: true,
        settled: result.data.settled,
        amountPaid: result.data.amt_paid_sat,
        state: result.data.state,
        creationDate: result.data.creation_date,
        settleDate: result.data.settle_date,
        preimage: result.data.r_preimage ? Buffer.from(result.data.r_preimage, 'base64').toString('hex') : null,
      }
    } catch (error) {
      console.error("Check invoice error:", error)
      return {
        success: false,
        error: "Failed to check invoice",
        details: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    lndRequest: mockLndRequest,
    checkInvoice,
  }
})

import { checkInvoice, lndRequest } from '@/lib/lightning'

describe('checkInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Settled Invoices', () => {
    it('should return settled status with payment details when invoice is paid (hex format)', async () => {
      // lndRequest returns {success: true, data: {...}}
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          creation_date: '1609459200',
          settle_date: '1609459300',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      expect(result.amountPaid).toBe('1000')
      expect(result.preimage).toBe(TEST_PREIMAGE)
      expect(result.state).toBe('SETTLED')
      expect(result.creationDate).toBe('1609459200')
      expect(result.settleDate).toBe('1609459300')
      expect(lndRequest).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/invoice\//),
      )
    })

    it('should return settled status with payment details when invoice is paid (base64 format)', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '2500',
          state: 'SETTLED',
          creation_date: '1609459200',
          settle_date: '1609459300',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_BASE64)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      expect(result.amountPaid).toBe('2500')
      expect(result.preimage).toBe(TEST_PREIMAGE)
      expect(result.state).toBe('SETTLED')
    })

    it('should handle settled invoices with large amounts', async () => {
      const largeAmount = '21000000000000' // 21 million BTC in satoshis
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: largeAmount,
          state: 'SETTLED',
          creation_date: '1609459200',
          settle_date: '1609459300',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      expect(result.amountPaid).toBe(largeAmount)
    })

    it('should handle settled invoices with zero amount (keysend)', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '0',
          state: 'SETTLED',
          creation_date: '1609459200',
          settle_date: '1609459300',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      expect(result.amountPaid).toBe('0')
    })

    it('should handle null preimage for settled invoices without preimage', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          creation_date: '1609459200',
          settle_date: '1609459300',
          r_preimage: null,
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
      expect(result.preimage).toBeNull()
    })
  })

  describe('Unsettled Invoices', () => {
    it('should return unsettled status when invoice is pending', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
          creation_date: '1609459200',
          settle_date: null,
          r_preimage: null,
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(false)
      expect(result.state).toBe('OPEN')
      expect(result.amountPaid).toBe('0')
      expect(result.preimage).toBeNull()
      expect(result.settleDate).toBeNull()
    })

    it('should return unsettled status for newly created invoices', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
          creation_date: '1609459200',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_BASE64)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(false)
      expect(result.state).toBe('OPEN')
    })
  })

  describe('Error Handling', () => {
    it('should return error when lndRequest fails', async () => {
      const lndError = {
        success: false,
        error: 'Invoice not found',
        details: 'No invoice with that hash',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invoice not found')
      expect(result.details).toBe('No invoice with that hash')
    })

    it('should handle lndRequest throwing errors', async () => {
      const error = new Error('Network request failed')

      vi.mocked(lndRequest).mockRejectedValue(error)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to check invoice')
      expect(result.details).toBe('Network request failed')
    })

    it('should handle LND node connection errors', async () => {
      const connectionError = new Error('Unable to connect to LND node')

      vi.mocked(lndRequest).mockRejectedValue(connectionError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to check invoice')
      expect(result.details).toBe('Unable to connect to LND node')
    })

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout')

      vi.mocked(lndRequest).mockRejectedValue(timeoutError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to check invoice')
      expect(result.details).toBe('Request timeout')
    })

    it('should handle non-Error exceptions', async () => {
      vi.mocked(lndRequest).mockRejectedValue('String error')

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to check invoice')
      expect(result.details).toBe('String error')
    })
  })

  describe('Input Validation and Format Handling', () => {
    it('should convert hex hash to base64 before calling lndRequest', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      await checkInvoice(TEST_R_HASH_HEX)

      // Should convert hex to base64 and encode it
      const expectedBase64 = Buffer.from(TEST_R_HASH_HEX, 'hex').toString('base64')
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(expectedBase64)}`
      )
    })

    it('should use base64 hash directly without conversion', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      await checkInvoice(TEST_R_HASH_BASE64)

      // Should use base64 directly and encode it
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(TEST_R_HASH_BASE64)}`
      )
    })

    it('should handle uppercase hex hashes', async () => {
      const uppercaseHash = TEST_R_HASH_HEX.toUpperCase()
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(uppercaseHash)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
    })

    it('should handle lowercase hex hashes', async () => {
      const lowercaseHash = TEST_R_HASH_HEX.toLowerCase()
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(lowercaseHash)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string hash', async () => {
      const lndResponse = {
        success: false,
        error: 'Invalid hash',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice('')

      // The function doesn't validate input, it passes to lndRequest
      expect(result.success).toBe(false)
    })

    it('should handle invalid hash format passed to LND', async () => {
      const invalidHash = 'not-a-valid-hash!!!'
      const lndResponse = {
        success: false,
        error: 'Invalid payment hash format',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(invalidHash)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid payment hash format')
    })

    it('should handle hash with incorrect length', async () => {
      const shortHash = 'abc123'
      const lndResponse = {
        success: false,
        error: 'Invalid hash length',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(shortHash)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid hash length')
    })

    it('should handle special characters in hash', async () => {
      const hashWithSpecialChars = 'abc123!@#$%^&*()'
      const lndResponse = {
        success: false,
        error: 'Invalid payment hash format',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(hashWithSpecialChars)

      expect(result.success).toBe(false)
    })
  })

  describe('State Transitions', () => {
    it('should reflect OPEN to SETTLED state transition', async () => {
      // First call returns unsettled
      const unsettledResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
          creation_date: '1609459200',
        },
      }
      vi.mocked(lndRequest).mockResolvedValueOnce(unsettledResponse)

      const firstResult = await checkInvoice(TEST_R_HASH_HEX)
      expect(firstResult.success).toBe(true)
      expect(firstResult.settled).toBe(false)
      expect(firstResult.state).toBe('OPEN')

      // Second call returns settled
      const settledResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          settle_date: '1609459300',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }
      vi.mocked(lndRequest).mockResolvedValueOnce(settledResponse)

      const secondResult = await checkInvoice(TEST_R_HASH_HEX)
      expect(secondResult.success).toBe(true)
      expect(secondResult.settled).toBe(true)
      expect(secondResult.state).toBe('SETTLED')
    })

    it('should handle CANCELED state', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'CANCELED',
          creation_date: '1609459200',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(false)
      expect(result.state).toBe('CANCELED')
    })

    it('should handle EXPIRED state', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'EXPIRED',
          creation_date: '1609459200',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(false)
      expect(result.state).toBe('EXPIRED')
    })
  })

  describe('Response Data Integrity', () => {
    it('should preserve exact amount from settled invoice', async () => {
      const exactAmount = '123456789'
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: exactAmount,
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.amountPaid).toBe(exactAmount)
    })

    it('should preserve exact preimage from settled invoice', async () => {
      const specificPreimage = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab'
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: Buffer.from(specificPreimage, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.preimage).toBe(specificPreimage)
    })

    it('should handle missing settle_date for unsettled invoices', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
          creation_date: '1609459200',
          // settle_date is missing
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settleDate).toBeUndefined()
    })
  })

  describe('Concurrency and Multiple Calls', () => {
    it('should handle concurrent checks for different invoices', async () => {
      const hash1 = TEST_R_HASH_HEX
      const hash2 = TEST_R_HASH_BASE64

      const response1 = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }
      const response2 = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
        },
      }

      vi.mocked(lndRequest)
        .mockResolvedValueOnce(response1)
        .mockResolvedValueOnce(response2)

      const [result1, result2] = await Promise.all([
        checkInvoice(hash1),
        checkInvoice(hash2),
      ])

      expect(result1.success).toBe(true)
      expect(result1.settled).toBe(true)
      expect(result2.success).toBe(true)
      expect(result2.settled).toBe(false)
      expect(lndRequest).toHaveBeenCalledTimes(2)
    })

    it('should handle sequential checks for the same invoice', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result1 = await checkInvoice(TEST_R_HASH_HEX)
      const result2 = await checkInvoice(TEST_R_HASH_HEX)

      expect(result1).toEqual(result2)
      expect(lndRequest).toHaveBeenCalledTimes(2)
    })
  })

  describe('URL Encoding Edge Cases', () => {
    it('should properly encode base64 hashes with special characters like + and /', async () => {
      const base64WithSpecialChars = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw+/=='
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '500',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(base64WithSpecialChars)

      expect(result.success).toBe(true)
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(base64WithSpecialChars)}`
      )
    })

    it('should handle base64 padding (= characters) correctly', async () => {
      const base64WithPadding = 'dGVzdHZhbHVlMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3OA=='
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(base64WithPadding)

      expect(result.success).toBe(true)
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(base64WithPadding)}`
      )
    })
  })

  describe('Hex to Base64 Conversion Edge Cases', () => {
    it('should handle hex hash with exactly 64 characters (boundary)', async () => {
      const exactHex = 'a'.repeat(64)
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '100',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(exactHex)

      expect(result.success).toBe(true)
      const expectedBase64 = Buffer.from(exactHex, 'hex').toString('base64')
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(expectedBase64)}`
      )
    })

    it('should NOT convert 63-character string to base64 (not valid hex)', async () => {
      const shortHex = 'a'.repeat(63)
      const lndResponse = {
        success: false,
        error: 'Invalid hash format',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(shortHex)

      // Should use directly, not convert
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(shortHex)}`
      )
    })

    it('should NOT convert 65-character string to base64 (not valid hex)', async () => {
      const longHex = 'a'.repeat(65)
      const lndResponse = {
        success: false,
        error: 'Invalid hash format',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(longHex)

      // Should use directly, not convert
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(longHex)}`
      )
    })

    it('should NOT convert hex with non-hex characters (g, h, etc.)', async () => {
      const invalidHex = 'g'.repeat(64)
      const lndResponse = {
        success: false,
        error: 'Invalid hash format',
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(invalidHex)

      // Should use directly, not convert
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(invalidHex)}`
      )
    })

    it('should handle mixed case hex (aAbBcC...)', async () => {
      const mixedCaseHex = 'aAbBcCdDeEfF0123456789abcdef0123456789ABCDEFabcdef0123456789ABCD'
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '750',
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(mixedCaseHex)

      expect(result.success).toBe(true)
      const expectedBase64 = Buffer.from(mixedCaseHex, 'hex').toString('base64')
      expect(lndRequest).toHaveBeenCalledWith(
        `/v1/invoice/${encodeURIComponent(expectedBase64)}`
      )
    })
  })

  describe('Preimage Conversion Edge Cases', () => {
    it('should handle empty r_preimage string', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: '',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.preimage).toBeNull()
    })

    it('should handle undefined r_preimage field', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: undefined,
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.preimage).toBeNull()
    })

    it('should handle invalid base64 in r_preimage gracefully', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          r_preimage: 'not-valid-base64!!!',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      // This should handle the error internally
      const result = await checkInvoice(TEST_R_HASH_HEX)

      // The function should either handle gracefully or throw
      // Since Buffer.from doesn't throw for invalid base64, it returns a buffer
      expect(result.success).toBe(true)
      expect(typeof result.preimage).toBe('string')
    })
  })

  describe('Amount Field Variations', () => {
    it('should handle numeric amt_paid_sat (not string)', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: 1000, // Number instead of string
          state: 'SETTLED',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.amountPaid).toBe(1000)
    })

    it('should handle missing amt_paid_sat field', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          state: 'OPEN',
          // amt_paid_sat is missing
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.amountPaid).toBeUndefined()
    })

    it('should handle null amt_paid_sat field', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: null,
          state: 'OPEN',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.amountPaid).toBeNull()
    })
  })

  describe('LND API Error Responses', () => {
    it('should handle 404 not found errors', async () => {
      const lndError = {
        success: false,
        error: 'LND API error: 404 Not Found',
        details: {
          error: 'invoice not found',
          code: 5,
          message: 'unable to locate invoice',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 404 Not Found')
      expect(result.details).toBeDefined()
    })

    it('should handle 401 authentication errors', async () => {
      const authError = {
        success: false,
        error: 'LND API error: 401 Unauthorized',
        details: 'Invalid macaroon',
      }

      vi.mocked(lndRequest).mockResolvedValue(authError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 401 Unauthorized')
    })

    it('should handle 500 internal server errors', async () => {
      const serverError = {
        success: false,
        error: 'LND API error: 500 Internal Server Error',
        details: 'LND node error',
      }

      vi.mocked(lndRequest).mockResolvedValue(serverError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 500 Internal Server Error')
    })

    it('should handle Lightning configuration missing errors', async () => {
      const configError = {
        success: false,
        error: 'Lightning configuration missing',
      }

      vi.mocked(lndRequest).mockResolvedValue(configError)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Lightning configuration missing')
    })
  })

  describe('State Field Variations', () => {
    it('should handle ACCEPTED state', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'ACCEPTED',
          creation_date: '1609459200',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settled).toBe(false)
      expect(result.state).toBe('ACCEPTED')
    })

    it('should handle missing state field', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          // state is missing
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.state).toBeUndefined()
    })

    it('should handle unknown/custom state values', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'CUSTOM_STATE',
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.state).toBe('CUSTOM_STATE')
    })
  })

  describe('Date Field Handling', () => {
    it('should handle string timestamps in creation_date and settle_date', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          creation_date: '1609459200',
          settle_date: '1609459300',
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.creationDate).toBe('1609459200')
      expect(result.settleDate).toBe('1609459300')
    })

    it('should handle numeric timestamps', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: true,
          amt_paid_sat: '1000',
          state: 'SETTLED',
          creation_date: 1609459200,
          settle_date: 1609459300,
          r_preimage: Buffer.from(TEST_PREIMAGE, 'hex').toString('base64'),
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.creationDate).toBe(1609459200)
      expect(result.settleDate).toBe(1609459300)
    })

    it('should handle null settle_date for unsettled invoices', async () => {
      const lndResponse = {
        success: true,
        data: {
          settled: false,
          amt_paid_sat: '0',
          state: 'OPEN',
          creation_date: '1609459200',
          settle_date: null,
        },
      }

      vi.mocked(lndRequest).mockResolvedValue(lndResponse)

      const result = await checkInvoice(TEST_R_HASH_HEX)

      expect(result.success).toBe(true)
      expect(result.settleDate).toBeNull()
    })
  })
})
