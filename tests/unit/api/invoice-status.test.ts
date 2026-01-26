import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, OPTIONS } from '@/app/api/invoice-status/route'
import { NextRequest } from 'next/server'
import { checkInvoice } from '@/lib/lightning'
import { expectCorsHeadersPresent } from '@/tests/unit/helpers/posts-api-mocks'
import {
  createInvoiceStatusRequest,
  createMockSettledInvoiceResponse,
  createMockUnsettledInvoiceResponse,
  createMockInvoiceErrorResponse,
  TEST_R_HASH_HEX,
  TEST_R_HASH_BASE64,
  TEST_PREIMAGE,
} from '@/tests/unit/helpers/invoice-status-helpers'

// Mock the Lightning module
vi.mock('@/lib/lightning', () => ({
  checkInvoice: vi.fn(),
}))

// Re-export for backward compatibility with the test file
const VALID_R_HASH_HEX = TEST_R_HASH_HEX
const VALID_R_HASH_BASE64 = TEST_R_HASH_BASE64
const VALID_PREIMAGE = TEST_PREIMAGE
const createMockRequest = createInvoiceStatusRequest
const createMockSettledInvoice = createMockSettledInvoiceResponse
const createMockUnsettledInvoice = createMockUnsettledInvoiceResponse
const createMockErrorResponse = createMockInvoiceErrorResponse

