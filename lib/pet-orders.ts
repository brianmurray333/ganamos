/**
 * Server-side Satoshi Pet order logic shared by the public server actions
 * (app/actions/pet-order-actions.ts) and the reconcile cron
 * (app/api/cron/reconcile-pet-orders). Server-only: this is deliberately NOT a
 * "use server" module, so none of these functions are callable from a browser.
 *
 * Payment checks are read-only against the node (checkInvoice). The paid
 * transition is a single conditional UPDATE, so however many checks race
 * (browser polls, several tabs, the cron), exactly one records the payment and
 * sends the emails.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { Resend } from "resend"
import { checkInvoice } from "@/lib/lightning"
import { escapeHtml } from "@/lib/email-layout"
import {
  PET_INVOICE_EXPIRY_SECONDS,
  SUPPORT_EMAIL,
  preorderShipEstimateText,
} from "@/lib/pet-order-constants"

export const PET_SITE_URL = "https://satoshipet.com"

/** Columns the order code reads (requires migration 20261125100000). */
export const PET_ORDER_COLUMNS = [
  "id", "order_number", "email", "full_name",
  "address_line1", "address_line2", "city", "state", "postal_code",
  "device_price_sats", "shipping_price_sats", "total_price_sats",
  "payment_request", "payment_hash", "payment_status", "paid_at",
  "order_status", "is_preorder", "access_token", "invoice_expires_at",
  "tracking_number", "shipped_at", "created_at",
].join(", ")

/** Don't treat an invoice as dead until this long after its expiry (clock skew vs the node). */
export const INVOICE_EXPIRY_MARGIN_MS = 30_000

export type PetOrderRow = Record<string, any>

export type PaymentSyncResult =
  | { status: "paid"; order: PetOrderRow; newlyPaid: boolean }
  | { status: "pending"; order: PetOrderRow }
  | { status: "expired"; order: PetOrderRow }
  | { status: "error"; error: string; order?: PetOrderRow }

type InvoiceStatus = { success: boolean; settled?: boolean; state?: string; amountPaid?: unknown }

/* ------------------------------ tokens & ids ------------------------------ */

/** 256-bit crypto-random per-order access token (64 hex chars). */
export function generateAccessToken(): string {
  return randomBytes(32).toString("hex")
}

const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 32 chars, no 0/O/1/I/L

/** "SP-XXXXXX" from a CSPRNG (32-char alphabet, so `& 31` is unbiased). */
export function generateOrderNumber(): string {
  const bytes = randomBytes(6)
  let s = "SP-"
  for (const b of bytes) s += ORDER_NUMBER_ALPHABET[b & 31]
  return s
}

export const ORDER_NUMBER_REGEX = /^SP-[A-Z0-9]{6}$/

/** Constant-time comparison of a presented token with the stored one. */
export function accessTokenMatches(presented: unknown, stored: unknown): boolean {
  if (typeof presented !== "string" || typeof stored !== "string" || !presented || !stored) return false
  const a = Buffer.from(presented, "utf8")
  const b = Buffer.from(stored, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Keyed hash of the client IP, so rate limiting can use the DB without storing raw IPs. */
export function hashClientIp(ip: string): string {
  return createHmac("sha256", process.env.SUPABASE_SECRET_API_KEY || "")
    .update(`pet-order-ip:${ip}`)
    .digest("hex")
}

/** "b***@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at < 1) return "***"
  return `${email[0]}***${email.slice(at)}`
}

export function orderPageUrl(orderNumber: string, accessToken: string): string {
  return `${PET_SITE_URL}/order/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(accessToken)}`
}

/* ---------------------------- invoice / payment ---------------------------- */

export function invoiceExpiresAt(order: PetOrderRow): Date {
  if (order.invoice_expires_at) return new Date(order.invoice_expires_at)
  return new Date(new Date(order.created_at).getTime() + PET_INVOICE_EXPIRY_SECONDS * 1000)
}

function isSettled(inv: InvoiceStatus): boolean {
  return inv.settled === true || inv.state === "SETTLED"
}

/** The invoice can no longer be paid: not settled, and canceled by the node or past its expiry. */
export function isInvoiceDead(inv: InvoiceStatus, expiresAt: Date, now: Date): boolean {
  if (isSettled(inv)) return false
  return inv.state === "CANCELED" || now.getTime() >= expiresAt.getTime() + INVOICE_EXPIRY_MARGIN_MS
}

/**
 * Atomically mark the order paid. Only the caller whose UPDATE actually moves
 * the row from pending/expired to paid sends the emails. Callers must have
 * confirmed with the node that this payment_hash is settled.
 */
export async function markPetOrderPaid(supabase: any, order: PetOrderRow): Promise<PaymentSyncResult> {
  const { data, error } = await supabase
    .from("pet_orders")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      order_status: "confirmed",
    })
    .eq("payment_hash", order.payment_hash)
    .in("payment_status", ["pending", "expired"])
    .neq("order_status", "cancelled")
    .select(PET_ORDER_COLUMNS)

  if (error) {
    console.error(`[pet-orders] Failed to record payment for ${order.order_number}:`, error)
    return { status: "error", error: "Failed to record payment" }
  }

  if (!data || data.length === 0) {
    // Another check got there first, or the admin cancelled the order. Look at what's stored.
    const { data: current } = await supabase
      .from("pet_orders")
      .select(PET_ORDER_COLUMNS)
      .eq("payment_hash", order.payment_hash)
      .maybeSingle()
    if (current?.payment_status === "paid") return { status: "paid", order: current, newlyPaid: false }
    if (current?.order_status === "cancelled") return markCancelledOrderPaid(supabase, current)
    console.error(`[pet-orders] Paid update matched no row for ${order.order_number}`)
    return { status: "error", error: "Failed to record payment" }
  }

  const paidOrder = data[0]
  await sendOrderConfirmationEmail(paidOrder)
  await sendAdminOrderNotification(paidOrder)
  return { status: "paid", order: paidOrder, newlyPaid: true }
}

