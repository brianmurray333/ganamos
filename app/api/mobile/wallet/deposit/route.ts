import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { authenticatedRequestClient } from "@/lib/request-auth"
import { checkInvoice, createInvoice, deriveInvoiceIdentity, recoverInvoicePaymentRequest } from "@/lib/lightning"
import { checkRateLimit } from "@/lib/rate-limiter"
import { reconcilePendingDeposit } from "@/lib/deposit-settlement"

const MIN_DEPOSIT_SATS = 100
const MAX_DEPOSIT_SATS = 10_000_000
const INVOICE_EXPIRY_SECONDS = 60 * 60
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function jsonError(status: number, error: string, code: string) {
  return NextResponse.json({ success: false, error, code }, { status })
}

async function canAccessTarget(
  supabase: Awaited<ReturnType<typeof authenticatedRequestClient>>["supabase"],
  authenticatedUserID: string,
  targetUserID: string,
) {
  if (authenticatedUserID === targetUserID) return true
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("id")
    .eq("primary_user_id", authenticatedUserID)
    .eq("connected_user_id", targetUserID)
    .maybeSingle()
  return !error && Boolean(data)
}

function parseInvoiceCreation(value: unknown): { paymentRequest: string; paymentHash: string } | null {
  if (!value || typeof value !== "object") return null
  const result = value as Record<string, unknown>
  if (result.success !== true || typeof result.paymentRequest !== "string" || !result.paymentRequest) return null
  let paymentHash = result.rHash
  if (paymentHash instanceof Uint8Array) paymentHash = Buffer.from(paymentHash).toString("hex")
  if (typeof paymentHash !== "string" || !/^[0-9a-f]{64}$/i.test(paymentHash)) return null
  return { paymentRequest: result.paymentRequest, paymentHash: paymentHash.toLowerCase() }
}

function parseInvoiceLookup(value: unknown, expectedHash: string) {
  if (!value || typeof value !== "object") return null
  const result = value as Record<string, unknown>
  if (result.success !== true || typeof result.paymentRequest !== "string" || !result.paymentRequest) return null
  return { paymentRequest: result.paymentRequest, paymentHash: expectedHash }
}

async function recoverInvoice(paymentHash: string) {
  try {
    return parseInvoiceLookup(await recoverInvoicePaymentRequest(paymentHash), paymentHash)
  } catch {
    return null
  }
}