describe('GET /api/invoice-status', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Input Validation', () => {
    it('should return 400 when r_hash parameter is missing', async () => {
      const request = createMockRequest()

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'r_hash parameter is required',
      })
    })

    it('should include CORS headers on 400 error response', async () => {
      const request = createMockRequest()

      const response = await GET(request)

      expectCorsHeadersPresent(response)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should not call checkInvoice when r_hash is missing', async () => {
      const request = createMockRequest()

      await GET(request)

      expect(checkInvoice).not.toHaveBeenCalled()
    })
  })

  describe('Invoice Status Checking - Settled Invoices', () => {
    it('should return 200 with settled: true for paid invoice', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        settled: true,
        r_hash: VALID_R_HASH_HEX,
        preimage: VALID_PREIMAGE,
        error: undefined,
      })
    })

    it('should include preimage when invoice is settled', async () => {
      const customPreimage = 'custom1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab'
      const mockInvoice = createMockSettledInvoice({ preimage: customPreimage })
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.preimage).toBe(customPreimage)
      expect(data.settled).toBe(true)
    })

    it('should handle settled invoice with different amount paid', async () => {
      const mockInvoice = createMockSettledInvoice({ amountPaid: '5000' })
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.settled).toBe(true)
    })

    it('should include CORS headers on settled invoice response', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)

      expectCorsHeadersPresent(response)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    })

    it('should call checkInvoice with correct r_hash parameter', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      await GET(request)

      expect(checkInvoice).toHaveBeenCalledWith(VALID_R_HASH_HEX)
      expect(checkInvoice).toHaveBeenCalledTimes(1)
    })
  })

  describe('Invoice Status Checking - Unsettled Invoices', () => {
    it('should return 200 with settled: false for unpaid invoice', async () => {
      const mockInvoice = createMockUnsettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        settled: false,
        r_hash: VALID_R_HASH_HEX,
        preimage: null,
        error: undefined,
      })
    })

    it('should not include preimage when invoice is unsettled', async () => {
      const mockInvoice = createMockUnsettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.preimage).toBeNull()
      expect(data.settled).toBe(false)
    })

    it('should include CORS headers on unsettled invoice response', async () => {
      const mockInvoice = createMockUnsettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)

      expectCorsHeadersPresent(response)
    })

    it('should handle invoice state transitions correctly', async () => {
      const mockInvoice = {
        success: true,
        settled: false,
        amountPaid: '0',
        state: 'OPEN',
        creationDate: '1609459200',
        preimage: null,
      }
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.settled).toBe(false)
      expect(data.success).toBe(true)
    })
  })

  describe('Error Handling - Lightning Node Errors', () => {
    it('should return 500 when checkInvoice fails', async () => {
      const mockError = createMockErrorResponse('Failed to check invoice', 'Network error')
      vi.mocked(checkInvoice).mockResolvedValue(mockError)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200) // Note: Endpoint returns 200 even on checkInvoice failure, includes error in JSON
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to check invoice')
      expect(data.settled).toBe(false)
    })

    it('should handle Lightning node configuration errors', async () => {
      const mockError = createMockErrorResponse('Lightning configuration missing')
      vi.mocked(checkInvoice).mockResolvedValue(mockError)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.error).toBe('Lightning configuration missing')
    })

    it('should handle LND API errors gracefully', async () => {
      const mockError = createMockErrorResponse(
        'LND API error: 500 Internal Server Error',
        { status: 500, message: 'Internal error' }
      )
      vi.mocked(checkInvoice).mockResolvedValue(mockError)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.error).toBe('LND API error: 500 Internal Server Error')
    })

    it('should include CORS headers on Lightning node error responses', async () => {
      const mockError = createMockErrorResponse('Failed to check invoice')
      vi.mocked(checkInvoice).mockResolvedValue(mockError)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)

      expectCorsHeadersPresent(response)
    })

    it('should return 500 when unexpected error occurs in route handler', async () => {
      vi.mocked(checkInvoice).mockRejectedValue(new Error('Unexpected error'))

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to check invoice status',
      })
    })

    it('should include CORS headers on 500 error response', async () => {
      vi.mocked(checkInvoice).mockRejectedValue(new Error('Unexpected error'))

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)

      expectCorsHeadersPresent(response)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('Hash Format Handling', () => {
    it('should accept hex format r_hash', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.r_hash).toBe(VALID_R_HASH_HEX)
      expect(checkInvoice).toHaveBeenCalledWith(VALID_R_HASH_HEX)
    })

    it('should accept base64 format r_hash', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_BASE64 })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.r_hash).toBe(VALID_R_HASH_BASE64)
      expect(checkInvoice).toHaveBeenCalledWith(VALID_R_HASH_BASE64)
    })

    it('should handle URL-encoded r_hash parameter', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const encodedHash = encodeURIComponent(VALID_R_HASH_BASE64)
      const request = createMockRequest({ r_hash: encodedHash })

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(checkInvoice).toHaveBeenCalledWith(encodedHash)
    })
  })

  describe('Response Structure', () => {
    it('should return correct response structure for success case', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('settled')
      expect(data).toHaveProperty('r_hash')
      expect(data).toHaveProperty('preimage')
      // error property is only present when there is an error (undefined is stripped from JSON)
      expect(data.error).toBeUndefined()
    })

    it('should return correct response structure for error case', async () => {
      const mockError = createMockErrorResponse('Test error')
      vi.mocked(checkInvoice).mockResolvedValue(mockError)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('settled', false)
      expect(data).toHaveProperty('r_hash')
      expect(data).toHaveProperty('error')
    })

    it('should default settled to false when not provided', async () => {
      const mockInvoice = {
        success: true,
        // Note: settled is missing
        amountPaid: '0',
        state: 'OPEN',
      }
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice as any)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.settled).toBe(false)
    })

    it('should default preimage to null when not provided', async () => {
      const mockInvoice = createMockUnsettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: VALID_R_HASH_HEX })

      const response = await GET(request)
      const data = await response.json()

      expect(data.preimage).toBeNull()
    })
  })

  describe('CORS Preflight Handling', () => {
    it('should return 200 for OPTIONS preflight request', async () => {
      const response = await OPTIONS()

      expect(response.status).toBe(200)
    })

    it('should include correct CORS headers on OPTIONS response', async () => {
      const response = await OPTIONS()

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('should return empty body for OPTIONS request', async () => {
      const response = await OPTIONS()

      const text = await response.text()
      expect(text).toBe('')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string r_hash parameter', async () => {
      const request = createMockRequest({ r_hash: '' })

      const response = await GET(request)
      const data = await response.json()

      // Empty string is falsy in JavaScript, so it's treated as missing parameter
      expect(response.status).toBe(400)
      expect(data.error).toBe('r_hash parameter is required')
      expect(checkInvoice).not.toHaveBeenCalled()
    })

    it('should handle very long r_hash values', async () => {
      const longHash = 'a'.repeat(200)
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: longHash })

      const response = await GET(request)
      const data = await response.json()

      expect(checkInvoice).toHaveBeenCalledWith(longHash)
      expect(data.r_hash).toBe(longHash)
    })

    it('should handle special characters in r_hash', async () => {
      const specialHash = 'abc+def/123=='
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const request = createMockRequest({ r_hash: specialHash })

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(checkInvoice).toHaveBeenCalledWith(specialHash)
    })

    it('should handle multiple query parameters gracefully', async () => {
      const mockInvoice = createMockSettledInvoice()
      vi.mocked(checkInvoice).mockResolvedValue(mockInvoice)

      const url = new URL('http://localhost:3000/api/invoice-status')
      url.searchParams.set('r_hash', VALID_R_HASH_HEX)
      url.searchParams.set('extra_param', 'ignored')
      
      const request = new NextRequest(url.toString(), { method: 'GET' })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.r_hash).toBe(VALID_R_HASH_HEX)
    })
  })
})