/**
 * The invoice settled after the admin cancelled the order. Record the money
 * (so it can be refunded) but keep the order cancelled: no customer
 * confirmation, and the admin is told a refund is due.
 */
async function markCancelledOrderPaid(supabase: any, order: PetOrderRow): Promise<PaymentSyncResult> {
  const { data, error } = await supabase
    .from("pet_orders")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("payment_hash", order.payment_hash)
    .in("payment_status", ["pending", "expired"])
    .eq("order_status", "cancelled")
    .select(PET_ORDER_COLUMNS)
  if (error) {
    console.error(`[pet-orders] Failed to record payment on cancelled order ${order.order_number}:`, error)
    return { status: "error", error: "Failed to record payment" }
  }
  if (!data || data.length === 0) {
    const { data: current } = await supabase
      .from("pet_orders")
      .select(PET_ORDER_COLUMNS)
      .eq("payment_hash", order.payment_hash)
      .maybeSingle()
    if (current?.payment_status === "paid") return { status: "paid", order: current, newlyPaid: false }
    return { status: "error", error: "Failed to record payment" }
  }
  console.error(`[pet-orders] Order ${order.order_number} was paid after it was cancelled: refund due`)
  await sendAdminOrderNotification(data[0], { paidAfterCancel: true })
  return { status: "paid", order: data[0], newlyPaid: true }
}

/**
 * The one code path that checks an order's invoice with the node and records
 * the result: paid (atomic, emails once), expired (invoice dead), or pending.
 * Used by the browser poll and by the reconcile cron.
 */
export async function syncPetOrderPayment(
  supabase: any,
  order: PetOrderRow,
  now: Date = new Date()
): Promise<PaymentSyncResult> {
  if (order.payment_status === "paid") return { status: "paid", order, newlyPaid: false }
  if (order.payment_status !== "pending" && order.payment_status !== "expired") {
    return { status: "error", error: "Order is not payable", order }
  }
  if (!order.payment_hash) return { status: "error", error: "Order has no invoice", order }

  const inv = (await checkInvoice(order.payment_hash)) as InvoiceStatus
  if (!inv.success) return { status: "error", error: "Failed to check payment status", order }

  if (isSettled(inv)) {
    const amountPaid = Number(inv.amountPaid)
    if (Number.isFinite(amountPaid) && amountPaid > 0 && amountPaid < Number(order.total_price_sats)) {
      console.error(
        `[pet-orders] Invoice for ${order.order_number} settled for ${amountPaid} sats, expected ${order.total_price_sats}`
      )
      return { status: "error", error: "Payment amount mismatch", order }
    }
    return markPetOrderPaid(supabase, order)
  }

  if (order.payment_status === "expired") return { status: "expired", order }

  if (isInvoiceDead(inv, invoiceExpiresAt(order), now)) {
    const { data, error } = await supabase
      .from("pet_orders")
      .update({ payment_status: "expired" })
      .eq("id", order.id)
      .eq("payment_hash", order.payment_hash)
      .eq("payment_status", "pending")
      .select(PET_ORDER_COLUMNS)
    if (error) {
      console.error(`[pet-orders] Failed to mark ${order.order_number} expired:`, error)
      return { status: "error", error: "Failed to update order", order }
    }
    // No row: the order changed concurrently (paid or renewed); the next check sees it.
    if (!data || data.length === 0) return { status: "pending", order }
    return { status: "expired", order: data[0] }
  }

  return { status: "pending", order }
}

