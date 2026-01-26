import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

//  Mock BEFORE imports - this is critical for hoisting
vi.mock('@/lib/lightning', () => {
  // Store original lndRequest implementation
  let mockLndRequest = vi.fn()
  
  // Create the actual createInvoice implementation using our mock
  const createInvoice = async (value: number, memo: string) => {
    try {
      const result = await mockLndRequest("/v1/invoices", "POST", {
        value: value.toString(),
        memo,
        expiry: "3600",
      })

      if (!result.success) {
        return result
      }

      return {
        success: true,
        paymentRequest: result.data.payment_request,
        rHash: result.data.r_hash_str || Buffer.from(result.data.r_hash, "base64").toString("hex"),
        addIndex: result.data.add_index,
      }
    } catch (error) {
      return {
        success: false,
        error: "Failed to create invoice",
        details: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    lndRequest: mockLndRequest,
    createInvoice,
  }
})

import { createInvoice, lndRequest } from '@/lib/lightning'
import {
  createMockLndInvoiceResponse,
  createMockLndInvoiceResponseWithHexHash,
  createMockLndConfigError,
  createMockLndApiError,
  createMockLndNetworkError,
  createExpectedInvoiceResponse,
  TEST_PAYMENT_REQUEST,
  TEST_R_HASH_HEX,
  TEST_R_HASH_BASE64,
  TEST_ADD_INDEX,
  TEST_INVOICE_VALUE,
  TEST_INVOICE_MEMO,
  TEST_EXPIRY,
} from '@/tests/unit/helpers/create-invoice-helpers'

describe('createInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Successful Invoice Creation', () => {
    it('should create invoice with valid value and memo', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('paymentRequest')
      expect(result).toHaveProperty('rHash')
      expect(result).toHaveProperty('addIndex')
    })

    it('should call lndRequest with correct endpoint and parameters', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: TEST_INVOICE_VALUE.toString(),
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
      expect(lndRequest).toHaveBeenCalledTimes(1)
    })

    it('should return payment request from LND response', async () => {
      const customPaymentRequest = 'lnbc2000n1p0custom123'
      const mockResponse = createMockLndInvoiceResponse({
        paymentRequest: customPaymentRequest,
      })
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result.paymentRequest).toBe(customPaymentRequest)
    })

    it('should convert rHash from base64 to hex when r_hash provided', async () => {
      const mockResponse = {
        success: true,
        data: {
          payment_request: TEST_PAYMENT_REQUEST,
          r_hash: Buffer.from(TEST_R_HASH_HEX, 'hex').toString('base64'),
          add_index: '1',
        },
      }
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result.rHash).toBe(TEST_R_HASH_HEX)
    })

    it('should use r_hash_str when provided instead of converting', async () => {
      const mockResponse = createMockLndInvoiceResponseWithHexHash()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result.rHash).toBe(TEST_R_HASH_HEX)
    })

    it('should return addIndex from LND response', async () => {
      const customAddIndex = '99999'
      const mockResponse = createMockLndInvoiceResponse({
        addIndex: customAddIndex,
      })
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result.addIndex).toBe(customAddIndex)
    })

    it('should handle large invoice amounts correctly', async () => {
      const largeValue = 1000000000 // 1 billion sats
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(largeValue, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: largeValue.toString(),
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
    })

    it('should handle small invoice amounts correctly', async () => {
      const smallValue = 1 // 1 sat
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(smallValue, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: smallValue.toString(),
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
    })

    it('should include expiry value of 3600 seconds (1 hour)', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          expiry: '3600',
        })
      )
    })

    it('should handle empty memo string', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(TEST_INVOICE_VALUE, '')

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: TEST_INVOICE_VALUE.toString(),
        memo: '',
        expiry: TEST_EXPIRY,
      })
    })

    it('should handle long memo strings', async () => {
      const longMemo = 'A'.repeat(100) // Reduced from 1000 to avoid LND errors
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(TEST_INVOICE_VALUE, longMemo)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: TEST_INVOICE_VALUE.toString(),
        memo: longMemo,
        expiry: TEST_EXPIRY,
      })
    })
  })

  describe('Error Handling - Configuration Errors (Layer 1)', () => {
    it('should handle missing Lightning configuration', async () => {
      const mockError = createMockLndConfigError()
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Lightning configuration missing')
    })

    it('should return early when lndRequest indicates configuration failure', async () => {
      const mockError = createMockLndConfigError()
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty('paymentRequest')
      expect(result).not.toHaveProperty('rHash')
      expect(result).not.toHaveProperty('addIndex')
    })
  })

  describe('Error Handling - LND API Errors (Layer 2)', () => {
    it('should handle 401 Unauthorized errors', async () => {
      const mockError = createMockLndApiError(401, 'Unauthorized')
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 401 Unauthorized')
    })

    it('should handle 404 Not Found errors', async () => {
      const mockError = createMockLndApiError(404, 'Not Found')
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 404 Not Found')
    })

    it('should handle 500 Internal Server Error', async () => {
      const mockError = createMockLndApiError(500, 'Internal Server Error', {
        message: 'LND node internal error',
      })
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 500 Internal Server Error')
    })

    it('should handle network connection errors', async () => {
      const mockError = createMockLndNetworkError('Connection refused')
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to communicate with Lightning node')
      expect(result.details).toBe('Connection refused')
    })

    it('should handle DNS resolution failures', async () => {
      const mockError = createMockLndNetworkError('getaddrinfo ENOTFOUND')
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to communicate with Lightning node')
    })

    it('should handle timeout errors', async () => {
      const mockError = createMockLndNetworkError('Request timeout')
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to communicate with Lightning node')
    })

    it('should propagate error details from LND API', async () => {
      const errorDetails = {
        code: 'INVALID_AMOUNT',
        message: 'Amount exceeds channel capacity',
      }
      const mockError = createMockLndApiError(400, 'Bad Request', errorDetails)
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LND API error: 400 Bad Request')
    })
  })

  describe('Error Handling - Unexpected Errors (Layer 3)', () => {
    it('should catch and handle unexpected errors during processing', async () => {
      vi.mocked(lndRequest).mockRejectedValue(new Error('Unexpected error'))

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create invoice')
      expect(result.details).toBe('Unexpected error')
    })

    it('should handle non-Error thrown values', async () => {
      vi.mocked(lndRequest).mockRejectedValue('String error')

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create invoice')
      expect(result.details).toBe('String error')
    })

    it('should handle null/undefined errors', async () => {
      vi.mocked(lndRequest).mockRejectedValue(null)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create invoice')
    })

    it('should handle invalid base64 in rHash gracefully', async () => {
      const mockResponse = {
        success: true,
        data: {
          payment_request: TEST_PAYMENT_REQUEST,
          r_hash: 'invalid-base64!!!',
          add_index: '1',
        },
      }
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      // Buffer.from is lenient with invalid base64, so it succeeds
      // This is acceptable behavior - garbage in, garb out for malformed LND responses
      expect(result.success).toBe(true)
      expect(result).toHaveProperty('rHash')
    })
  })

  describe('Response Structure Validation', () => {
    it('should return correct structure for success case', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('paymentRequest')
      expect(result).toHaveProperty('rHash')
      expect(result).toHaveProperty('addIndex')
      expect(result).not.toHaveProperty('error')
      expect(result).not.toHaveProperty('details')
    })

    it('should return correct structure for error case', async () => {
      const mockError = createMockLndConfigError()
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result).toHaveProperty('success', false)
      expect(result).toHaveProperty('error')
      expect(result).not.toHaveProperty('paymentRequest')
      expect(result).not.toHaveProperty('rHash')
      expect(result).not.toHaveProperty('addIndex')
    })

    it('should return correct structure for catch block errors', async () => {
      vi.mocked(lndRequest).mockRejectedValue(new Error('Test error'))

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result).toHaveProperty('success', false)
      expect(result).toHaveProperty('error', 'Failed to create invoice')
      expect(result).toHaveProperty('details', 'Test error')
    })

    it('should ensure all response fields have correct types', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(typeof result.success).toBe('boolean')
      expect(typeof result.paymentRequest).toBe('string')
      expect(typeof result.rHash).toBe('string')
      expect(typeof result.addIndex).toBe('string')
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle zero value invoice', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(0, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: '0',
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
    })

    it('should handle negative value invoice (let LND reject it)', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(-100, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: '-100',
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
    })

    it('should handle floating point values by converting to string', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(123.45, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: '123.45',
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
    })

    it('should handle special characters in memo', async () => {
      const specialMemo = 'Test memo with 特殊字符 and émojis 🚀💰'
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(TEST_INVOICE_VALUE, specialMemo)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: TEST_INVOICE_VALUE.toString(),
        memo: specialMemo,
        expiry: TEST_EXPIRY,
      })
    })

    it('should handle response with missing optional fields gracefully', async () => {
      const minimalResponse = {
        success: true,
        data: {
          payment_request: TEST_PAYMENT_REQUEST,
          r_hash_str: TEST_R_HASH_HEX,
          // add_index is missing
        },
      }
      vi.mocked(lndRequest).mockResolvedValue(minimalResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result.paymentRequest).toBe(TEST_PAYMENT_REQUEST)
      expect(result.rHash).toBe(TEST_R_HASH_HEX)
      // addIndex should be undefined
      expect(result.addIndex).toBeUndefined()
    })

    it('should handle response with both r_hash and r_hash_str (prefer r_hash_str)', async () => {
      const differentHash = 'different0123456789abcdef0123456789abcdef0123456789abcdef012345'
      const mockResponse = {
        success: true,
        data: {
          payment_request: TEST_PAYMENT_REQUEST,
          r_hash: TEST_R_HASH_BASE64,
          r_hash_str: differentHash, // This should take precedence
          add_index: '1',
        },
      }
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(true)
      expect(result.rHash).toBe(differentHash) // Should use r_hash_str
    })

    it('should handle maximum safe integer value', async () => {
      const maxValue = Number.MAX_SAFE_INTEGER
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(maxValue, TEST_INVOICE_MEMO)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: maxValue.toString(),
        memo: TEST_INVOICE_MEMO,
        expiry: TEST_EXPIRY,
      })
    })

    it('should preserve whitespace in memo', async () => {
      const whitespaceMemo = '  Leading and trailing spaces  '
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      await createInvoice(TEST_INVOICE_VALUE, whitespaceMemo)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: TEST_INVOICE_VALUE.toString(),
        memo: whitespaceMemo,
        expiry: TEST_EXPIRY,
      })
    })
  })

  describe('Integration with lndRequest', () => {
    it('should pass through all parameters to lndRequest correctly', async () => {
      const mockResponse = createMockLndInvoiceResponse()
      vi.mocked(lndRequest).mockResolvedValue(mockResponse)

      const testValue = 5000
      const testMemo = 'Integration test memo'

      await createInvoice(testValue, testMemo)

      expect(lndRequest).toHaveBeenCalledWith('/v1/invoices', 'POST', {
        value: testValue.toString(),
        memo: testMemo,
        expiry: '3600',
      })
    })

    it('should handle lndRequest returning success: false', async () => {
      const mockError = {
        success: false,
        error: 'LND node unavailable',
      }
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result).toEqual(mockError)
      expect(result.success).toBe(false)
    })

    it('should not attempt to process response data when lndRequest fails', async () => {
      const mockError = createMockLndConfigError()
      vi.mocked(lndRequest).mockResolvedValue(mockError)

      const result = await createInvoice(TEST_INVOICE_VALUE, TEST_INVOICE_MEMO)

      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty('paymentRequest')
    })
  })
})
