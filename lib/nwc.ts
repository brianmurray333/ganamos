/**
 * Nostr Wallet Connect (NWC) Service
 * 
 * Handles non-custodial wallet connections using the NWC protocol.
 * NWC allows users to connect their own Lightning wallets (Alby, Zeus, Mutiny, etc.)
 * to Ganamos without giving up custody of their funds.
 * 
 * SECURITY NOTES:
 * - NWC connection strings contain a secret key - NEVER log them
 * - Connection strings should be encrypted at rest
 * - Only request minimum required permissions
 */

import { webln } from "@getalby/sdk"

// ============================================================================
// TYPES
// ============================================================================

export interface NWCConnectionParts {
  walletPubkey: string
  relayUrl: string
  secret: string
}

export interface NWCPaymentResult {
  success: boolean
  preimage?: string
  paymentHash?: string
  error?: string
  errorCode?: string
}

export interface NWCInvoiceResult {
  success: boolean
  paymentRequest?: string
  rHash?: string
  error?: string
}

export interface NWCBalanceResult {
  success: boolean
  balance?: number // in sats
  error?: string
}

export interface NWCConnectionTestResult {
  success: boolean
  walletPubkey?: string
  relayUrl?: string
  balance?: number
  error?: string
}

// ============================================================================
// CONNECTION STRING PARSING
// ============================================================================

/**
 * Parse NWC connection string into its components
 * Format: nostr+walletconnect://pubkey?relay=wss://...&secret=...
 * 
 * SECURITY: This function handles the secret key - do not log the result
 */
export function parseNWCConnectionString(connectionString: string): NWCConnectionParts | null {
  try {
    // Validate basic format
    if (!connectionString || typeof connectionString !== "string") {
      return null
    }

    const trimmed = connectionString.trim()
    
    // Must start with the NWC protocol
    if (!trimmed.startsWith("nostr+walletconnect://")) {
      console.error("[NWC] Invalid protocol - must start with nostr+walletconnect://")
      return null
    }

    const url = new URL(trimmed)
    
    // Extract wallet pubkey from hostname
    const walletPubkey = url.hostname
    if (!walletPubkey || walletPubkey.length < 64) {
      console.error("[NWC] Invalid wallet pubkey")
      return null
    }

    // Extract relay URL
    const relayUrl = url.searchParams.get("relay")
    if (!relayUrl) {
      console.error("[NWC] Missing relay URL")
      return null
    }

    // Validate relay URL format
    if (!relayUrl.startsWith("wss://") && !relayUrl.startsWith("ws://")) {
      console.error("[NWC] Invalid relay URL - must be websocket")
      return null
    }

    // Extract secret
    const secret = url.searchParams.get("secret")
    if (!secret) {
      console.error("[NWC] Missing secret")
      return null
    }

    return {
      walletPubkey,
      relayUrl,
      secret,
    }
  } catch (error) {
    console.error("[NWC] Failed to parse connection string:", error instanceof Error ? error.message : "Unknown error")
    return null
  }
}

/**
 * Validate NWC connection string format without exposing secret
 * Safe to call for client-side validation
 */
export function isValidNWCConnectionString(connectionString: string): boolean {
  return parseNWCConnectionString(connectionString) !== null
}

// ============================================================================
// NWC CLIENT MANAGEMENT
// ============================================================================

// Cache for NWC clients to avoid reconnecting for every operation
const clientCache = new Map<string, { client: webln.NostrWebLNProvider; createdAt: number }>()
const CLIENT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Create or get cached NWC client
 * SECURITY: Connection string contains secret - handle with care
 */
async function getNWCClient(connectionString: string): Promise<webln.NostrWebLNProvider> {
  // Use pubkey as cache key (not the full connection string for security)
  const parsed = parseNWCConnectionString(connectionString)
  if (!parsed) {
    throw new Error("Invalid NWC connection string")
  }

  const cacheKey = parsed.walletPubkey
  const cached = clientCache.get(cacheKey)
  
  // Return cached client if still valid
  if (cached && Date.now() - cached.createdAt < CLIENT_CACHE_TTL) {
    return cached.client
  }

  // Create new client
  const client = new webln.NostrWebLNProvider({
    nostrWalletConnectUrl: connectionString,
  })

  try {
    await client.enable()
    
    // Cache the client
    clientCache.set(cacheKey, {
      client,
      createdAt: Date.now(),
    })

    return client
  } catch (error) {
    // Clean up on failure
    clientCache.delete(cacheKey)
    throw error
  }
}

/**
 * Clear cached client for a wallet
 */
export function clearNWCClientCache(walletPubkey: string): void {
  clientCache.delete(walletPubkey)
}

// ============================================================================
// WALLET OPERATIONS
// ============================================================================

/**
 * Test NWC connection by fetching balance
 * Returns wallet info if successful
 */