export interface ReconcileSummary {
  checked: number
  paid: number
  expired: number
  pending: number
  errors: number
}

/**
 * Cron: check pending orders whose invoice is still open or expired within the
 * last `expiredWithinHours` (default 1 hour, i.e. orders from the last ~2 hours)
 * against the node.
 */
export async function reconcilePendingPetOrders(
  supabase: any,
  options: { now?: Date; expiredWithinHours?: number; limit?: number; concurrency?: number } = {}
): Promise<ReconcileSummary> {
  const now = options.now ?? new Date()
  const expiredWithinHours = options.expiredWithinHours ?? 1
  const limit = options.limit ?? 100
  const concurrency = options.concurrency ?? 5
  const since = new Date(now.getTime() - expiredWithinHours * 3600_000).toISOString()

  const { data: orders, error } = await supabase
    .from("pet_orders")
    .select(PET_ORDER_COLUMNS)
    .eq("payment_status", "pending")
    .not("payment_hash", "is", null)
    .gte("invoice_expires_at", since)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load pending pet orders: ${error.message}`)

  const summary: ReconcileSummary = { checked: 0, paid: 0, expired: 0, pending: 0, errors: 0 }
  const list: PetOrderRow[] = orders || []
  for (let i = 0; i < list.length; i += concurrency) {
    const results = await Promise.all(
      list.slice(i, i + concurrency).map(o =>
        syncPetOrderPayment(supabase, o, now).catch((e): PaymentSyncResult => {
          console.error(`[pet-orders] Reconcile failed for ${o.order_number}:`, e)
          return { status: "error", error: "unexpected" }
        })
      )
    )
    for (const r of results) {
      summary.checked++
      if (r.status === "paid") summary.paid += r.newlyPaid ? 1 : 0
      else if (r.status === "expired") summary.expired++
      else if (r.status === "pending") summary.pending++
      else summary.errors++
    }
  }
  return summary
}

/* --------------------------------- emails --------------------------------- */

function addressLinesHtml(order: PetOrderRow): string {
  return [
    order.full_name,
    order.address_line1,
    order.address_line2,
    `${order.city}, ${order.state} ${order.postal_code}`,
    "United States",
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>")
}

export function renderOrderConfirmationEmail(order: PetOrderRow): { subject: string; html: string } {
  const orderNumber = escapeHtml(order.order_number)
  const isPreorder = order.is_preorder === true
  const orderUrl = escapeHtml(orderPageUrl(order.order_number, order.access_token))
  const total = escapeHtml(Number(order.total_price_sats).toLocaleString("en-US"))

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="text-align:center;margin-bottom:30px;">
      <div style="width:80px;height:80px;background:linear-gradient(135deg,#a855f7,#3b82f6);border-radius:50%;margin:0 auto 16px;"></div>
      <h1 style="color:#1a1a1a;margin:0;font-size:26px;">Thank You for Your Order!</h1>
    </div>

    <p>Hi ${escapeHtml(order.full_name)},</p>

    <p>${isPreorder
      ? "We've received your Satoshi Pet pre-order and your payment has been confirmed."
      : "We've received your Satoshi Pet order and your payment has been confirmed."}</p>

    <div style="background:#f9fafb;border-radius:12px;padding:24px;margin:24px 0;">
      <p style="margin:0 0 8px;color:#6b7280;">Order Number</p>
      <p style="font-size:24px;font-weight:bold;color:#15803d;margin:0 0 16px;">${orderNumber}</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Amount Paid</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;"><strong>${total} sats</strong></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Status</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;"><strong style="color:#15803d;">Confirmed</strong></td></tr>
        ${isPreorder ? `<tr><td colspan="2" style="padding:8px 0;color:#374151;">${escapeHtml(preorderShipEstimateText())}</td></tr>` : ""}
      </table>
      <p style="margin:16px 0 4px;color:#6b7280;">Shipping to</p>
      <p style="margin:0;color:#1a1a1a;">${addressLinesHtml(order)}</p>
    </div>

    <p style="text-align:center;">
      <a href="${orderUrl}" style="color:#2563eb;">View your order</a>
      <br><span style="font-size:13px;color:#6b7280;">This link shows your order details. Don't share it.</span>
    </p>

    <p><strong>What's Next?</strong></p>
    <ul>
      <li>We'll prepare your Satoshi Pet for shipping</li>
      <li>You'll receive a shipping confirmation email with tracking info</li>
      <li>Once it arrives, visit <a href="https://satoshipet.com/setup">satoshipet.com/setup</a> to get started</li>
    </ul>

    <p style="text-align:center;">
      <a href="https://ganamos.earth/auth/register" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Create Your Account</a>
    </p>

    <div style="text-align:center;margin-top:40px;color:#6b7280;font-size:14px;">
      <p>Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
      <p>© ${new Date().getFullYear()} Satoshi Pet. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return { subject: `Order Confirmed: ${order.order_number} - Satoshi Pet`, html }
}

export function renderAdminOrderNotificationEmail(
  order: PetOrderRow,
  opts: { paidAfterCancel?: boolean } = {}
): { subject: string; html: string } {
  const fmt = (n: unknown) => (n == null ? "N/A" : escapeHtml(Number(n).toLocaleString("en-US")))
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#ffffff;border-radius:12px;padding:24px;margin-bottom:16px;">
      ${opts.paidAfterCancel
        ? `<h1 style="color:#b91c1c;margin:0 0 16px;font-size:24px;">Paid after cancellation: refund due</h1>
      <p style="margin:0 0 12px;">This order was cancelled before its invoice was paid. The payment has been recorded; refund the buyer and keep the order cancelled.</p>`
        : `<h1 style="color:#15803d;margin:0 0 16px;font-size:24px;">New Satoshi Pet Order (paid)</h1>`}
      <p style="color:#6b7280;font-size:14px;margin:0 0 4px;">Order Number</p>
      <p style="font-size:28px;font-weight:bold;color:#7c3aed;margin:0;">${escapeHtml(order.order_number)}</p>
      <p style="margin:8px 0 0;">${order.is_preorder ? "Pre-order" : "Order"}</p>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:24px;margin-bottom:16px;">
      <h2 style="color:#1a1a1a;margin:0 0 12px;font-size:18px;">Payment</h2>
      <p style="font-size:28px;font-weight:bold;color:#15803d;margin:0 0 12px;">${fmt(order.total_price_sats)} sats</p>
      <p style="margin:0;">Device: ${fmt(order.device_price_sats)} sats &middot; Shipping: ${fmt(order.shipping_price_sats)} sats</p>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:24px;margin-bottom:16px;">
      <h2 style="color:#1a1a1a;margin:0 0 12px;font-size:18px;">Customer</h2>
      <p style="margin:0;">${escapeHtml(order.full_name)}<br>${escapeHtml(order.email)}</p>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:24px;margin-bottom:16px;">
      <h2 style="color:#1a1a1a;margin:0 0 12px;font-size:18px;">Shipping Address</h2>
      <p style="margin:0;">${addressLinesHtml(order)}</p>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:24px;text-align:center;">
      <a href="https://ganamos.earth/admin/orders" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View in Admin Dashboard</a>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:20px;">Payment recorded at ${escapeHtml(new Date().toISOString())}</p>
  </div>
</body>
</html>`
  return {
    subject: `${opts.paidAfterCancel ? "REFUND DUE - paid after cancellation" : "New Order"}: ${order.order_number} - ${Number(order.total_price_sats).toLocaleString("en-US")} sats`,
    html,
  }
}

async function sendOrderConfirmationEmail(order: PetOrderRow): Promise<void> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured, skipping confirmation email")
      return
    }
    const { subject, html } = renderOrderConfirmationEmail(order)
    await new Resend(resendApiKey).emails.send({
      from: "Satoshi Pet <orders@ganamos.earth>",
      to: order.email,
      subject,
      html,
    })
    console.log(`Order confirmation email sent for order ${order.order_number}`)
  } catch (error) {
    // Email failure must not undo a recorded payment
    console.error("Failed to send order confirmation email:", error)
  }
}

async function sendAdminOrderNotification(order: PetOrderRow, opts: { paidAfterCancel?: boolean } = {}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL
  try {
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey || !adminEmail) {
      console.warn("RESEND_API_KEY or ADMIN_EMAIL not configured, skipping admin notification")
      return
    }
    const { subject, html } = renderAdminOrderNotificationEmail(order, opts)
    await new Resend(resendApiKey).emails.send({
      from: "Satoshi Pet Orders <orders@ganamos.earth>",
      to: adminEmail,
      subject,
      html,
    })
    console.log(`Admin notification sent for order ${order.order_number}`)
  } catch (error) {
    console.error("Failed to send admin notification:", error)
  }
}
