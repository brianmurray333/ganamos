import { NextRequest } from 'next/server'

/**
 * Helper function to create a mock NextRequest with query parameters for invoice-status endpoint
 */
export function createInvoiceStatusRequest(queryParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/invoice-status')
  
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  return new NextRequest(url.toString(), {
    method: 'GET',
  })
}

/**
 * Helper function to create mock settled invoice response from checkInvoice
 */
export function createMockSettledInvoiceResponse(overrides?: {
  amountPaid?: string
  preimage?: string
}) {
  return {
    success: true,
    settled: true,
    amountPaid: overrides?.amountPaid || '1000',
    state: 'SETTLED',
    creationDate: '1609459200',
    settleDate: '1609459300',
    preimage: overrides?.preimage || '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  }
}

/**
 * Helper function to create mock unsettled invoice response from checkInvoice
 */
export function createMockUnsettledInvoiceResponse() {
  return {
    success: true,
    settled: false,
    amountPaid: '0',
    state: 'OPEN',
    creationDate: '1609459200',
    settleDate: undefined,
    preimage: null,
  }
}

/**
 * Helper function to create mock error response from checkInvoice
 */
export function createMockInvoiceErrorResponse(error: string, details?: any) {
  return {
    success: false,
    error,
    details,
  }
}

/**
 * Test constants for invoice hashes
 */
export const TEST_R_HASH_HEX = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
export const TEST_R_HASH_BASE64 = 'obLD1OX2eJASNFZ4kBIjRWeJCrze8SNFZ4kKze8SNFZg=='
export const TEST_PREIMAGE = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
