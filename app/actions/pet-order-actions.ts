"use server"

import { headers } from "next/headers"
import { createServerSupabaseClient } from "@/lib/supabase"
import { createInvoice, checkInvoice } from "@/lib/lightning"
import { checkRateLimit } from "@/lib/rate-limiter"
import {
  SHIPPING_BASE_SATS,
  SHIPPING_AK_HI_SATS,
  VALID_US_STATES,
  PET_PREORDER_ACTIVE,
  PET_INVOICE_EXPIRY_SECONDS,
  currentPetDevicePriceSats,
} from "@/lib/pet-order-constants"
import { validatePetOrderShipping, type PetOrderShippingInput } from "@/lib/pet-order-validation"
import {
  PET_ORDER_COLUMNS,
  ORDER_NUMBER_REGEX,
  accessTokenMatches,
  generateAccessToken,
  generateOrderNumber,
  hashClientIp,
  invoiceExpiresAt,
  isInvoiceDead,
  maskEmail,
  markPetOrderPaid,
  syncPetOrderPayment,
} from "@/lib/pet-orders"

// Durable (DB-backed) limits on order creation: they hold across Vercel instances.
const MAX_ORDERS_PER_EMAIL_PER_HOUR = 5
const MAX_ORDERS_PER_IP_PER_HOUR = 10

export type CreateOrderParams = PetOrderShippingInput

interface CreateOrderResult {
  success: boolean
  orderNumber?: string
  accessToken?: string
  totalSats?: number
  error?: string
  fieldErrors?: Record<string, string>
}

// Untyped: the generated DB types don't include pet_orders' newer columns, and
// select(PET_ORDER_COLUMNS) is a runtime string.
function adminClient(): any {
  return createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
}

function clientIp(): string {
  try {
    const h = headers()
    const forwarded = h.get("x-forwarded-for")
    return (forwarded && forwarded.split(",")[0].trim()) || h.get("x-real-ip") || "unknown"
  } catch {
    return "unknown"
  }
}

/** Per-instance limiter for cheap first-line throttling (the DB checks are the durable ones). */
function allowRequest(kind: string, maxRequests: number, windowMs: number): boolean {
  return checkRateLimit(`pet-order:${kind}:${hashClientIp(clientIp())}`, { maxRequests, windowMs }).allowed
}

/**
 * Calculate shipping cost based on destination
 * For now, flat rate for US shipping
 */
export async function calculateShippingCost(state: string, postalCode: string): Promise<{
  success: boolean
  shippingSats?: number
  estimatedDays?: string
  error?: string
}> {
  const stateUpper = String(state || "").toUpperCase()
  if (!VALID_US_STATES.includes(stateUpper)) {
    return { success: false, error: "Invalid US state. We currently only ship within the United States." }
  }

  // Alaska and Hawaii get higher shipping. estimatedDays is transit time once shipped.
  let shippingSats = SHIPPING_BASE_SATS
  let estimatedDays = "5-7 business days"

  if (stateUpper === 'AK' || stateUpper === 'HI') {
    shippingSats = SHIPPING_AK_HI_SATS
    estimatedDays = "7-10 business days"
  }

  return {
    success: true,
    shippingSats,
    estimatedDays,
  }
}

/**
 * Create a new pet device order with Lightning invoice.
 * Price and pre-order status are decided here, never by the client.
 */
