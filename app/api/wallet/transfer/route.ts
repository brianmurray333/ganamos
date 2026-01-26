import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase"
import { v4 as uuidv4 } from "uuid"
import { sendBitcoinReceivedEmail, sendBitcoinSentEmail } from "@/lib/transaction-emails"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"
import { sendRateLimitAlert } from "@/lib/security-alerts"
import { alertLargeTransfer } from "@/lib/sms-alerts"

export async function POST(request: Request) {
  try {
    // Authenticate the user
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    // SECURITY: Rate limiting - check per-minute limit
    const rateLimitMinute = checkRateLimit(`transfer:${user.id}`, RATE_LIMITS.WALLET_TRANSFER)
    if (!rateLimitMinute.allowed) {
      const headersList = await headers()
      console.warn(`[SECURITY] Rate limit exceeded: User ${user.id} hit transfer per-minute limit (${rateLimitMinute.totalRequests} requests)`)
      
      // Send alert email asynchronously
      sendRateLimitAlert({
        userId: user.id,
        userEmail: user.email,
        endpoint: '/api/wallet/transfer',
        limitType: 'per-minute',
        requestCount: rateLimitMinute.totalRequests,
        maxAllowed: RATE_LIMITS.WALLET_TRANSFER.maxRequests,
        ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || undefined,
        userAgent: headersList.get('user-agent') || undefined,
      }).catch(err => console.error('[Security Alert] Failed to send:', err))

      return NextResponse.json({
        success: false,
        error: "Too many transfer attempts. Please wait before trying again.",
        retryAfter: Math.ceil((rateLimitMinute.resetTime - Date.now()) / 1000),
      }, { status: 429 })
    }

    // SECURITY: Rate limiting - check per-hour limit
    const rateLimitHour = checkRateLimit(`transfer-hourly:${user.id}`, RATE_LIMITS.WALLET_TRANSFER_HOURLY)
    if (!rateLimitHour.allowed) {
      const headersList = await headers()
      console.warn(`[SECURITY] Rate limit exceeded: User ${user.id} hit transfer hourly limit (${rateLimitHour.totalRequests} requests)`)
      
      // Send alert email asynchronously
      sendRateLimitAlert({
        userId: user.id,
        userEmail: user.email,
        endpoint: '/api/wallet/transfer',
        limitType: 'per-hour',
        requestCount: rateLimitHour.totalRequests,
        maxAllowed: RATE_LIMITS.WALLET_TRANSFER_HOURLY.maxRequests,
        ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || undefined,
        userAgent: headersList.get('user-agent') || undefined,
      }).catch(err => console.error('[Security Alert] Failed to send:', err))

      return NextResponse.json({
        success: false,
        error: "Hourly transfer limit reached. Please try again later.",
        retryAfter: Math.ceil((rateLimitHour.resetTime - Date.now()) / 1000),
      }, { status: 429 })
    }

    const body = await request.json()
    const { fromUserId, toUsername, amount, memo } = body

    // Validate input
    if (!toUsername || typeof toUsername !== 'string') {
      return NextResponse.json({ success: false, error: "Invalid recipient username" }, { status: 400 })
    }
    
    const satsAmount = parseInt(amount, 10)
    if (isNaN(satsAmount) || satsAmount <= 0) {
      return NextResponse.json({ success: false, error: "Invalid amount" }, { status: 400 })
    }

    // Determine effective sender (own account or connected account)
    const authenticatedUserId = user.id
    let senderId = fromUserId || authenticatedUserId

    // If transferring from a different account, verify it's a connected account
    if (senderId !== authenticatedUserId) {
      const { data: connectedAccount } = await supabase
        .from('connected_accounts')
        .select('id')
        .eq('primary_user_id', authenticatedUserId)
        .eq('connected_user_id', senderId)
        .maybeSingle()

      if (!connectedAccount) {
        console.error('SECURITY ALERT: User attempted to transfer from another account', {
          authenticatedUserId,
          attemptedFromId: senderId,
        })
        return NextResponse.json({ 
          success: false, 
          error: "You can only transfer from your own account or connected accounts" 
        }, { status: 403 })
      }
    }

    // Use admin client for balance updates (service_role bypasses RLS for writes)
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })

    // Find recipient by username
    const { data: receiver, error: receiverError } = await adminSupabase
      .from('profiles')
      .select('id, balance, name, email')
      .eq('username', toUsername)
      .single()

    if (receiverError || !receiver) {
      return NextResponse.json({ 
        success: false, 
        error: `User not found: No user with username "${toUsername}"` 
      }, { status: 404 })
    }

    // Prevent self-transfer
    if (receiver.id === senderId) {
      return NextResponse.json({ success: false, error: "Cannot transfer to yourself" }, { status: 400 })
    }

    // Get sender profile
    const { data: sender, error: senderError } = await adminSupabase
      .from('profiles')
      .select('id, balance, name, email, pet_coins, status')
      .eq('id', senderId)
      .single()

    if (senderError || !sender) {
      return NextResponse.json({ success: false, error: "Sender profile not found" }, { status: 404 })
    }

    // SECURITY: Block suspended accounts from transferring
    if (sender.status === 'suspended') {
      console.warn('[SECURITY] Suspended account attempted transfer:', {
        senderId,
        toUsername,
        amount: satsAmount,
        timestamp: new Date().toISOString(),
      })
      return NextResponse.json({ 
        success: false, 
        error: "Your account has been suspended. Please contact support." 
      }, { status: 403 })
    }

    // Check sufficient balance
    if (sender.balance < satsAmount) {
      return NextResponse.json({ success: false, error: "Insufficient balance" }, { status: 400 })
    }

    // SECURITY: Balance reconciliation check - verify stored balance matches transaction history
    // This blocks transfers from accounts with fraudulently inflated balances
    const { data: senderTransactions } = await adminSupabase
      .from('transactions')
      .select('type, amount, status')
      .eq('user_id', senderId)
      .eq('status', 'completed')

    let calculatedBalance = 0
    if (senderTransactions) {
      for (const tx of senderTransactions) {
        if (tx.type === 'deposit') {
          calculatedBalance += tx.amount
        } else if (tx.type === 'withdrawal') {
          calculatedBalance -= tx.amount
        } else if (tx.type === 'internal') {
          calculatedBalance += tx.amount // internal can be positive or negative
        }
      }
    }

    if (sender.balance !== calculatedBalance) {
      console.error('[SECURITY] Transfer blocked - Balance reconciliation failed:', {
        userId: senderId,
        storedBalance: sender.balance,
        calculatedBalance,
        discrepancy: sender.balance - calculatedBalance,
      })
      return NextResponse.json({ 
        success: false, 
        error: "Transfer blocked for security review. Please contact support." 
      }, { status: 400 })
    }

    // Generate IDs
    const senderTxId = uuidv4()
    const receiverTxId = uuidv4()
    const senderActivityId = uuidv4()
    const receiverActivityId = uuidv4()
    const now = new Date().toISOString()

    // Create sender transaction (negative amount, pending)
    const { error: senderTxError } = await adminSupabase
      .from('transactions')
      .insert({
        id: senderTxId,
        user_id: senderId,
        type: 'internal',
        amount: -satsAmount,
        status: 'pending',
        memo: memo || `Transfer to ${receiver.name}`,
        created_at: now,
        updated_at: now,
      })

    if (senderTxError) {
      console.error("Error creating sender transaction:", senderTxError)
      return NextResponse.json({ success: false, error: "Failed to create transaction" }, { status: 500 })
    }

    // Create receiver transaction (positive amount, pending)
    const { error: receiverTxError } = await adminSupabase
      .from('transactions')
      .insert({
        id: receiverTxId,
        user_id: receiver.id,
        type: 'internal',
        amount: satsAmount,
        status: 'pending',
        memo: memo || `Transfer from ${sender.name}`,
        created_at: now,
        updated_at: now,
      })

    if (receiverTxError) {
      console.error("Error creating receiver transaction:", receiverTxError)
      // Rollback sender transaction
      await adminSupabase.from('transactions').delete().eq('id', senderTxId)
      return NextResponse.json({ success: false, error: "Failed to create transaction" }, { status: 500 })
    }

    // Execute atomic transfer with row-level locks
    const { data: rpcResult, error: transferError } = await adminSupabase.rpc('atomic_transfer', {
      p_sender_id: senderId,
      p_receiver_id: receiver.id,
      p_amount: satsAmount,
      p_sender_tx_id: senderTxId,
      p_receiver_tx_id: receiverTxId
    })

    if (transferError) {
      console.error("Atomic transfer RPC failed:", transferError)
      // Rollback transactions
      await adminSupabase.from('transactions').delete().in('id', [senderTxId, receiverTxId])
      return NextResponse.json({ 
        success: false, 
        error: "Transfer failed. Please try again.",
        details: transferError.message
      }, { status: 500 })
    }

    // Parse RPC result
    const result = rpcResult as { 
      success: boolean; 
      error?: string; 
      sender_new_balance?: number;
      receiver_new_balance?: number;
    }
    
    if (!result.success) {
      console.error("Atomic transfer returned error:", result.error)
      // Rollback transactions
      await adminSupabase.from('transactions').delete().in('id', [senderTxId, receiverTxId])
      return NextResponse.json({ 
        success: false, 
        error: result.error || "Transfer failed"
      }, { status: 500 })
    }

    // Create activities
    await adminSupabase.from('activities').insert([
      {
        id: senderActivityId,
        user_id: senderId,
        type: 'internal',
        related_id: senderTxId,
        related_table: 'transactions',
        timestamp: now,
        metadata: {
          amount: -satsAmount,
          memo: memo || `Transfer to ${receiver.name}`,
          to_user_id: receiver.id,
          to_name: receiver.name,
        },
      },
      {
        id: receiverActivityId,
        user_id: receiver.id,
        type: 'internal',
        related_id: receiverTxId,
        related_table: 'transactions',
        timestamp: now,
        metadata: {
          amount: satsAmount,
          memo: memo || `Transfer from ${sender.name}`,
          from_user_id: senderId,
          from_name: sender.name,
        },
      },
    ])

    // Send email notifications asynchronously (don't block response)
    const transferDate = new Date()
    const emailPromises: Promise<unknown>[] = []
    
    // Send email to sender (only if they have a verified email)
    if (sender.email && !sender.email.includes('@ganamos.app')) {
      emailPromises.push(
        sendBitcoinSentEmail({
          toEmail: sender.email,
          userName: sender.name || 'User',
          amountSats: satsAmount,
          toName: receiver.name,
          date: transferDate,
          transactionType: 'internal'
        })
      )
    }
    
    // Send email to receiver (only if they have a verified email)
    if (receiver.email && !receiver.email.includes('@ganamos.app')) {
      emailPromises.push(
        sendBitcoinReceivedEmail({
          toEmail: receiver.email,
          userName: receiver.name || 'User',
          amountSats: satsAmount,
          fromName: sender.name,
          date: transferDate,
          transactionType: 'internal'
        })
      )
    }
    
    Promise.all(emailPromises).catch(err => console.error("Error sending transfer emails:", err))

    // SECURITY: Send SMS alert for large transfers
    alertLargeTransfer(senderId, toUsername, satsAmount, user.email)
      .catch(err => console.error("[Security Alert] SMS for large transfer failed:", err))

    return NextResponse.json({
      success: true,
      sender_tx_id: senderTxId,
      receiver_tx_id: receiverTxId,
      receiver_name: receiver.name,
      receiver_id: receiver.id,
    })

  } catch (error) {
    console.error("Transfer API error:", error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Transfer failed" 
    }, { status: 500 })
  }
}

