"use server"

import { createServerSupabaseClient } from "@/lib/supabase"
import { createInvoice, checkInvoice } from "@/lib/lightning"
import { Resend } from "resend"
import { 
  PET_DEVICE_LIST_PRICE_SATS, 
  PET_DEVICE_PREORDER_PRICE_SATS,
  SHIPPING_BASE_SATS,
  SHIPPING_AK_HI_SATS,
  VALID_US_STATES,
} from "@/lib/pet-order-constants"

interface CreateOrderParams {
  email: string
  fullName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  isPreorder?: boolean
}

interface CreateOrderResult {
  success: boolean
  orderId?: string
  orderNumber?: string
  paymentRequest?: string
  paymentHash?: string
  totalSats?: number
  devicePriceSats?: number
  shippingPriceSats?: number
  error?: string
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
  const stateUpper = state.toUpperCase()
  if (!VALID_US_STATES.includes(stateUpper)) {
    return { success: false, error: "Invalid US state. We currently only ship within the United States." }
  }

  // Shipping tiers based on distance from fulfillment center (simplified)
  // Alaska and Hawaii get higher shipping
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
 * Create a new pet device order with Lightning invoice
 */
export async function createPetOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const {
    email,
    fullName,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    isPreorder = true,
  } = params

  try {
    // Validate inputs
    if (!email || !fullName || !addressLine1 || !city || !state || !postalCode) {
      return { success: false, error: "All fields are required" }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return { success: false, error: "Invalid email address" }
    }

    // Calculate shipping
    const shippingResult = await calculateShippingCost(state, postalCode)
    if (!shippingResult.success) {
      return { success: false, error: shippingResult.error }
    }

    // Calculate total
    const devicePriceSats = isPreorder ? PET_DEVICE_PREORDER_PRICE_SATS : PET_DEVICE_LIST_PRICE_SATS
    const shippingPriceSats = shippingResult.shippingSats!
    const totalPriceSats = devicePriceSats + shippingPriceSats

    // Get current Bitcoin price for USD reference
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

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

    // Calculate USD equivalents
    const satsToUsd = (sats: number) => {
      if (!bitcoinPriceUsd) return null
      return Number((sats / 100000000 * bitcoinPriceUsd).toFixed(2))
    }

    // Create Lightning invoice with distinct memo for order tracking
    // Format: "SATOSHI-PET-ORDER: [details]" - this allows easy filtering
    const memo = `SATOSHI-PET-ORDER: ${isPreorder ? 'Pre-order' : 'Order'} for ${fullName} (${totalPriceSats} sats)`
    const invoiceResult = await createInvoice(totalPriceSats, memo)

    if (!invoiceResult.success) {
      console.error("Failed to create Lightning invoice:", invoiceResult.error)
      return { success: false, error: "Failed to create payment invoice. Please try again." }
    }

    // Store order in database
    const { data: order, error: orderError } = await adminSupabase
      .from("pet_orders")
      .insert({
        email: email.toLowerCase(),
        full_name: fullName,
        address_line1: addressLine1,
        address_line2: addressLine2 || null,
        city,
        state: state.toUpperCase(),
        postal_code: postalCode,
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
        payment_status: 'pending',
        order_status: 'pending',
        is_preorder: isPreorder,
      })
      .select()
      .single()

    if (orderError) {
      console.error("Failed to store order:", orderError)
      return { success: false, error: "Failed to create order. Please try again." }
    }

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      paymentRequest: invoiceResult.paymentRequest,
      paymentHash: invoiceResult.rHash,
      totalSats: totalPriceSats,
      devicePriceSats,
      shippingPriceSats,
    }
  } catch (error) {
    console.error("Unexpected error creating pet order:", error)
    return { success: false, error: "An unexpected error occurred. Please try again." }
  }
}

/**
 * Check payment status for an order
 */
