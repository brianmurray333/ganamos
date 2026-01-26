/**
 * Wallet Router
 * 
 * Routes payment operations through either the custodial Ganamos wallet
 * or the user's connected non-custodial wallet (NWC).
 * 
 * Decision logic:
 * - If user has connected NWC wallet → use NWC for outgoing payments
 * - If user has custodial balance → can still use custodial for those funds
 * - For receiving (rewards, etc.) → if NWC connected, create invoice via NWC
 */

import { createServerSupabaseClient } from "./supabase"
import { payInvoice as payCustodial, createInvoice as createCustodialInvoice } from "./lightning"
import { payInvoiceNWC, createInvoiceNWC, getBalanceNWC, testNWCConnection } from "./nwc"

// ============================================================================
// TYPES
// ============================================================================

export type WalletType = "custodial" | "nwc"

export interface UserWalletInfo {
  hasNWCWallet: boolean
  nwcWalletId?: string
  nwcWalletName?: string
  nwcConnectionEncrypted?: string
  nwcBalance?: number
  custodialBalance: number
}

export interface PaymentRoutingResult {
  success: boolean
  walletType: WalletType
  paymentHash?: string
  preimage?: string
  newBalance?: number
  error?: string
  errorCode?: string
}

export interface InvoiceRoutingResult {
  success: boolean
  walletType: WalletType
  paymentRequest?: string
  rHash?: string
  error?: string
}

// ============================================================================
// WALLET INFO
// ============================================================================

/**
 * Get user's wallet configuration
 * Returns info about both custodial balance and connected NWC wallet
 */
export async function getUserWalletInfo(userId: string): Promise<UserWalletInfo> {
  const adminSupabase = createServerSupabaseClient({
    supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
  })

  // Get user's profile (custodial balance)
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .single()

  // Get user's active NWC wallet
  const { data: wallet } = await adminSupabase
    .from("user_wallets")
    .select("id, wallet_name, nwc_connection_encrypted, connection_status")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single()

  const result: UserWalletInfo = {
    hasNWCWallet: !!wallet && wallet.connection_status === "connected",
    custodialBalance: profile?.balance || 0,
  }

  if (wallet) {
    result.nwcWalletId = wallet.id
    result.nwcWalletName = wallet.wallet_name
    result.nwcConnectionEncrypted = wallet.nwc_connection_encrypted
  }

  return result
}

/**
 * Check if user has an active non-custodial wallet
 */
export async function hasActiveNWCWallet(userId: string): Promise<boolean> {
  const info = await getUserWalletInfo(userId)
  return info.hasNWCWallet
}

// ============================================================================
// PAYMENT ROUTING
// ============================================================================

/**
 * Route an outgoing payment through the appropriate wallet
 * 
 * Logic:
 * - If user specifies 'custodial' → use custodial
 * - If user specifies 'nwc' or has NWC and doesn't specify → use NWC
 * - If no NWC wallet → use custodial
 * 
 * @param userId - User making the payment
 * @param paymentRequest - BOLT11 invoice to pay
 * @param amount - Amount in sats
 * @param preferredWallet - Optional wallet preference
 * @param nwcConnectionString - Decrypted NWC connection string (if using NWC)
 */
export async function routeOutgoingPayment(
  userId: string,
  paymentRequest: string,
  amount: number,
  preferredWallet?: WalletType,
  nwcConnectionString?: string
): Promise<PaymentRoutingResult> {
  const walletInfo = await getUserWalletInfo(userId)

  // Determine which wallet to use
  let useWallet: WalletType = "custodial"
  
  if (preferredWallet) {
    useWallet = preferredWallet
  } else if (walletInfo.hasNWCWallet) {
    // Default to NWC if connected
    useWallet = "nwc"
  }

  // Validate wallet choice
  if (useWallet === "nwc" && !walletInfo.hasNWCWallet) {
    return {
      success: false,
      walletType: "nwc",
      error: "No connected wallet found",
      errorCode: "NO_WALLET",
    }
  }

  if (useWallet === "custodial" && walletInfo.custodialBalance < amount) {
    return {
      success: false,
      walletType: "custodial",
      error: "Insufficient custodial balance",
      errorCode: "INSUFFICIENT_BALANCE",
    }
  }

  // Route payment
  if (useWallet === "nwc") {
    if (!nwcConnectionString) {
      return {
        success: false,
        walletType: "nwc",
        error: "NWC connection string required",
        errorCode: "MISSING_CONNECTION",
      }
    }

    const result = await payInvoiceNWC(nwcConnectionString, paymentRequest)
    
    // Log the payment attempt
    await logWalletAudit(userId, walletInfo.nwcWalletId, 
      result.success ? "payment_completed" : "payment_failed",
      { amount, error: result.error }
    )

    return {
      success: result.success,
      walletType: "nwc",
      preimage: result.preimage,
      error: result.error,
      errorCode: result.errorCode,
    }
  }

  // Custodial payment
  const result = await payCustodial(paymentRequest, amount)
  
  return {
    success: result.success,
    walletType: "custodial",
    paymentHash: result.paymentHash,
    error: result.error,
  }
}

