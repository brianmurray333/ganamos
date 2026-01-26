/**
 * Helper functions for createInvoice unit tests
 * Provides mock factories for LND invoice responses and test constants
 */

/**
 * Helper function to create mock successful LND invoice creation response
 */
export function createMockLndInvoiceResponse(overrides?: {
  paymentRequest?: string
  rHash?: string
  addIndex?: string
}) {
  return {
    success: true,
    data: {
      payment_request: overrides?.paymentRequest || TEST_PAYMENT_REQUEST,
      r_hash: overrides?.rHash || TEST_R_HASH_BASE64, // LND returns base64
      add_index: overrides?.addIndex || '1',
    },
  }
}

/**
 * Helper function to create mock successful LND invoice response with r_hash_str
 */
export function createMockLndInvoiceResponseWithHexHash(overrides?: {
  paymentRequest?: string
  rHashStr?: string
  addIndex?: string
}) {
  return {
    success: true,
    data: {
      payment_request: overrides?.paymentRequest || TEST_PAYMENT_REQUEST,
      r_hash_str: overrides?.rHashStr || TEST_R_HASH_HEX,
      add_index: overrides?.addIndex || '1',
    },
  }
}

/**
 * Helper function to create mock LND configuration error response
 */
export function createMockLndConfigError() {
  return {
    success: false,
    error: 'Lightning configuration missing',
  }
}

/**
 * Helper function to create mock LND API error response
 */
export function createMockLndApiError(status: number, statusText: string, details?: any) {
  return {
    success: false,
    error: `LND API error: ${status} ${statusText}`,
    details: details || { status, message: statusText },
  }
}

/**
 * Helper function to create mock LND network error response
 */
export function createMockLndNetworkError(message: string = 'Connection refused') {
  return {
    success: false,
    error: 'Failed to communicate with Lightning node',
    details: message,
  }
}

/**
 * Helper function to create mock expected createInvoice success response
 */
export function createExpectedInvoiceResponse(overrides?: {
  paymentRequest?: string
  rHash?: string
  addIndex?: string
}) {
  return {
    success: true,
    paymentRequest: overrides?.paymentRequest || TEST_PAYMENT_REQUEST,
    rHash: overrides?.rHash || TEST_R_HASH_HEX, // createInvoice returns hex format
    addIndex: overrides?.addIndex || '1',
  }
}

/**
 * Test constants for invoice creation
 */
export const TEST_PAYMENT_REQUEST = 'lnbc1000n1p0test123mockpaymentrequest456789abcdef'
export const TEST_R_HASH_HEX = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
export const TEST_R_HASH_BASE64 = 'obLD1OX2eJASNFZ4kBIjRWeJCrze8SNFZg==' // Not exact match, but represents base64 format
export const TEST_ADD_INDEX = '12345'
export const TEST_INVOICE_VALUE = 1000
export const TEST_INVOICE_MEMO = 'Test invoice memo'
export const TEST_EXPIRY = '3600' // 1 hour default