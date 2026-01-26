/**
 * L402 (Lightning HTTP 402 Protocol) implementation
 * Based on the L402 specification: https://docs.lightning.engineering/the-lightning-network/l402
 * 
 * L402 combines Macaroons for authentication with Lightning payments for authorization.
 * The flow is:
 * 1. Client makes request without L402 token
 * 2. Server responds with 402 Payment Required + Lightning invoice + Macaroon
 * 3. Client pays Lightning invoice, getting preimage
 * 4. Client makes request with L402 token (Macaroon + preimage)
 * 5. Server validates token and processes request
 */

import crypto from 'crypto'
import { createInvoice, checkInvoice } from './lightning'

// Simple macaroon implementation for L402
// In production, you'd want to use a proper macaroon library
export interface Macaroon {
  identifier: string
  location: string
  signature: string
  caveats: Caveat[]
}

export interface Caveat {
  condition: string
  value: string
}

export interface L402Challenge {
  macaroon: string // Base64 encoded macaroon
  invoice: string  // Lightning payment request
}

export interface L402Token {
  macaroon: string // Base64 encoded macaroon
  preimage: string // Payment preimage (hex)
}

/**
 * Create a simple macaroon for L402
 * This is a simplified implementation - in production use a proper macaroon library
 */
export function createMacaroon(identifier: string, location: string, rootKey: string, caveats: Caveat[] = []): Macaroon {
  // Simple signature based on identifier + location + root key
  const data = identifier + location + rootKey + JSON.stringify(caveats)
  const signature = crypto.createHmac('sha256', rootKey).update(data).digest('hex')
  
  return {
    identifier,
    location,
    signature,
    caveats
  }
}

/**
 * Verify a macaroon signature
 */
export function verifyMacaroon(macaroon: Macaroon, rootKey: string): boolean {
  const data = macaroon.identifier + macaroon.location + rootKey + JSON.stringify(macaroon.caveats)
  const expectedSignature = crypto.createHmac('sha256', rootKey).update(data).digest('hex')
  return macaroon.signature === expectedSignature
}

/**
 * Create an L402 challenge (402 Payment Required response)
 * @param amount Amount in satoshis
 * @param memo Description for the invoice
 * @param service Service identifier (e.g., "ganamos-posts")
 * @returns L402 challenge with macaroon and invoice
 */
export async function createL402Challenge(
  amount: number,
  memo: string,
  service: string = "ganamos-api"
): Promise<{ success: boolean; challenge?: L402Challenge; error?: string }> {
  try {
    // Create Lightning invoice
    const invoiceResult = await createInvoice(amount, memo)
    if (!invoiceResult.success) {
      return { success: false, error: invoiceResult.error }
    }

    // Create macaroon with payment hash as identifier
    const rootKey = process.env.L402_ROOT_KEY || 'default-root-key-change-in-production'
    const identifier = invoiceResult.rHash! // Payment hash
    const location = service
    
    // Add caveats for this specific use case
    const caveats: Caveat[] = [
      { condition: 'action', value: 'create_post' },
      { condition: 'amount', value: amount.toString() },
      { condition: 'expires', value: (Date.now() + 3600000).toString() } // 1 hour from now
    ]

    const macaroon = createMacaroon(identifier, location, rootKey, caveats)
    const macaroonBase64 = Buffer.from(JSON.stringify(macaroon)).toString('base64')

    return {
      success: true,
      challenge: {
        macaroon: macaroonBase64,
        invoice: invoiceResult.paymentRequest!
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create L402 challenge'
    }
  }
}

/**
 * Verify an L402 token
 * @param token L402 token with macaroon and preimage
 * @returns Verification result with payment hash if valid
 */
export async function verifyL402Token(token: L402Token): Promise<{
  success: boolean
  paymentHash?: string
  error?: string
  macaroon?: Macaroon
}> {
  try {
    // Decode macaroon
    const macaroonData = Buffer.from(token.macaroon, 'base64').toString('utf8')
    const macaroon: Macaroon = JSON.parse(macaroonData)

    // Verify macaroon signature
    const rootKey = process.env.L402_ROOT_KEY || 'default-root-key-change-in-production'
    if (!verifyMacaroon(macaroon, rootKey)) {
      return { success: false, error: 'Invalid macaroon signature' }
    }

    // Check expiry caveat
    const expiryCaveat = macaroon.caveats.find(c => c.condition === 'expires')
    if (expiryCaveat && parseInt(expiryCaveat.value) < Date.now()) {
      return { success: false, error: 'L402 token expired' }
    }

    // Verify that the preimage corresponds to the payment hash (macaroon identifier)
    const paymentHash = macaroon.identifier
    const preimageHash = crypto.createHash('sha256').update(Buffer.from(token.preimage, 'hex')).digest('hex')
    
    if (preimageHash !== paymentHash) {
      return { success: false, error: 'Preimage does not match payment hash' }
    }

    // Check if the invoice was actually paid
    const invoiceStatus = await checkInvoice(paymentHash)
    if (!invoiceStatus.success || !invoiceStatus.settled) {
      return { success: false, error: 'Invoice not paid' }
    }

    return {
      success: true,
      paymentHash,
      macaroon
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify L402 token'
    }
  }
}

/**
 * Parse L402 token from Authorization header
 * Format: "L402 <macaroon>:<preimage>"
 */
export function parseL402Header(authHeader: string): L402Token | null {
  if (!authHeader.startsWith('L402 ')) {
    return null
  }

  const token = authHeader.substring(5) // Remove "L402 " prefix
  const [macaroon, preimage] = token.split(':')
  
  if (!macaroon || !preimage) {
    return null
  }

  return { macaroon, preimage }
}

/**
 * Create L402 response headers for 402 Payment Required
 */
export function createL402Headers(challenge: L402Challenge): Record<string, string> {
  return {
    'WWW-Authenticate': `L402 macaroon="${challenge.macaroon}", invoice="${challenge.invoice}"`,
    'Content-Type': 'application/json'
  }
}
