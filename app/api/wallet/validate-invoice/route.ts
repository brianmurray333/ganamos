import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { decodeLightningInvoice } from "@/lib/lightning-validation"

/**
 * POST /api/wallet/validate-invoice
 * Validates a Lightning invoice for potential issues before payment attempt
 * - Checks if invoice has already been used (duplicate payment request)
 * - Validates invoice format
 * - Returns decoded invoice info
 */
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const paymentRequest = body.paymentRequest as string

    if (!paymentRequest) {
      return NextResponse.json({ success: false, error: "Missing payment request" }, { status: 400 })
    }

    // Validate invoice format
    const decoded = decodeLightningInvoice(paymentRequest)
    if (!decoded.isValid) {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid Lightning invoice format",
        code: "INVALID_FORMAT"
      }, { status: 400 })
    }

    // Check if this invoice has already been used (prevent duplicate payments)
    // We store the payment_request in the transactions table
    const { data: existingTransaction } = await supabase
      .from("transactions")
      .select("id, status, created_at")
      .eq("payment_request", paymentRequest)
      .in("status", ["completed", "pending", "pending_approval", "processing"])
      .maybeSingle()

    if (existingTransaction) {
      const statusMessage = existingTransaction.status === "completed" 
        ? "This invoice has already been paid."
        : "This invoice is currently being processed."
      
      return NextResponse.json({ 
        success: false, 
        error: statusMessage,
        code: "INVOICE_ALREADY_USED",
        existingTransactionId: existingTransaction.id,
        existingStatus: existingTransaction.status
      }, { status: 400 })
    }

    // Invoice is valid and hasn't been used
    return NextResponse.json({
      success: true,
      decoded: {
        amount: decoded.amount,
        description: decoded.description,
        hasFixedAmount: decoded.amount !== null && decoded.amount > 0,
      }
    })

  } catch (error) {
    console.error("Error validating invoice:", error)
    return NextResponse.json({ success: false, error: "Failed to validate invoice" }, { status: 500 })
  }
}

