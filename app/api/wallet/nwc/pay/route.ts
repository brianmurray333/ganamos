/**
 * POST /api/wallet/nwc/pay
 * 
 * Pay a Lightning invoice using the user's connected NWC wallet
 * This does NOT touch the user's custodial balance - payment goes directly from their wallet
 * 
 * SECURITY:
 * - User must have an active NWC wallet connection
 * - Connection string is retrieved from database (never from client)
 * - Payment is logged for audit
 */

import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies, headers } from "next/headers"
import { createServerSupabaseClient } from "@/lib/supabase"
import { payInvoiceNWC } from "@/lib/nwc"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"
import { decodeLightningInvoice } from "@/lib/lightning-validation"

export async function POST(request: Request) {
  const headersList = await headers()
  const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown"
  const userAgent = headersList.get("user-agent") || "unknown"

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      )
    }

    // Rate limit payments
    const rateLimit = checkRateLimit(`nwc-pay:${user.id}`, {
      maxRequests: 10,
      windowMs: 60 * 1000, // 10 payments per minute
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Too many payment attempts. Please wait before trying again.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { paymentRequest, amount } = body

    if (!paymentRequest) {
      return NextResponse.json(
        { success: false, error: "Missing payment request" },
        { status: 400 }
      )
    }

    // Validate invoice format
    const decoded = decodeLightningInvoice(paymentRequest)
    if (!decoded.isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid Lightning invoice" },
        { status: 400 }
      )
    }

    // Get user's active NWC wallet
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    const { data: wallet } = await adminSupabase
      .from("user_wallets")
      .select("id, nwc_connection_encrypted, wallet_name, connection_status")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "No connected wallet found" },
        { status: 400 }
      )
    }

    if (wallet.connection_status !== "connected") {
      return NextResponse.json(
        { success: false, error: "Wallet is not connected" },
        { status: 400 }
      )
    }

    if (!wallet.nwc_connection_encrypted) {
      return NextResponse.json(
        { success: false, error: "Wallet connection is missing" },
        { status: 400 }
      )
    }

    // Log payment initiation
    await adminSupabase.from("wallet_connection_audit").insert({
      user_id: user.id,
      wallet_id: wallet.id,
      action: "payment_initiated",
      details: {
        amount: decoded.amount || amount,
        invoice_preview: paymentRequest.substring(0, 30) + "...",
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    })

    // Make the payment via NWC
    console.log(`[NWC Pay] Initiating payment for user ${user.id}`)
    const paymentResult = await payInvoiceNWC(
      wallet.nwc_connection_encrypted,
      paymentRequest
    )

    // Log payment result
    await adminSupabase.from("wallet_connection_audit").insert({
      user_id: user.id,
      wallet_id: wallet.id,
      action: paymentResult.success ? "payment_completed" : "payment_failed",
      details: {
        amount: decoded.amount || amount,
        preimage: paymentResult.preimage,
        error: paymentResult.error,
        errorCode: paymentResult.errorCode,
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    })

    if (!paymentResult.success) {
      console.log(`[NWC Pay] Payment failed: ${paymentResult.error}`)
      
      // Provide user-friendly error messages
      let errorMessage = paymentResult.error || "Payment failed"
      if (paymentResult.errorCode === "INSUFFICIENT_BALANCE") {
        errorMessage = "Insufficient balance in your connected wallet"
      } else if (paymentResult.errorCode === "NO_ROUTE") {
        errorMessage = "Could not find a route to pay this invoice"
      } else if (paymentResult.errorCode === "TIMEOUT") {
        errorMessage = "Payment timed out. Please try again"
      }

      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          code: paymentResult.errorCode,
        },
        { status: 400 }
      )
    }

    console.log(`[NWC Pay] Payment successful for user ${user.id}`)

    return NextResponse.json({
      success: true,
      preimage: paymentResult.preimage,
      walletName: wallet.wallet_name,
    })
  } catch (error) {
    console.error("[NWC Pay] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
