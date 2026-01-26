/**
 * Lightning invoice validation utilities
 * BOLT11 invoice parsing for amount, description, and display
 */

export interface DecodedInvoice {
  amount: number | null // Amount in satoshis, null if "any amount" invoice
  description: string | null // Invoice memo/description
  paymentHash: string | null
  expiry: number | null
  timestamp: number | null
  isValid: boolean
}

// Bech32 character set for BOLT11
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

/**
 * Convert bech32 characters to 5-bit values
 */
function bech32ToFiveBit(str: string): number[] {
  const result: number[] = []
  for (const char of str.toLowerCase()) {
    const index = BECH32_CHARSET.indexOf(char)
    if (index === -1) return []
    result.push(index)
  }
  return result
}

/**
 * Convert 5-bit array to 8-bit bytes
 */
function fiveBitToBytes(fiveBit: number[]): Uint8Array {
  let bits = 0
  let value = 0
  const result: number[] = []
  
  for (const v of fiveBit) {
    value = (value << 5) | v
    bits += 5
    while (bits >= 8) {
      bits -= 8
      result.push((value >> bits) & 0xff)
    }
  }
  return new Uint8Array(result)
}

/**
 * Decode a BOLT11 Lightning invoice
 * @param invoice The Lightning invoice string
 * @returns DecodedInvoice with amount, description, etc.
 */
export function decodeLightningInvoice(invoice: string): DecodedInvoice {
  const result: DecodedInvoice = {
    amount: null,
    description: null,
    paymentHash: null,
    expiry: null,
    timestamp: null,
    isValid: false,
  }

  try {
    const trimmed = invoice.trim().toLowerCase()

    // Check prefix (lnbc = mainnet, lntb = testnet, lnbcrt = regtest)
    let prefix = ''
    if (trimmed.startsWith('lnbcrt')) {
      prefix = 'lnbcrt'
    } else if (trimmed.startsWith('lnbc')) {
      prefix = 'lnbc'
    } else if (trimmed.startsWith('lntb')) {
      prefix = 'lntb'
    } else {
      return result
    }

    // Find the separator '1' - the LAST '1' in the invoice is the separator
    // because bech32 charset (used for the data part) doesn't include '1'
    // The amount portion can contain '1' (e.g., lnbc100u1...), so we use lastIndexOf
    const separatorIndex = trimmed.lastIndexOf('1')
    if (separatorIndex === -1 || separatorIndex <= prefix.length) return result

    // Extract amount string (between prefix and '1')
    const amountPart = trimmed.substring(prefix.length, separatorIndex)
    result.amount = parseInvoiceAmount(amountPart)

    // Everything after '1' is the data part (bech32 encoded)
    const dataPart = trimmed.substring(separatorIndex + 1)
    
    // The last 104 characters are the signature (520 bits = 104 bech32 chars)
    // Before that is the recovery flag (1 char)
    // The rest is timestamp + tagged fields
    if (dataPart.length < 105) return result
    
    const dataWithoutSig = dataPart.substring(0, dataPart.length - 104)
    const fiveBitData = bech32ToFiveBit(dataWithoutSig)
    if (fiveBitData.length < 7) return result

    // First 7 five-bit values (35 bits) are the timestamp
    let timestamp = 0
    for (let i = 0; i < 7; i++) {
      timestamp = timestamp * 32 + fiveBitData[i]
    }
    result.timestamp = timestamp

    // Parse tagged fields (after timestamp)
    let pos = 7
    while (pos + 3 <= fiveBitData.length) {
      const tag = fiveBitData[pos]
      const dataLength = fiveBitData[pos + 1] * 32 + fiveBitData[pos + 2]
      pos += 3

      if (pos + dataLength > fiveBitData.length) break

      const fieldData = fiveBitData.slice(pos, pos + dataLength)
      pos += dataLength

      // Tag 'd' (13) = description
      if (tag === 13) {
        const bytes = fiveBitToBytes(fieldData)
        result.description = new TextDecoder().decode(bytes)
      }
      // Tag 'x' (6) = expiry
      else if (tag === 6) {
        let expiry = 0
        for (const v of fieldData) {
          expiry = expiry * 32 + v
        }
        result.expiry = expiry
      }
      // Tag 'p' (1) = payment hash (we skip for now, complex to extract)
    }

    result.isValid = true
  } catch (error) {
    console.error('Error decoding invoice:', error)
  }

  return result
}

/**
 * Parse the amount part of a BOLT11 invoice
 * Format: <digits><multiplier> where multiplier is m/u/n/p
 * m = milli (0.001 BTC = 100,000 sats)
 * u = micro (0.000001 BTC = 100 sats)
 * n = nano (0.000000001 BTC = 0.1 sats)
 * p = pico (0.000000000001 BTC = 0.0001 sats)
 */
function parseInvoiceAmount(amountPart: string): number | null {
  if (!amountPart || amountPart.length === 0) {
    return null // No amount specified (any-amount invoice)
  }

  // Match digits followed by optional multiplier
  const match = amountPart.match(/^(\d+)([munp])?$/)
  if (!match) return null

  const value = parseInt(match[1], 10)
  const multiplier = match[2]

  if (!multiplier) {
    // No multiplier means BTC, convert to sats
    return value * 100000000
  }

  // Convert to satoshis based on multiplier
  switch (multiplier) {
    case 'm': // milli-BTC = 100,000 sats
      return value * 100000
    case 'u': // micro-BTC = 100 sats
      return value * 100
    case 'n': // nano-BTC = 0.1 sats (round up)
      return Math.ceil(value / 10)
    case 'p': // pico-BTC = 0.0001 sats (round up)
      return Math.ceil(value / 10000)
    default:
      return null
  }
}

/**
 * Basic Lightning invoice validation
 * @param invoice The Lightning invoice string
 * @returns boolean indicating if the invoice format is valid
 */
export function validateLightningInvoice(invoice: string): boolean {
  const decoded = decodeLightningInvoice(invoice)
  return decoded.isValid
}

/**
 * Extract amount from Lightning invoice
 * @param invoice The Lightning invoice string
 * @returns amount in satoshis or null if cannot be determined
 */
export function extractInvoiceAmount(invoice: string): number | null {
  const decoded = decodeLightningInvoice(invoice)
  return decoded.amount
}

/**
 * Extract description/memo from Lightning invoice
 * @param invoice The Lightning invoice string
 * @returns description string or null
 */
export function extractInvoiceDescription(invoice: string): string | null {
  const decoded = decodeLightningInvoice(invoice)
  return decoded.description
}

/**
 * Truncate invoice for display (first N chars + ... + last M chars)
 */
export function truncateInvoice(invoice: string, prefixLen = 12, suffixLen = 8): string {
  if (invoice.length <= prefixLen + suffixLen + 3) return invoice
  return `${invoice.substring(0, prefixLen)}...${invoice.substring(invoice.length - suffixLen)}`
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