export async function POST(request: Request) {
  const auth = await authenticatedRequestClient(request)
  if (auth.error || !auth.user) return jsonError(401, "Authentication required.", "AUTH_REQUIRED")

  const rate = checkRateLimit(`deposit:create:${auth.user.id}`, { maxRequests: 5, windowMs: 60_000 })
  if (!rate.allowed) return jsonError(429, "Too many invoice requests. Try again shortly.", "RATE_LIMITED")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "Invalid request body.", "INVALID_BODY")
  }

  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const amount = input.amount
  const requestID = typeof input.requestId === "string" ? input.requestId : ""
  const targetUserID = typeof input.userId === "string" ? input.userId : auth.user.id
  if (!Number.isSafeInteger(amount) || (amount as number) < MIN_DEPOSIT_SATS || (amount as number) > MAX_DEPOSIT_SATS) {
    return jsonError(400, `Amount must be between ${MIN_DEPOSIT_SATS} and ${MAX_DEPOSIT_SATS} sats.`, "INVALID_AMOUNT")
  }
  if (!UUID_PATTERN.test(targetUserID)) return jsonError(400, "Invalid account identifier.", "INVALID_ACCOUNT")
  if (!UUID_PATTERN.test(requestID)) return jsonError(400, "Invalid request identifier.", "INVALID_REQUEST_ID")
  if (!await canAccessTarget(auth.supabase, auth.user.id, targetUserID)) {
    return jsonError(403, "You cannot receive funds into that account.", "ACCOUNT_FORBIDDEN")
  }

  const admin = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
  const { data: existingIntent, error: existingIntentError } = await admin
    .from("transactions")
    .select("user_id,amount,r_hash_str")
    .eq("deposit_request_id", requestID)
    .maybeSingle()
  if (existingIntentError) {
    return jsonError(500, "Unable to prepare the invoice.", "PERSISTENCE_FAILED")
  }
  if (existingIntent && (existingIntent.user_id !== targetUserID || existingIntent.amount !== amount || !/^[0-9a-f]{64}$/i.test(existingIntent.r_hash_str || ""))) {
    return jsonError(500, "Unable to prepare the invoice.", "PERSISTENCE_FAILED")
  }

  let invoiceIdentity: ReturnType<typeof deriveInvoiceIdentity>
  try {
    invoiceIdentity = deriveInvoiceIdentity(requestID, existingIntent?.r_hash_str || undefined)
  } catch {
    return jsonError(503, "Lightning service is temporarily unavailable.", "LIGHTNING_UNAVAILABLE")
  }

  const { data: preparation, error: preparationError } = await admin.rpc("prepare_lightning_deposit", {
    p_user_id: targetUserID,
    p_amount: amount,
    p_request_id: requestID,
    p_payment_hash: invoiceIdentity.paymentHash,
  })
  if (preparationError || !preparation?.[0]) {
    return jsonError(500, "Unable to prepare the invoice.", "PERSISTENCE_FAILED")
  }

  const prepared = preparation[0] as { outcome: string; transaction_id: string | null }
  if (prepared.outcome === "cap_exceeded") {
    return jsonError(409, "This deposit would exceed the account balance limit.", "BALANCE_LIMIT")
  }
  if (prepared.outcome === "outstanding_limit") {
    return jsonError(429, "Too many unpaid invoices. Pay or let an invoice expire before creating another.", "OUTSTANDING_LIMIT")
  }
  if ((prepared.outcome !== "prepared" && prepared.outcome !== "existing") || !prepared.transaction_id) {
    return jsonError(500, "Unable to prepare the invoice.", "PERSISTENCE_FAILED")
  }
  const intent = { id: prepared.transaction_id }

  const { data: storedIntent, error: storedIntentError } = await admin
    .from("transactions")
    .select("payment_request,r_hash_str,amount,created_at,status")
    .eq("id", intent.id)
    .eq("user_id", targetUserID)
    .single()
  if (storedIntentError || !storedIntent || storedIntent.status !== "pending" || !/^[0-9a-f]{64}$/i.test(storedIntent.r_hash_str || "")) {
    return jsonError(500, "Unable to prepare the invoice.", "PERSISTENCE_FAILED")
  }
  const reservedHash = storedIntent.r_hash_str.toLowerCase()
  if (storedIntent.payment_request) {
    return NextResponse.json({
      success: true,
      invoiceId: intent.id,
      paymentRequest: storedIntent.payment_request,
      amount: storedIntent.amount,
      expiresAt: new Date(new Date(storedIntent.created_at).getTime() + INVOICE_EXPIRY_SECONDS * 1000).toISOString(),
    })
  }

  let invoice = await recoverInvoice(reservedHash)
  try {
    if (!invoice && reservedHash === invoiceIdentity.paymentHash) {
      const rawInvoice = await createInvoice(amount as number, "Ganamos deposit", invoiceIdentity.preimageBase64)
      const created = parseInvoiceCreation(rawInvoice)
      if (created?.paymentHash === reservedHash) invoice = created
    }
  } catch {
    // The provider may have committed before the connection failed. Recover by
    // deterministic hash below rather than creating another payable invoice.
  }
  if (!invoice) invoice = await recoverInvoice(reservedHash)
  if (!invoice) {
    // Creation may have committed even when lookup/create responses were lost.
    // Keep the deterministic hash reserved and pending so retries/cron can
    // recover it; never release a potentially payable provider liability.
    console.error("[Deposit API] Lightning invoice creation is awaiting recovery", { category: "provider" })
    return jsonError(503, "Lightning service is temporarily unavailable.", "LIGHTNING_UNAVAILABLE")
  }

  let persisted = false
  for (let attempt = 0; attempt < 3 && !persisted; attempt++) {
    const { data, error } = await admin.from("transactions").update({
      payment_request: invoice.paymentRequest,
      memo: "Ganamos Lightning deposit",
    }).eq("id", intent.id)
      .eq("user_id", targetUserID)
      .eq("status", "pending")
      .eq("r_hash_str", reservedHash)
      .select("id")
      .maybeSingle()
    persisted = !error && Boolean(data)
  }
  if (!persisted) {
    console.error("[Deposit API] Created invoice requires reconciliation", { category: "persistence" })
    return jsonError(500, "Invoice preparation did not complete. Please contact support before paying.", "RECONCILIATION_REQUIRED")
  }

  return NextResponse.json({
    success: true,
    invoiceId: intent.id,
    paymentRequest: invoice.paymentRequest,
    amount,
    expiresAt: new Date(Date.now() + INVOICE_EXPIRY_SECONDS * 1000).toISOString(),
  }, { status: 201 })
}

