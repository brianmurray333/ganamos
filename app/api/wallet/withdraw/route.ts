import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase"
import { payInvoice } from "@/lib/lightning"
import { revalidatePath } from "next/cache"
import { v4 as uuidv4 } from "uuid"
import { sendBitcoinSentEmail } from "@/lib/transaction-emails"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"
import { sendRateLimitAlert } from "@/lib/security-alerts"
import {
  WITHDRAWAL_LIMITS,
  checkWithdrawalLimits,
  checkBalanceReconciliation,
  checkSystemWithdrawalThreshold,
  logWithdrawalAudit,
  sendReconciliationAlert,
  sendWithdrawalApprovalRequest,
  sendSystemThresholdAlert,
} from "@/lib/withdrawal-security"
import { toggleWithdrawals } from "@/app/actions/admin-actions"

export async function POST(request: Request) {
  // Get headers early for audit logging
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
  const userAgent = headersList.get('user-agent') || 'unknown'

  try {
    // Use the official Supabase Next.js helper for user verification
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.log("[Withdraw API] Auth error:", authError.message)
    } else if (user) {
      console.log("[Withdraw API] User authenticated:", user.id)
    } else {
      console.log("[Withdraw API] No user found")
    }

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    // SECURITY: Rate limiting - check per-minute limit
    const rateLimitMinute = checkRateLimit(`withdraw:${user.id}`, RATE_LIMITS.WALLET_WITHDRAW)
    if (!rateLimitMinute.allowed) {
      console.warn(`[SECURITY] Rate limit exceeded: User ${user.id} hit withdraw per-minute limit (${rateLimitMinute.totalRequests} requests)`)
      
      // Send alert email asynchronously
      sendRateLimitAlert({
        userId: user.id,
        userEmail: user.email,
        endpoint: '/api/wallet/withdraw',
        limitType: 'per-minute',
        requestCount: rateLimitMinute.totalRequests,
        maxAllowed: RATE_LIMITS.WALLET_WITHDRAW.maxRequests,
        ipAddress,
        userAgent,
      }).catch(err => console.error('[Security Alert] Failed to send:', err))

      return NextResponse.json({
        success: false,
        error: "Too many withdrawal attempts. Please wait before trying again.",
        retryAfter: Math.ceil((rateLimitMinute.resetTime - Date.now()) / 1000),
      }, { status: 429 })
    }

    // SECURITY: Rate limiting - check per-hour limit
    const rateLimitHour = checkRateLimit(`withdraw-hourly:${user.id}`, RATE_LIMITS.WALLET_WITHDRAW_HOURLY)
    if (!rateLimitHour.allowed) {
      console.warn(`[SECURITY] Rate limit exceeded: User ${user.id} hit withdraw hourly limit (${rateLimitHour.totalRequests} requests)`)
      
      // Send alert email asynchronously
      sendRateLimitAlert({
        userId: user.id,
        userEmail: user.email,
        endpoint: '/api/wallet/withdraw',
        limitType: 'per-hour',
        requestCount: rateLimitHour.totalRequests,
        maxAllowed: RATE_LIMITS.WALLET_WITHDRAW_HOURLY.maxRequests,
        ipAddress,
        userAgent,
      }).catch(err => console.error('[Security Alert] Failed to send:', err))

      return NextResponse.json({
        success: false,
        error: "Hourly withdrawal limit reached. Please try again later.",
        retryAfter: Math.ceil((rateLimitHour.resetTime - Date.now()) / 1000),
      }, { status: 429 })
    }
    
    // SECURITY: Withdrawals can be disabled instantly via database setting
    // To disable: UPDATE system_settings SET withdrawals_enabled = false WHERE id = 'main';
    // To enable:  UPDATE system_settings SET withdrawals_enabled = true WHERE id = 'main';
    // Use admin client to bypass RLS and check setting
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })
    
    const { data: settings } = await adminSupabase
      .from('system_settings')
      .select('withdrawals_enabled')
      .eq('id', 'main')
      .single()
    
    // Default to enabled if setting doesn't exist (for initial setup)
    const withdrawalsEnabled = settings?.withdrawals_enabled !== false
    if (!withdrawalsEnabled) {
      return NextResponse.json({ 
        success: false, 
        error: "Withdrawals are temporarily disabled for security maintenance" 
      }, { status: 503 })
    }
    
    // Parse body first to get the userId for connected accounts
    const body = await request.json()
    const paymentRequest = body.paymentRequest as string
    const amount = Number.parseInt(body.amount as string, 10)
    const requestedUserId = body.userId as string | undefined

    if (!paymentRequest || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Invalid payment request or amount" }, { status: 400 })
    }

    // SECURITY: Determine effective userId (own account or connected account)
    const authenticatedUserId = user.id
    let userId = authenticatedUserId // Default to authenticated user
    
    // If a different userId is requested, verify it's a connected account
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      const checkSupabase = createRouteHandlerClient({ cookies })
      const { data: connectedAccount } = await checkSupabase
        .from('connected_accounts')
        .select('id')
        .eq('primary_user_id', authenticatedUserId)
        .eq('connected_user_id', requestedUserId)
        .maybeSingle()
      
      if (!connectedAccount) {
        console.error('SECURITY ALERT: User attempted to withdraw from another account', {
          authenticatedUserId,
          requestedUserId
        })
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
      }
      
      userId = requestedUserId // Use the connected account's ID
    }

    // Reuse adminSupabase client (already created above for settings check)

    // Get user profile for balance, email, and status
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("balance, email, name, status")
      .eq("id", userId)
      .single()
      
    if (!profile) {
      return NextResponse.json({ success: false, error: "User profile not found" }, { status: 404 })
    }

    // SECURITY: Block suspended accounts from withdrawing
    if (profile.status === 'suspended') {
      console.warn('[SECURITY] Suspended account attempted withdrawal:', {
        userId,
        email: profile.email,
        amount,
        ipAddress,
        timestamp: new Date().toISOString(),
      })
      return NextResponse.json({ 
        success: false, 
        error: "Your account has been suspended. Please contact support." 
      }, { status: 403 })
    }

    // SECURITY: Check balance reconciliation BEFORE allowing withdrawal
    const reconciliation = await checkBalanceReconciliation(adminSupabase, userId)
    if (!reconciliation.reconciles) {
      console.error('[SECURITY] Balance reconciliation failed:', {
        userId,
        storedBalance: reconciliation.storedBalance,
        calculatedBalance: reconciliation.calculatedBalance,
        discrepancy: reconciliation.discrepancy,
      })

      // Send alerts asynchronously
      sendReconciliationAlert(
        userId,
        profile.email,
        reconciliation.storedBalance,
        reconciliation.calculatedBalance,
        reconciliation.discrepancy
      ).catch(err => console.error('[Security Alert] Reconciliation alert failed:', err))

      return NextResponse.json({
        success: false,
        error: "Unable to process withdrawal due to a balance verification issue. Support has been notified and will contact you shortly.",
      }, { status: 400 })
    }

    // SECURITY: Check withdrawal limits (before atomic operation)
    const limitsCheck = await checkWithdrawalLimits(adminSupabase, userId, amount)
    if (!limitsCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: limitsCheck.error,
      }, { status: 400 })
    }

    // SECURITY: Check system-wide withdrawal threshold (25k sats per hour across ALL users)
    // This check happens BEFORE creating the transaction to prevent exceeding the limit
    const systemThresholdCheck = await checkSystemWithdrawalThreshold(adminSupabase, amount)
    if (!systemThresholdCheck.allowed) {
      console.error('[SECURITY] System withdrawal threshold exceeded:', {
        userId,
        email: profile.email,
        amount,
        currentTotal: systemThresholdCheck.currentTotal,
        projectedTotal: systemThresholdCheck.projectedTotal,
        threshold: WITHDRAWAL_LIMITS.SYSTEM_HOURLY,
        ipAddress,
        timestamp: new Date().toISOString(),
      })

      // Send alerts asynchronously (email + SMS)
      sendSystemThresholdAlert(
        userId,
        profile.email,
        amount,
        systemThresholdCheck.currentTotal,
        systemThresholdCheck.projectedTotal,
        ipAddress
      ).catch(err => console.error('[Security Alert] System threshold alert failed:', err))

      // Auto-disable withdrawals system-wide
      toggleWithdrawals(false, `auto_disabled_25k_threshold_breach_at_${new Date().toISOString()}`)
        .then(result => {
          if (result.success) {
            console.log('[SECURITY] Withdrawals automatically disabled due to threshold breach')
          } else {
            console.error('[SECURITY] Failed to auto-disable withdrawals:', result.error)
          }
        })
        .catch(err => console.error('[Security Alert] Failed to toggle withdrawals:', err))

      // Return error to user (generic message, don't reveal threshold details)
      return NextResponse.json({
        success: false,
        error: systemThresholdCheck.error || 'Withdrawals are temporarily unavailable. Please try again later.',
      }, { status: 503 })
    }

    // SECURITY: Atomically check balance and create pending withdrawal
    // This prevents race conditions where two concurrent withdrawals both pass the balance check
    const transactionId = uuidv4()
    const requiresApproval = limitsCheck.requiresApproval || false

    const { data: createResult, error: createError } = await adminSupabase.rpc('create_pending_withdrawal', {
      p_transaction_id: transactionId,
      p_user_id: userId,
      p_amount: amount,
      p_payment_request: paymentRequest,
      p_memo: `Withdrawal of ${amount} sats from Ganamos!`,
      p_requires_approval: requiresApproval,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    })

    if (createError) {
      console.error('[Withdraw API] Error creating pending withdrawal:', createError)
      return NextResponse.json({ success: false, error: "Failed to create withdrawal" }, { status: 500 })
    }

    const txResult = createResult as { success: boolean; error?: string; transaction_id?: string; status?: string }
    
    if (!txResult.success) {
      // Check if it's an insufficient balance error
      if (txResult.error === 'Insufficient balance') {
        return NextResponse.json({ success: false, error: "Insufficient balance" }, { status: 400 })
      }
      console.error('[Withdraw API] Atomic withdrawal creation failed:', txResult.error)
      return NextResponse.json({ success: false, error: txResult.error || "Failed to create withdrawal" }, { status: 500 })
    }

    // Log audit event
    await logWithdrawalAudit(adminSupabase, {
      transactionId,
      userId,
      action: 'initiated',
      details: {
        amount,
        requiresApproval,
        dailyTotal: limitsCheck.warnings?.length ? 'near_limit' : 'ok',
      },
      ipAddress,
      userAgent,
    })

    // If requires approval, queue it and notify
    if (requiresApproval) {
      await logWithdrawalAudit(adminSupabase, {
        transactionId,
        userId,
        action: 'queued_for_approval',
        details: { amount, threshold: WITHDRAWAL_LIMITS.REQUIRES_APPROVAL },
        ipAddress,
        userAgent,
      })

      // Send admin notification (user doesn't need to know about approval workflow)
      sendWithdrawalApprovalRequest(
        transactionId,
        userId,
        profile.email,
        amount,
        ipAddress
      ).catch(err => console.error('[Withdrawal] Approval request email failed:', err))

      // Return user-friendly message that doesn't reveal approval workflow
      return NextResponse.json({
        success: true,
        status: 'processing',
        message: `Your withdrawal of ${amount.toLocaleString()} sats is being processed. You will be notified once complete.`,
        transactionId,
      })
    }

    // Process withdrawal immediately (small amounts)
    return await processWithdrawal(
      adminSupabase,
      transactionId,
      userId,
      amount,
      paymentRequest,
      profile,
      ipAddress,
      userAgent
    )

  } catch (error) {
    console.error("Unexpected error in withdraw API:", error)
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 })
  }
}

