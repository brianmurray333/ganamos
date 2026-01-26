import { vi } from 'vitest'
import type { Macaroon, L402Challenge } from '@/lib/l402'
import * as lightning from '@/lib/lightning'

/**
 * Mock a successful invoice creation with the provided parameters
 */
export function mockSuccessfulInvoice(
  paymentRequest: string = 'lnbc10n1pj9x7xmpp5test',
  rHash: string = 'hash-123',
  addIndex: string = '12345'
) {
  vi.mocked(lightning.createInvoice).mockResolvedValue({
    success: true,
    paymentRequest,
    rHash,
    addIndex,
  })
}

/**
 * Mock a failed invoice creation with the provided error
 */
export function mockFailedInvoice(error: string = 'Invoice creation failed') {
  vi.mocked(lightning.createInvoice).mockResolvedValue({
    success: false,
    error,
  })
}

/**
 * Mock invoice creation to throw an exception
 */
export function mockInvoiceException(errorMessage: string = 'Connection timeout') {
  vi.mocked(lightning.createInvoice).mockRejectedValue(new Error(errorMessage))
}

/**
 * Decode a base64-encoded macaroon from an L402 challenge
 */
export function decodeMacaroon(challenge: L402Challenge): Macaroon {
  const decoded = Buffer.from(challenge.macaroon, 'base64').toString('utf8')
  return JSON.parse(decoded)
}

/**
 * Find a specific caveat by condition from a macaroon
 */
export function findCaveat(macaroon: Macaroon, condition: string) {
  return macaroon.caveats.find((c) => c.condition === condition)
}