export async function GET(request: Request) {
  const auth = await authenticatedRequestClient(request)
  if (auth.error || !auth.user) return jsonError(401, "Authentication required.", "AUTH_REQUIRED")

  const rate = checkRateLimit(`deposit:status:${auth.user.id}`, { maxRequests: 60, windowMs: 60_000 })
  if (!rate.allowed) return jsonError(429, "Status checks are temporarily limited.", "RATE_LIMITED")

  const invoiceID = new URL(request.url).searchParams.get("invoiceId") || ""
  if (!UUID_PATTERN.test(invoiceID)) return jsonError(400, "Invalid invoice identifier.", "INVALID_INVOICE")

  const admin = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
  const { data: transaction, error } = await admin
    .from("transactions").select("id,user_id,amount,status,r_hash_str,created_at")
    .eq("id", invoiceID).eq("type", "deposit").maybeSingle()
  if (error || !transaction) return jsonError(404, "Invoice not found.", "INVOICE_NOT_FOUND")
  if (!await canAccessTarget(auth.supabase, auth.user.id, transaction.user_id)) {
    return jsonError(404, "Invoice not found.", "INVOICE_NOT_FOUND")
  }
  if (transaction.status === "completed") {
    return NextResponse.json({ success: true, status: "completed", settled: true, amount: transaction.amount })
  }
  if (!transaction.r_hash_str) return jsonError(409, "Invoice is not ready.", "INVOICE_NOT_READY")

  const reconciliation = await reconcilePendingDeposit(admin, {
    id: transaction.id,
    user_id: transaction.user_id,
    amount: transaction.amount,
    status: transaction.status,
    r_hash_str: transaction.r_hash_str,
  })
  if (reconciliation.kind === "pending") {
    return NextResponse.json({ success: true, status: "pending", settled: false, amount: transaction.amount })
  }
  if (reconciliation.kind === "expired") {
    const { data: expired, error: expiryError } = await admin.from("transactions")
      .update({ status: "failed" })
      .eq("id", transaction.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()
    if (expiryError || !expired) {
      return jsonError(503, "Payment settlement is delayed.", "RECONCILIATION_DELAYED")
    }
    return NextResponse.json({ success: true, status: "expired", settled: false, amount: transaction.amount })
  }
  if (reconciliation.kind === "settled") {
    return NextResponse.json({
      success: true,
      status: "completed",
      settled: true,
      amount: reconciliation.amount,
      newBalance: reconciliation.newBalance,
    })
  }

  const status = reconciliation.code === "AMOUNT_MISMATCH" || reconciliation.code === "SETTLEMENT_BLOCKED" ? 409 : 503
  const message = reconciliation.code === "AMOUNT_MISMATCH"
    ? "Payment requires manual reconciliation."
    : "Payment settlement is delayed."
  return jsonError(status, message, reconciliation.code)
}