export async function createPetOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  try {
    const validation = validatePetOrderShipping(params || ({} as CreateOrderParams))
    if (!validation.ok) {
      const first = Object.values(validation.errors)[0]
      return { success: false, error: first || "Please check your shipping details", fieldErrors: validation.errors as Record<string, string> }
    }
    const ship = validation.value

    if (!allowRequest("create", 20, 3600_000)) {
      return { success: false, error: "Too many orders from this network. Please try again later." }
    }

    const shippingResult = await calculateShippingCost(ship.state, ship.postalCode)
    if (!shippingResult.success) {
      return { success: false, error: shippingResult.error }
    }

    const isPreorder = PET_PREORDER_ACTIVE
    const devicePriceSats = currentPetDevicePriceSats()
    const shippingPriceSats = shippingResult.shippingSats!
    const totalPriceSats = devicePriceSats + shippingPriceSats

    const adminSupabase = adminClient()
    const now = Date.now()
    const ipHash = hashClientIp(clientIp())

    // Durable rate limits: recent orders by email and by (hashed) IP.
    const hourAgo = new Date(now - 3600_000).toISOString()
    const [byEmail, byIp] = await Promise.all([
      adminSupabase.from("pet_orders").select("id").eq("email", ship.email).gte("created_at", hourAgo).limit(MAX_ORDERS_PER_EMAIL_PER_HOUR),
      adminSupabase.from("pet_orders").select("id").eq("client_ip_hash", ipHash).gte("created_at", hourAgo).limit(MAX_ORDERS_PER_IP_PER_HOUR),
    ])
    if (byEmail.error || byIp.error) {
      console.error("Failed to check order rate limits:", byEmail.error || byIp.error)
      return { success: false, error: "Failed to create order. Please try again." }
    }
    if ((byEmail.data?.length ?? 0) >= MAX_ORDERS_PER_EMAIL_PER_HOUR || (byIp.data?.length ?? 0) >= MAX_ORDERS_PER_IP_PER_HOUR) {
      return { success: false, error: "Too many orders in the last hour. Please try again later or email support@ganamos.earth." }
    }

    // Get current Bitcoin price for USD reference (record only; never affects the invoice amount)
    let bitcoinPriceUsd: number | null = null
    try {
      const { data: priceData } = await adminSupabase
        .from("bitcoin_prices")
        .select("price")
        .eq("currency", "USD")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (priceData?.price) {
        bitcoinPriceUsd = Number(priceData.price)
      }
    } catch (e) {
      console.warn("Could not fetch Bitcoin price for order record")
    }

    const satsToUsd = (sats: number) => {
      if (!bitcoinPriceUsd) return null
      return Number((sats / 100000000 * bitcoinPriceUsd).toFixed(2))
    }

    const orderNumber = generateOrderNumber()
    const accessToken = generateAccessToken()

    // Memo carries the order number only (no buyer details). Expiry is measured from
    // before the invoice is created, so ours is never later than the node's.
    const expiresAt = new Date(Date.now() + PET_INVOICE_EXPIRY_SECONDS * 1000)
    const invoiceResult: any = await createInvoice(totalPriceSats, `SATOSHI-PET-ORDER: ${orderNumber}`)

    if (!invoiceResult.success) {
      console.error("Failed to create Lightning invoice:", invoiceResult.error)
      return { success: false, error: "Failed to create payment invoice. Please try again." }
    }

    const { data: order, error: orderError } = await adminSupabase
      .from("pet_orders")
      .insert({
        order_number: orderNumber,
        access_token: accessToken,
        client_ip_hash: ipHash,
        email: ship.email,
        full_name: ship.fullName,
        address_line1: ship.addressLine1,
        address_line2: ship.addressLine2,
        city: ship.city,
        state: ship.state,
        postal_code: ship.postalCode,
        country: 'US',
        device_price_sats: devicePriceSats,
        shipping_price_sats: shippingPriceSats,
        total_price_sats: totalPriceSats,
        device_price_usd: satsToUsd(devicePriceSats),
        shipping_price_usd: satsToUsd(shippingPriceSats),
        total_price_usd: satsToUsd(totalPriceSats),
        bitcoin_price_usd: bitcoinPriceUsd,
        payment_request: invoiceResult.paymentRequest,
        payment_hash: invoiceResult.rHash,
        invoice_expires_at: expiresAt.toISOString(),
        payment_status: 'pending',
        order_status: 'pending',
        is_preorder: isPreorder,
      })
      .select("order_number, access_token, total_price_sats")
      .single()

    if (orderError || !order) {
      console.error("Failed to store order:", orderError)
      return { success: false, error: "Failed to create order. Please try again." }
    }

    return {
      success: true,
      orderNumber: order.order_number,
      accessToken: order.access_token,
      totalSats: order.total_price_sats,
    }
  } catch (error) {
    console.error("Unexpected error creating pet order:", error)
    return { success: false, error: "An unexpected error occurred. Please try again." }
  }
}

