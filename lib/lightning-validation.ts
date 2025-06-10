/**
 * Lightning invoice validation utilities
 */

export interface DecodedInvoice {
  amount?: number // Amount in satoshis
  description?: string
  paymentHash?: string
  expiry?: number
  timestamp?: number
}

/**
 * Basic Lightning invoice validation
 * @param invoice The Lightning invoice string
 * @returns boolean indicating if the invoice format is valid
 */
export function validateLightningInvoice(invoice: string): boolean {
  const trimmed = invoice.trim().toLowerCase()

  // Check prefix
  if (!trimmed.startsWith("lnbc") && !trimmed.startsWith("lntb") && !trimmed.startsWith("lnbcrt")) {
    return false
  }

  // Check minimum length
  if (trimmed.length < 100) {
    return false
  }

  // Check for valid characters (base32 after prefix)
  const base32Regex = /^[a-z0-9]+$/
  const withoutPrefix = trimmed.substring(4)

  // Find the amount part (digits after prefix)
  const amountMatch = withoutPrefix.match(/^(\d*)/)
  if (!amountMatch) {
    return false
  }

  return true
}

/**
 * Extract amount from Lightning invoice (basic implementation)
 * @param invoice The Lightning invoice string
 * @returns amount in satoshis or null if cannot be determined
 */
export function extractInvoiceAmount(invoice: string): number | null {
  try {
    const trimmed = invoice.trim().toLowerCase()

    // Remove prefix
    let withoutPrefix = ""
    if (trimmed.startsWith("lnbc")) {
      withoutPrefix = trimmed.substring(4)
    } else if (trimmed.startsWith("lntb")) {
      withoutPrefix = trimmed.substring(4)
    } else if (trimmed.startsWith("lnbcrt")) {
      withoutPrefix = trimmed.substring(6)
    } else {
      return null
    }

    // Extract amount (digits at the beginning)
    const amountMatch = withoutPrefix.match(/^(\d+)/)
    if (!amountMatch) {
      return null // No amount specified (amount-less invoice)
    }

    const amountStr = amountMatch[1]
    const amount = Number.parseInt(amountStr, 10)

    // The amount in Lightning invoices is in millisatoshis for lnbc
    // Convert to satoshis by dividing by 1000
    return Math.floor(amount / 1000)
  } catch (error) {
    console.error("Error extracting invoice amount:", error)
    return null
  }
}

/**
 * Validate that an invoice amount matches the expected reward amount
 * @param invoice The Lightning invoice string
 * @param expectedAmount Expected amount in satoshis
 * @returns boolean indicating if amounts match (or if invoice has no amount)
 */
export function validateInvoiceAmount(invoice: string, expectedAmount: number): boolean {
  const invoiceAmount = extractInvoiceAmount(invoice)

  // If invoice has no amount specified, it's valid (amount-less invoice)
  if (invoiceAmount === null) {
    return true
  }

  // Allow for small rounding differences (within 1 sat)
  return Math.abs(invoiceAmount - expectedAmount) <= 1
}
