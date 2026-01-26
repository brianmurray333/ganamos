import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase"
import { payInvoice } from "@/lib/lightning"
import { revalidatePath } from "next/cache"
import { v4 as uuidv4 } from "uuid"
import { sendBitcoinSentEmail } from "@/lib/transaction-emails"
import {
  logWithdrawalAudit,
  sendWithdrawalFailedEmail,
} from "@/lib/withdrawal-security"

// Admin email that can approve withdrawals
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'

export async function POST(request: Request) {
  try {
    // Verify admin authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    // Check if user is admin
    if (user.email !== ADMIN_EMAIL) {
      console.error('[Admin API] Non-admin attempted to approve withdrawal:', user.email)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const body = await request.json()
    const { transactionId, action, rejectionReason } = body as {
      transactionId: string
      action: 'approve' | 'reject'
      rejectionReason?: string
    }

    if (!transactionId || !action) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Get the pending transaction
    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .eq("status", "pending_approval")
      .eq("type", "withdrawal")
      .single()

    if (txError || !transaction) {
      return NextResponse.json({ 
        success: false, 
        error: "Transaction not found or already processed" 
      }, { status: 404 })
    }

    // Get user profile
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("balance, email, name")
      .eq("id", transaction.user_id)
      .single()

    if (!profile) {
      return NextResponse.json({ success: false, error: "User profile not found" }, { status: 404 })
    }

    if (action === 'reject') {
      // Reject the withdrawal
      await adminSupabase
        .from("transactions")
        .update({
          status: "rejected",
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectionReason || "Rejected by admin",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)

      await logWithdrawalAudit(adminSupabase, {
        transactionId,
        userId: transaction.user_id,
        action: 'rejected',
        details: { 
          rejectedBy: user.email,
          reason: rejectionReason,
        },
      })

      // Notify user with generic failure message (doesn't reveal approval workflow)
      if (profile.email && !profile.email.includes('@ganamos.app')) {
        sendWithdrawalFailedEmail(
          profile.email,
          profile.name || 'User',
          transaction.amount
        ).catch(err => console.error('[Admin] Rejection email failed:', err))
      }

      revalidatePath("/admin/transactions")

      return NextResponse.json({
        success: true,
        message: "Withdrawal rejected",
      })
    }

    // Approve and process the withdrawal
    
    // First verify balance is still sufficient
    if (profile.balance < transaction.amount) {
      await adminSupabase
        .from("transactions")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)

      await logWithdrawalAudit(adminSupabase, {
        transactionId,
        userId: transaction.user_id,
        action: 'failed',
        details: { reason: 'Insufficient balance at approval time' },
      })

      return NextResponse.json({
        success: false,
        error: "User no longer has sufficient balance",
      }, { status: 400 })
    }

    // Update transaction to approved
    await adminSupabase
      .from("transactions")
      .update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId)

    await logWithdrawalAudit(adminSupabase, {
      transactionId,
      userId: transaction.user_id,
      action: 'approved',
      details: { approvedBy: user.email },
    })

    // Process the payment
    console.log("[Admin Approve] Processing withdrawal:", transactionId)
    const paymentResult = await payInvoice(transaction.payment_request, transaction.amount)
    
    if (!paymentResult.success) {
      console.error("[Admin Approve] Payment failed:", paymentResult.error)
      
      await adminSupabase
        .from("transactions")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)

      await logWithdrawalAudit(adminSupabase, {
        transactionId,
        userId: transaction.user_id,
        action: 'failed',
        details: { error: paymentResult.error },
      })

      return NextResponse.json({
        success: false,
        error: "Payment failed: " + paymentResult.error,
      }, { status: 500 })
    }

    // Payment succeeded - update transaction and balance
    await adminSupabase
      .from("transactions")
      .update({
        status: "completed",
        payment_hash: paymentResult.paymentHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId)

    const newBalance = profile.balance - transaction.amount
    await adminSupabase
      .from("profiles")
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.user_id)

    await logWithdrawalAudit(adminSupabase, {
      transactionId,
      userId: transaction.user_id,
      action: 'completed',
      details: { 
        paymentHash: paymentResult.paymentHash,
        newBalance,
      },
    })

    // Add activity
    await adminSupabase.from("activities").insert({
      id: uuidv4(),
      user_id: transaction.user_id,
      type: "withdrawal",
      related_id: transactionId,
      related_table: "transactions",
      timestamp: new Date().toISOString(),
      metadata: { amount: transaction.amount, status: "completed" },
    })

    // Notify user with standard bitcoin sent email (doesn't reveal approval workflow)
    if (profile.email && !profile.email.includes('@ganamos.app')) {
      sendBitcoinSentEmail({
        toEmail: profile.email,
        userName: profile.name || "User",
        amountSats: transaction.amount,
        date: new Date(),
        transactionType: 'withdrawal'
      }).catch(err => console.error('[Admin] Sent email failed:', err))
    }

    revalidatePath("/admin/transactions")
    revalidatePath("/wallet")

    return NextResponse.json({
      success: true,
      message: "Withdrawal approved and processed",
      paymentHash: paymentResult.paymentHash,
    })

  } catch (error) {
    console.error("Error in admin withdrawal approval:", error)
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 })
  }
}