export async function testNWCConnection(connectionString: string): Promise<NWCConnectionTestResult> {
  try {
    const parsed = parseNWCConnectionString(connectionString)
    if (!parsed) {
      return {
        success: false,
        error: "Invalid NWC connection string format",
      }
    }

    const client = await getNWCClient(connectionString)
    
    // Try to get balance to verify connection works
    let balance: number | undefined
    try {
      const balanceResult = await client.getBalance()
      balance = Math.floor(balanceResult.balance / 1000) // Convert msats to sats
    } catch {
      // Some wallets don't support getBalance, that's okay
      console.log("[NWC] Balance check not supported, connection still valid")
    }

    return {
      success: true,
      walletPubkey: parsed.walletPubkey,
      relayUrl: parsed.relayUrl,
      balance,
    }
  } catch (error) {
    console.error("[NWC] Connection test failed:", error instanceof Error ? error.message : "Unknown error")
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to connect to wallet",
    }
  }
}

/**
 * Pay a Lightning invoice using NWC
 * 
 * @param connectionString - NWC connection string (contains secret)
 * @param paymentRequest - BOLT11 invoice to pay
 * @returns Payment result with preimage if successful
 */
export async function payInvoiceNWC(
  connectionString: string,
  paymentRequest: string
): Promise<NWCPaymentResult> {
  try {
    if (!paymentRequest) {
      return {
        success: false,
        error: "Missing payment request",
        errorCode: "INVALID_REQUEST",
      }
    }

    // Validate BOLT11 format
    const lowerRequest = paymentRequest.toLowerCase()
    if (!lowerRequest.startsWith("lnbc") && !lowerRequest.startsWith("lntb") && !lowerRequest.startsWith("lnbcrt")) {
      return {
        success: false,
        error: "Invalid BOLT11 invoice format",
        errorCode: "INVALID_INVOICE",
      }
    }

    const client = await getNWCClient(connectionString)
    
    console.log("[NWC] Sending payment...")
    const result = await client.sendPayment(paymentRequest)

    console.log("[NWC] Payment successful")
    return {
      success: true,
      preimage: result.preimage,
    }
  } catch (error) {
    console.error("[NWC] Payment failed:", error instanceof Error ? error.message : "Unknown error")
    
    // Parse common NWC errors
    const errorMessage = error instanceof Error ? error.message : "Payment failed"
    let errorCode = "PAYMENT_FAILED"
    
    if (errorMessage.includes("insufficient")) {
      errorCode = "INSUFFICIENT_BALANCE"
    } else if (errorMessage.includes("timeout")) {
      errorCode = "TIMEOUT"
    } else if (errorMessage.includes("route")) {
      errorCode = "NO_ROUTE"
    }

    return {
      success: false,
      error: errorMessage,
      errorCode,
    }
  }
}

/**
 * Create a Lightning invoice using NWC
 * 
 * @param connectionString - NWC connection string
 * @param amountSats - Amount in satoshis
 * @param memo - Invoice description
 * @returns Invoice details if successful
 */
export async function createInvoiceNWC(
  connectionString: string,
  amountSats: number,
  memo: string
): Promise<NWCInvoiceResult> {
  try {
    if (amountSats <= 0) {
      return {
        success: false,
        error: "Amount must be greater than 0",
      }
    }

    const client = await getNWCClient(connectionString)
    
    console.log("[NWC] Creating invoice for", amountSats, "sats")
    const result = await client.makeInvoice({
      amount: amountSats,
      defaultMemo: memo,
    })

    console.log("[NWC] Invoice created successfully")
    return {
      success: true,
      paymentRequest: result.paymentRequest,
      rHash: result.rHash,
    }
  } catch (error) {
    console.error("[NWC] Invoice creation failed:", error instanceof Error ? error.message : "Unknown error")
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create invoice",
    }
  }
}

/**
 * Get wallet balance using NWC
 * 
 * @param connectionString - NWC connection string
 * @returns Balance in satoshis
 */
export async function getBalanceNWC(connectionString: string): Promise<NWCBalanceResult> {
  try {
    const client = await getNWCClient(connectionString)
    
    const result = await client.getBalance()
    
    // NWC returns balance in millisatoshis
    const balanceSats = Math.floor(result.balance / 1000)
    
    return {
      success: true,
      balance: balanceSats,
    }
  } catch (error) {
    console.error("[NWC] Balance check failed:", error instanceof Error ? error.message : "Unknown error")
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get balance",
    }
  }
}

/**
 * Look up an invoice status using NWC
 * 
 * @param connectionString - NWC connection string  
 * @param paymentHash - Payment hash to look up
 * @returns Invoice status
 */
export async function lookupInvoiceNWC(
  connectionString: string,
  paymentHash: string
): Promise<{ success: boolean; settled?: boolean; error?: string }> {
  try {
    const client = await getNWCClient(connectionString)
    
    const result = await client.lookupInvoice({
      paymentHash,
    })
    
    return {
      success: true,
      settled: result.settled,
    }
  } catch (error) {
    console.error("[NWC] Invoice lookup failed:", error instanceof Error ? error.message : "Unknown error")
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to lookup invoice",
    }
  }
}