export async function checkOrderPaymentStatus(paymentHash: string): Promise<{
  success: boolean
  paid?: boolean
  orderNumber?: string
  email?: string
  error?: string
}> {
  try {
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // First check our database
    const { data: order, error: orderError } = await adminSupabase
      .from("pet_orders")
      .select("*")
      .eq("payment_hash", paymentHash)
      .single()

    if (orderError || !order) {
      return { success: false, error: "Order not found" }
    }

    // If already marked as paid, return success
    if (order.payment_status === 'paid') {
      return {
        success: true,
        paid: true,
        orderNumber: order.order_number,
        email: order.email,
      }
    }

    // Check Lightning invoice status
    const invoiceStatus = await checkInvoice(paymentHash)

    if (!invoiceStatus.success) {
      return { success: false, error: "Failed to check payment status" }
    }

    // If invoice is settled, update order
    if (invoiceStatus.settled) {
      const { error: updateError } = await adminSupabase
        .from("pet_orders")
        .update({
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          order_status: 'confirmed',
        })
        .eq("payment_hash", paymentHash)

      if (updateError) {
        console.error("Failed to update order status:", updateError)
      }

      // Send confirmation email to customer
      await sendOrderConfirmationEmail(order.email, order.order_number, order.full_name, order.total_price_sats)

      // Send admin notification
      await sendAdminOrderNotification(order)

      return {
        success: true,
        paid: true,
        orderNumber: order.order_number,
        email: order.email,
      }
    }

    return {
      success: true,
      paid: false,
      orderNumber: order.order_number,
      email: order.email,
    }
  } catch (error) {
    console.error("Error checking order payment status:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Get order details by order number
 */
export async function getOrderByNumber(orderNumber: string): Promise<{
  success: boolean
  order?: {
    orderNumber: string
    email: string
    fullName: string
    totalPriceSats: number
    paymentStatus: string
    orderStatus: string
    createdAt: string
    shippingAddress: {
      line1: string
      line2?: string
      city: string
      state: string
      postalCode: string
    }
  }
  error?: string
}> {
  try {
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    const { data: order, error } = await adminSupabase
      .from("pet_orders")
      .select("*")
      .eq("order_number", orderNumber.toUpperCase())
      .single()

    if (error || !order) {
      return { success: false, error: "Order not found" }
    }

    return {
      success: true,
      order: {
        orderNumber: order.order_number,
        email: order.email,
        fullName: order.full_name,
        totalPriceSats: order.total_price_sats,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        createdAt: order.created_at,
        shippingAddress: {
          line1: order.address_line1,
          line2: order.address_line2,
          city: order.city,
          state: order.state,
          postalCode: order.postal_code,
        },
      },
    }
  } catch (error) {
    console.error("Error fetching order:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Send order confirmation email
 */
async function sendOrderConfirmationEmail(
  email: string,
  orderNumber: string,
  customerName: string,
  totalSats: number
): Promise<void> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured, skipping confirmation email")
      return
    }

    const resend = new Resend(resendApiKey)

    await resend.emails.send({
      from: "Satoshi Pet <orders@ganamos.earth>",
      to: email,
      subject: `Order Confirmed: ${orderNumber} - Satoshi Pet`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { width: 80px; height: 80px; background: linear-gradient(135deg, #a855f7, #3b82f6); border-radius: 50%; margin: 0 auto 16px; }
            h1 { color: #1a1a1a; margin: 0; }
            .order-box { background: #f9fafb; border-radius: 12px; padding: 24px; margin: 24px 0; }
            .order-number { font-size: 24px; font-weight: bold; color: #22c55e; }
            .details { margin-top: 16px; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .detail-row:last-child { border-bottom: none; }
            .footer { text-align: center; margin-top: 40px; color: #6b7280; font-size: 14px; }
            .button { display: inline-block; background: #22c55e; color: white !important; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo"></div>
              <h1 style="color: #ffffff !important;">Thank You for Your Order!</h1>
            </div>
            
            <p>Hi ${customerName},</p>
            
            <p>We've received your Satoshi Pet pre-order and your payment has been confirmed. We're excited to ship your new Bitcoin companion soon!</p>
            
            <div class="order-box">
              <p style="margin: 0 0 8px; color: #6b7280;">Order Number</p>
              <p class="order-number">${orderNumber}</p>
              
              <div class="details">
                <div class="detail-row">
                  <span>Amount Paid</span>
                  <span><strong>${totalSats.toLocaleString()} sats</strong></span>
                </div>
                <div class="detail-row">
                  <span>Status</span>
                  <span><strong style="color: #22c55e;">Confirmed</strong></span>
                </div>
              </div>
            </div>
            
            <p><strong>What's Next?</strong></p>
            <ul>
              <li>We'll prepare your Satoshi Pet for shipping</li>
              <li>You'll receive a shipping confirmation email with tracking info</li>
              <li>Once it arrives, visit <a href="https://satoshipet.com/setup">satoshipet.com/setup</a> to get started</li>
            </ul>
            
            <p style="text-align: center;">
              <a href="https://ganamos.earth" class="button">Create Your Account</a>
            </p>
            
            <div class="footer">
              <p>Questions? Reply to this email or visit <a href="https://satoshipet.com">satoshipet.com</a></p>
              <p>© ${new Date().getFullYear()} Satoshi Pet. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    console.log(`Order confirmation email sent to ${email} for order ${orderNumber}`)
  } catch (error) {
    console.error("Failed to send order confirmation email:", error)
    // Don't throw - email failure shouldn't break the order flow
  }
}

/**
 * Send admin notification for new order
 */
async function sendAdminOrderNotification(order: any): Promise<void> {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL
  
  try {
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured, skipping admin notification")
      return
    }

    const resend = new Resend(resendApiKey)

    const shippingAddress = [
      order.address_line1,
      order.address_line2,
      `${order.city}, ${order.state} ${order.postal_code}`,
    ].filter(Boolean).join("<br>")

    await resend.emails.send({
      from: "Satoshi Pet Orders <orders@ganamos.earth>",
      to: ADMIN_EMAIL,
      subject: `🎉 New Order: ${order.order_number} - ${order.total_price_sats.toLocaleString()} sats`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            h1 { color: #22c55e; margin: 0 0 16px; font-size: 24px; }
            h2 { color: #1a1a1a; margin: 0 0 12px; font-size: 18px; }
            .order-number { font-size: 28px; font-weight: bold; color: #8b5cf6; }
            .amount { font-size: 32px; font-weight: bold; color: #22c55e; }
            .label { color: #6b7280; font-size: 14px; margin-bottom: 4px; }
            .value { font-size: 16px; color: #1a1a1a; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
            .button { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h1 style="color: #22c55e !important;">🎉 New Satoshi Pet Order!</h1>
              <p class="label">Order Number</p>
              <p class="order-number">${order.order_number}</p>
            </div>
            
            <div class="card">
              <h2>💰 Payment</h2>
              <p class="label">Amount</p>
              <p class="amount">${order.total_price_sats.toLocaleString()} sats</p>
              <div class="grid">
                <div>
                  <p class="label">Device Price</p>
                  <p class="value">${order.device_price_sats?.toLocaleString() || 'N/A'} sats</p>
                </div>
                <div>
                  <p class="label">Shipping</p>
                  <p class="value">${order.shipping_price_sats?.toLocaleString() || 'N/A'} sats</p>
                </div>
              </div>
            </div>
            
            <div class="card">
              <h2>👤 Customer</h2>
              <p class="label">Name</p>
              <p class="value">${order.full_name}</p>
              <p class="label" style="margin-top: 12px;">Email</p>
              <p class="value">${order.email}</p>
            </div>
            
            <div class="card">
              <h2>📦 Shipping Address</h2>
              <p class="value">${shippingAddress}</p>
            </div>
            
            <div class="card" style="text-align: center;">
              <a href="https://ganamos.earth/admin/orders" class="button">View in Admin Dashboard</a>
            </div>
            
            <p style="text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px;">
              Order placed at ${new Date().toLocaleString()}
            </p>
          </div>
        </body>
        </html>
      `,
    })

    console.log(`Admin notification sent for order ${order.order_number}`)
  } catch (error) {
    console.error("Failed to send admin notification:", error)
    // Don't throw - email failure shouldn't break the order flow
  }
}