/**
 * Route invoice creation through the appropriate wallet
 * Used when user needs to receive payment (e.g., fix rewards)
 * 
 * @param userId - User receiving payment
 * @param amount - Amount in sats
 * @param memo - Invoice description
 * @param nwcConnectionString - Decrypted NWC connection string (if using NWC)
 */
export async function routeInvoiceCreation(
  userId: string,
  amount: number,
  memo: string,
  nwcConnectionString?: string
): Promise<InvoiceRoutingResult> {
  const walletInfo = await getUserWalletInfo(userId)

  // If user has NWC wallet and we have connection string, create invoice there
  if (walletInfo.hasNWCWallet && nwcConnectionString) {
    const result = await createInvoiceNWC(nwcConnectionString, amount, memo)
    
    await logWalletAudit(userId, walletInfo.nwcWalletId,
      result.success ? "invoice_created" : "invoice_creation_failed",
      { amount, error: result.error }
    )

    return {
      success: result.success,
      walletType: "nwc",
      paymentRequest: result.paymentRequest,
      rHash: result.rHash,
      error: result.error,
    }
  }

  // Fall back to custodial invoice
  const result = await createCustodialInvoice(amount, memo)
  
  return {
    success: result.success,
    walletType: "custodial",
    paymentRequest: result.paymentRequest,
    rHash: result.rHash,
    error: result.error,
  }
}

// ============================================================================
// WALLET CONNECTION MANAGEMENT
// ============================================================================

/**
 * Connect a new NWC wallet for a user
 * Deactivates any existing wallet first
 */
export async function connectNWCWallet(
  userId: string,
  connectionString: string,
  walletName?: string
): Promise<{ success: boolean; walletId?: string; error?: string }> {
  const adminSupabase = createServerSupabaseClient({
    supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
  })

  // Test the connection first
  const testResult = await testNWCConnection(connectionString)
  if (!testResult.success) {
    return {
      success: false,
      error: testResult.error || "Failed to connect to wallet",
    }
  }

  // Deactivate any existing wallets
  await adminSupabase
    .from("user_wallets")
    .update({ is_active: false, connection_status: "disconnected", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_active", true)

  // Create new wallet connection
  // NOTE: The connection string should be encrypted client-side before sending
  const { data: wallet, error } = await adminSupabase
    .from("user_wallets")
    .insert({
      user_id: userId,
      wallet_type: "nwc",
      nwc_connection_encrypted: connectionString, // Should be encrypted
      nwc_relay_url: testResult.relayUrl,
      nwc_pubkey: testResult.walletPubkey,
      wallet_name: walletName || "My Lightning Wallet",
      connection_status: "connected",
      last_connected_at: new Date().toISOString(),
      is_active: true,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[WalletRouter] Failed to save wallet:", error)
    return {
      success: false,
      error: "Failed to save wallet connection",
    }
  }

  // Log the connection
  await logWalletAudit(userId, wallet.id, "connected", {
    relay_url: testResult.relayUrl,
  })

  return {
    success: true,
    walletId: wallet.id,
  }
}

/**
 * Disconnect user's NWC wallet
 */
export async function disconnectNWCWallet(userId: string): Promise<boolean> {
  const adminSupabase = createServerSupabaseClient({
    supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
  })

  // Get wallet ID for audit
  const { data: wallet } = await adminSupabase
    .from("user_wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single()

  // Deactivate wallet
  const { error } = await adminSupabase
    .from("user_wallets")
    .update({ 
      is_active: false, 
      connection_status: "disconnected",
      nwc_connection_encrypted: null, // Clear the encrypted connection
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("is_active", true)

  if (error) {
    console.error("[WalletRouter] Failed to disconnect wallet:", error)
    return false
  }

  if (wallet) {
    await logWalletAudit(userId, wallet.id, "disconnected", {})
  }

  return true
}

// ============================================================================
// PROMPT DISMISSAL
// ============================================================================

/**
 * Dismiss the "connect your wallet" prompt for a user
 */
export async function dismissWalletPrompt(userId: string): Promise<boolean> {
  const adminSupabase = createServerSupabaseClient({
    supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
  })

  const { error } = await adminSupabase
    .from("profiles")
    .update({ 
      wallet_prompt_dismissed: true,
      wallet_prompt_dismissed_at: new Date().toISOString(),
    })
    .eq("id", userId)

  if (error) {
    console.error("[WalletRouter] Failed to dismiss prompt:", error)
    return false
  }

  await logWalletAudit(userId, undefined, "prompt_dismissed", {})
  
  return true
}

/**
 * Check if user has dismissed the wallet prompt
 */
export async function hasUserDismissedPrompt(userId: string): Promise<boolean> {
  const adminSupabase = createServerSupabaseClient({
    supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
  })

  const { data } = await adminSupabase
    .from("profiles")
    .select("wallet_prompt_dismissed")
    .eq("id", userId)
    .single()

  return data?.wallet_prompt_dismissed === true
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logWalletAudit(
  userId: string,
  walletId: string | undefined,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    await adminSupabase.from("wallet_connection_audit").insert({
      user_id: userId,
      wallet_id: walletId,
      action,
      details,
    })
  } catch (error) {
    console.error("[WalletRouter] Failed to log audit:", error)
  }
}