/**
 * Check payment status for an order (browser poll). Same code path as the
 * reconcile cron (syncPetOrderPayment). Returns no buyer details.
 */
export async function checkOrderPaymentStatus(paymentHash: string): Promise<{
  success: boolean
  paid?: boolean
  expired?: boolean
  orderNumber?: string
  error?: string
}> {
  try {
    if (typeof paymentHash !== "string" || !/^[0-9a-f]{64}$/i.test(paymentHash)) {
      return { success: false, error: "Order not found" }
    }
    if (!allowRequest("poll", 60, 60_000)) {
      return { success: false, error: "Too many requests" }
    }

    const adminSupabase = adminClient()
    const { data: order, error: orderError } = await adminSupabase
      .from("pet_orders")
      .select(PET_ORDER_COLUMNS)
      .eq("payment_hash", paymentHash)
      .single()

    if (orderError || !order) {
      return { success: false, error: "Order not found" }
    }

    const result = await syncPetOrderPayment(adminSupabase, order)
    if (result.status === "error") {
      return { success: false, error: result.error }
    }
    return {
      success: true,
      paid: result.status === "paid",
      expired: result.status === "expired",
      orderNumber: order.order_number,
    }
  } catch (error) {
    console.error("Error checking order payment status:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export interface PublicOrderView {
  orderNumber: string
  paymentStatus: string
  orderStatus: string
  totalPriceSats: number
  createdAt: string
  isPreorder: boolean
  city: string
  state: string
  maskedEmail: string
}

export interface FullOrderView extends PublicOrderView {
  email: string
  fullName: string
  devicePriceSats: number
  shippingPriceSats: number
  shippingAddress: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
  }
  trackingNumber: string | null
  /** Only while the order is unpaid */
  paymentRequest: string | null
  paymentHash: string | null
  invoiceExpiresAt: string | null
}

/**
 * Get order details by order number. Without the order's access token this
 * returns only non-identifying fields; with it (`?t=` from the checkout
 * redirect or the confirmation email), the full order.
 */
export async function getOrderByNumber(orderNumber: string, accessToken?: string | null): Promise<{
  success: boolean
  hasAccess?: boolean
  order?: PublicOrderView | FullOrderView
  error?: string
}> {
  try {
    if (!allowRequest("lookup", 30, 60_000)) {
      return { success: false, error: "Too many requests. Please wait a minute and try again." }
    }
    const normalized = String(orderNumber || "").trim().toUpperCase()
    if (!ORDER_NUMBER_REGEX.test(normalized)) {
      return { success: false, error: "Order not found" }
    }

    const { data: order, error } = await adminClient()
      .from("pet_orders")
      .select(PET_ORDER_COLUMNS)
      .eq("order_number", normalized)
      .single()

    if (error || !order) {
      return { success: false, error: "Order not found" }
    }

    const publicView: PublicOrderView = {
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      totalPriceSats: order.total_price_sats,
      createdAt: order.created_at,
      isPreorder: order.is_preorder === true,
      city: order.city,
      state: order.state,
      maskedEmail: maskEmail(order.email || ""),
    }

    if (!accessTokenMatches(accessToken, order.access_token)) {
      return { success: true, hasAccess: false, order: publicView }
    }

    const unpaid = order.payment_status === "pending" || order.payment_status === "expired"
    const full: FullOrderView = {
      ...publicView,
      email: order.email,
      fullName: order.full_name,
      devicePriceSats: order.device_price_sats,
      shippingPriceSats: order.shipping_price_sats,
      shippingAddress: {
        line1: order.address_line1,
        line2: order.address_line2 || undefined,
        city: order.city,
        state: order.state,
        postalCode: order.postal_code,
      },
      trackingNumber: order.tracking_number ?? null,
      paymentRequest: unpaid ? order.payment_request : null,
      paymentHash: unpaid ? order.payment_hash : null,
      invoiceExpiresAt: unpaid ? invoiceExpiresAt(order).toISOString() : null,
    }
    return { success: true, hasAccess: true, order: full }
  } catch (error) {
    console.error("Error fetching order:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Replace the expired invoice of an unpaid order with a new one for the same
 * amount. Requires the order's access token. Checks the old invoice with the
 * node first: if it was paid after all, records the payment instead.
 */
export async function renewPetOrderInvoice(orderNumber: string, accessToken: string): Promise<{
  success: boolean
  paid?: boolean
  paymentRequest?: string
  paymentHash?: string
  invoiceExpiresAt?: string
  error?: string
}> {
  try {
    if (!allowRequest("renew", 10, 3600_000)) {
      return { success: false, error: "Too many requests. Please try again later." }
    }
    const normalized = String(orderNumber || "").trim().toUpperCase()
    if (!ORDER_NUMBER_REGEX.test(normalized)) return { success: false, error: "Order not found" }

    const adminSupabase = adminClient()
    const { data: order, error } = await adminSupabase
      .from("pet_orders")
      .select(PET_ORDER_COLUMNS)
      .eq("order_number", normalized)
      .single()

    if (error || !order || !accessTokenMatches(accessToken, order.access_token)) {
      return { success: false, error: "Order not found" }
    }
    if (order.payment_status === "paid") return { success: true, paid: true }
    if (order.order_status === "cancelled") {
      return { success: false, error: "This order was cancelled. Please contact support@ganamos.earth." }
    }
    if (order.payment_status !== "pending" && order.payment_status !== "expired") {
      return { success: false, error: "This order can't be paid. Please contact support@ganamos.earth." }
    }
    if (!order.payment_hash) return { success: false, error: "Order has no invoice" }

    const inv: any = await checkInvoice(order.payment_hash)
    if (!inv.success) return { success: false, error: "Failed to check payment status. Please try again." }
    if (inv.settled === true || inv.state === "SETTLED") {
      const result = await markPetOrderPaid(adminSupabase, order)
      return result.status === "paid" ? { success: true, paid: true } : { success: false, error: "Failed to record payment" }
    }
    if (!isInvoiceDead(inv, invoiceExpiresAt(order), new Date())) {
      return { success: false, error: "The current invoice hasn't expired yet. Please wait a moment and try again." }
    }

    const expiresAt = new Date(Date.now() + PET_INVOICE_EXPIRY_SECONDS * 1000)
    const invoiceResult: any = await createInvoice(order.total_price_sats, `SATOSHI-PET-ORDER: ${order.order_number}`)
    if (!invoiceResult.success) {
      console.error("Failed to create renewal invoice:", invoiceResult.error)
      return { success: false, error: "Failed to create payment invoice. Please try again." }
    }

    const { data: updated, error: updateError } = await adminSupabase
      .from("pet_orders")
      .update({
        payment_request: invoiceResult.paymentRequest,
        payment_hash: invoiceResult.rHash,
        invoice_expires_at: expiresAt.toISOString(),
        payment_status: "pending",
      })
      .eq("id", order.id)
      .eq("payment_hash", order.payment_hash)
      .in("payment_status", ["pending", "expired"])
      .select("payment_request, payment_hash, invoice_expires_at")

    if (updateError || !updated || updated.length === 0) {
      // Changed concurrently (paid, or renewed in another tab): the caller reloads the order.
      return { success: false, error: "This order was updated. Please reload the page." }
    }

    return {
      success: true,
      paid: false,
      paymentRequest: updated[0].payment_request,
      paymentHash: updated[0].payment_hash,
      invoiceExpiresAt: updated[0].invoice_expires_at,
    }
  } catch (error) {
    console.error("Error renewing pet order invoice:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}
