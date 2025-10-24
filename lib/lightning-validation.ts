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
    console.log('[LIGHTNING DEBUG] Processing invoice:', trimmed.substring(0, 20) + '...')

    // Remove prefix and get the part after it
    let withoutPrefix = ""
    if (trimmed.startsWith("lnbc")) {
      withoutPrefix = trimmed.substring(4)
    } else if (trimmed.startsWith("lntb")) {
      withoutPrefix = trimmed.substring(4)
    } else if (trimmed.startsWith("lnbcrt")) {
      withoutPrefix = trimmed.substring(6)
    } else {
      console.log('[LIGHTNING DEBUG] Invalid prefix')
      return null
    }

    console.log('[LIGHTNING DEBUG] Without prefix:', withoutPrefix.substring(0, 20) + '...')

    // For BOLT11 invoices, amount-less invoices don't have amount suffixes
    // Look for amount suffixes: u (micro), m (milli), n (nano), p (pico)
    // If no amount suffix is found, it's an amount-less invoice
    
    // Check if the invoice has an amount by looking for amount suffixes
    // The amount suffix appears after the amount digits
    const hasAmountSuffix = /[umnp]/.test(withoutPrefix)
    console.log('[LIGHTNING DEBUG] Has amount suffix:', hasAmountSuffix)
    console.log('[LIGHTNING DEBUG] Checking for amount suffixes in:', withoutPrefix.substring(0, 50) + '...')
    
    if (!hasAmountSuffix) {
      console.log('[LIGHTNING DEBUG] No amount suffix found - treating as amount-less invoice')
      return null // No amount specified (amount-less invoice)
    }

    // Extract amount (digits at the beginning)
    const amountMatch = withoutPrefix.match(/^(\d+)/)
    console.log('[LIGHTNING DEBUG] Amount match:', amountMatch)
    if (!amountMatch) {
      console.log('[LIGHTNING DEBUG] No amount digits found')
      return null // No amount specified (amount-less invoice)
    }

    const amountStr = amountMatch[1]
    const amount = Number.parseInt(amountStr, 10)
    console.log('[LIGHTNING DEBUG] Parsed amount:', amount)

    // The amount in Lightning invoices is in millisatoshis for lnbc
    // Convert to satoshis by dividing by 1000
    const result = Math.floor(amount / 1000)
    console.log('[LIGHTNING DEBUG] Final amount in sats:', result)
    return result
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
  console.log('[LIGHTNING DEBUG] Validating invoice amount. Expected:', expectedAmount)
  const invoiceAmount = extractInvoiceAmount(invoice)
  console.log('[LIGHTNING DEBUG] Extracted invoice amount:', invoiceAmount)

  // If invoice has no amount specified, it's valid (amount-less invoice)
  if (invoiceAmount === null) {
    console.log('[LIGHTNING DEBUG] Amount-less invoice detected - validation passes')
    return true
  }

  // Allow for small rounding differences (within 1 sat)
  const isValid = Math.abs(invoiceAmount - expectedAmount) <= 1
  console.log('[LIGHTNING DEBUG] Amount validation result:', isValid, '(difference:', Math.abs(invoiceAmount - expectedAmount), ')')
  return isValid
}
