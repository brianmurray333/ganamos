/**
 * Lightning Network service for interacting with LND node
 */

import { extractInvoiceAmount } from "./lightning-validation"
import { serverEnv } from "./env"
import { createHash, createHmac } from "node:crypto"

export function deriveInvoiceIdentity(requestID: string, expectedPaymentHash?: string) {
  // Comma-separated, newest first. Retain old keys while any intent derived
  // from them remains pending. LND credential rotation is intentionally unrelated.
  const keys = (process.env.DEPOSIT_INVOICE_DERIVATION_KEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length >= 32)
  if (!keys.length) throw new Error("Lightning configuration missing")

  for (const key of keys) {
    const preimage = createHmac("sha256", key)
      .update(`ganamos-deposit-v1:${requestID}`)
      .digest()
    const paymentHash = createHash("sha256").update(preimage).digest("hex")
    if (!expectedPaymentHash || paymentHash === expectedPaymentHash.toLowerCase()) {
      return { paymentHash, preimageBase64: preimage.toString("base64") }
    }
  }
  throw new Error("Invoice derivation key unavailable")
}

// Helper function to make authenticated requests to the LND REST API
export async function lndRequest(endpoint: string, method = "GET", body?: any) {
  const LND_REST_URL = serverEnv?.lightning.lndRestUrl
  const LND_ADMIN_MACAROON = serverEnv?.lightning.lndAdminMacaroon

  if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
    console.error("Lightning configuration missing")
    return { success: false, error: "Lightning configuration missing" }
  }

  try {
    // Ensure the URL is properly formatted with a protocol
    let baseUrl = LND_REST_URL
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`
    }

    // Remove trailing slash if present
    baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl

    const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`

    const headers: HeadersInit = {
      "Grpc-Metadata-macaroon": LND_ADMIN_MACAROON,
      "Content-Type": "application/json",
    }

    const options: RequestInit = {
      method,
      headers,
      cache: "no-store",
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    options.signal = controller.signal
    let response: Response
    try {
      response = await fetch(url, options)
    } finally {
      clearTimeout(timeout)
    }

    // Check if the response is JSON
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      await response.body?.cancel()
      return {
        success: false,
        error: `Invalid response format: ${contentType || "unknown"}`,
        details: `Status: ${response.status}`,
      }
    }

    if (!response.ok) {
      await response.body?.cancel()
      return {
        success: false,
        error: `LND API error: ${response.status} ${response.statusText}`,
        details: `Status: ${response.status}`,
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch {
    return {
      success: false,
      error: "Failed to communicate with Lightning node",
    }
  }
}

/**
 * Create a Lightning invoice
 * @param value Amount in satoshis
 * @param memo Description for the invoice
 * @returns Invoice details including payment request
 */
export async function createInvoice(value: number, memo: string, preimageBase64?: string) {
  try {
    const invoice: Record<string, string> = {
      value: value.toString(),
      memo,
      expiry: "3600", // 1 hour expiry
    }
    if (preimageBase64) invoice.r_preimage = preimageBase64

    const result = await lndRequest("/v1/invoices", "POST", invoice)

    if (!result.success) {
      return result
    }

    return {
      success: true,
      paymentRequest: result.data.payment_request,
      rHash: result.data.r_hash_str || Buffer.from(result.data.r_hash, "base64").toString("hex"),
      addIndex: result.data.add_index,
    }
  } catch {
    return {
      success: false,
      error: "Failed to create invoice",
    }
  }
}

/** Look up raw invoice data without exposing it outside this module. */
async function lookupInvoiceData(rHash: string) {
  const isHex = /^[0-9a-f]{64}$/i.test(rHash)

  if (isHex) {
    const hexResult = await lndRequest(`/v1/invoice/${rHash}`)
    if (hexResult.success) return hexResult

    const urlSafeBase64 = Buffer.from(rHash, "hex").toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
    return lndRequest(`/v1/invoice/${encodeURIComponent(urlSafeBase64)}`)
  }

  return lndRequest(`/v1/invoice/${encodeURIComponent(rHash)}`)
}

/**
 * Check the status of an invoice. Payment requests and preimages are omitted.
 */
export async function checkInvoice(rHash: string) {
  try {
    const result = await lookupInvoiceData(rHash)
    if (!result.success) return result
    return formatInvoiceResponse(result.data)
  } catch {
    return { success: false, error: "Failed to check invoice" }
  }
}

/**
 * Recover only the payment request for a server-side deterministic invoice.
 * This is intentionally separate from checkInvoice so status/debug callers
 * cannot accidentally log or return the BOLT11 invoice.
 */
export async function recoverInvoicePaymentRequest(rHash: string) {
  if (!/^[0-9a-f]{64}$/i.test(rHash)) {
    return { success: false, error: "Invalid invoice identity" }
  }
  try {
    const result = await lookupInvoiceData(rHash)
    const paymentRequest = result.success ? result.data?.payment_request : null
    if (typeof paymentRequest !== "string" || !paymentRequest) {
      return { success: false, error: "Invoice is not available" }
    }
    return { success: true, paymentRequest }
  } catch {
    return { success: false, error: "Invoice is not available" }
  }
}

// Helper to format invoice response consistently
function formatInvoiceResponse(data: any) {
  return {
    success: true,
    settled: data.settled,
    amountPaid: data.amt_paid_sat,
    state: data.state,
    creationDate: data.creation_date,
    settleDate: data.settle_date,
  }
}

/**
 * Pay a Lightning invoice
 * @param paymentRequest The BOLT11 payment request to pay
 * @param amount Optional amount in sats (for zero-amount invoices)
 * @returns Payment result
 */
export async function payInvoice(paymentRequest: string, amount?: number) {
  try {
    // Try to extract amount from the invoice
    const invoiceAmount = extractInvoiceAmount(paymentRequest)

    // Build LND API request body for SendPaymentSync
    const body: any = { payment_request: paymentRequest }
    if ((invoiceAmount === null || invoiceAmount === 0) && amount) {
      body.amt = amount // LND expects 'amt' in satoshis
    }
    const result = await lndRequest("/v1/channels/transactions", "POST", body)
    
    if (result.success && result.data) {
      // Check if there's a payment error
      if (result.data.payment_error) {
        return {
          success: false,
          error: "Payment failed",
        }
      }
      
      // Extract payment hash from the LND response
      const paymentHash = result.data.payment_hash
      return {
        success: true,
        paymentHash,
      }
    }

    return { success: false, error: "Payment failed" }
  } catch {
    return { success: false, error: "Payment failed" }
  }
}

/**
 * Get node information
 * @returns Node info including public key and alias
 */
export async function getNodeInfo() {
  try {
    const result = await lndRequest("/v1/getinfo")

    if (!result.success) {
      return result
    }

    return {
      success: true,
      pubkey: result.data.identity_pubkey,
      alias: result.data.alias,
      version: result.data.version,
      syncedToChain: result.data.synced_to_chain,
      blockHeight: result.data.block_height,
    }
  } catch {
    return {
      success: false,
      error: "Failed to get node info",
    }
  }
}