/**
 * Process a withdrawal (pay the invoice and update balances)
 * This is called for immediate withdrawals or when an admin approves a pending withdrawal
 */
async function processWithdrawal(
  adminSupabase: ReturnType<typeof createServerSupabaseClient>,
  transactionId: string,
  userId: string,
  amount: number,
  paymentRequest: string,
  profile: { balance: number; email?: string; name?: string },
  ipAddress: string,
  userAgent: string
): Promise<NextResponse> {
  // Log processing start
  await logWithdrawalAudit(adminSupabase, {
    transactionId,
    userId,
    action: 'processing',
    details: { amount },
    ipAddress,
    userAgent,
  })

  // Pay the invoice
  console.log("[Withdraw API] About to pay invoice:", paymentRequest, "amount:", amount)
  const paymentResult = await payInvoice(paymentRequest, amount)
  console.log("[Withdraw API] Payment result:", JSON.stringify(paymentResult, null, 2))
  
  if (!paymentResult.success) {
    console.log("[Withdraw API] Payment failed, updating transaction to failed (balance NOT deducted)")
    
    // Update transaction to failed
    await adminSupabase
      .from("transactions")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId)

    await logWithdrawalAudit(adminSupabase, {
      transactionId,
      userId,
      action: 'failed',
      details: { error: paymentResult.error, details: paymentResult.details },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({ 
      success: false, 
      error: "Failed to pay invoice",
      details: paymentResult.error,
      debugInfo: paymentResult.details
    }, { status: 500 })
  }

  // Payment succeeded - update transaction and deduct balance atomically
  const { data: rpcResult, error: updateError } = await adminSupabase.rpc('update_withdrawal_complete', {
    p_transaction_id: transactionId,
    p_user_id: userId,
    p_payment_hash: paymentResult.paymentHash,
    p_amount: amount
  })

  if (updateError) {
    console.error("[Withdraw API] Atomic withdrawal update failed:", updateError)
    return NextResponse.json({ 
      success: false, 
      error: "Payment succeeded but database update failed. Contact support.",
      details: updateError.message
    }, { status: 500 })
  }

  // Parse RPC result
  const result = rpcResult as { success: boolean; error?: string; new_balance?: number }
  
  if (!result.success) {
    console.error("[Withdraw API] RPC function returned error:", result.error)
    return NextResponse.json({ 
      success: false, 
      error: result.error || "Failed to complete withdrawal",
    }, { status: 500 })
  }

  const finalBalance = result.new_balance || (profile.balance - amount)

  // Log successful completion
  await logWithdrawalAudit(adminSupabase, {
    transactionId,
    userId,
    action: 'completed',
    details: { 
      amount, 
      paymentHash: paymentResult.paymentHash,
      newBalance: finalBalance,
    },
    ipAddress,
    userAgent,
  })

  // Revalidate pages
  revalidatePath("/profile")
  revalidatePath("/dashboard")
  revalidatePath("/wallet")

  // Add activity
  await adminSupabase.from("activities").insert({
    id: uuidv4(),
    user_id: userId,
    type: "withdrawal",
    related_id: transactionId,
    related_table: "transactions",
    timestamp: new Date().toISOString(),
    metadata: { amount, status: "completed" },
  })

  // Send email notification
  if (profile.email && !profile.email.includes('@ganamos.app')) {
    sendBitcoinSentEmail({
      toEmail: profile.email,
      userName: profile.name || "User",
      amountSats: amount,
      date: new Date(),
      transactionType: 'withdrawal'
    }).catch(error => {
      console.error("Error sending Bitcoin sent email:", error)
    })
  }

  return NextResponse.json({
    success: true,
    paymentHash: paymentResult.paymentHash,
    newBalance: finalBalance,
    amount: amount,
  })
}
