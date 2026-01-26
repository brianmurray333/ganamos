/**
 * Withdrawal Security Module
 * 
 * Provides comprehensive security for withdrawals including:
 * - Per-transaction and daily limits
 * - Balance reconciliation checks
 * - Approval workflow for large withdrawals
 * - Enhanced audit logging
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './email'
import { alertLargeWithdrawal, sendSmsAlert } from './sms-alerts'
import { formatSatsValue } from './utils'

// Withdrawal limits (in sats)
export const WITHDRAWAL_LIMITS = {
  PER_TRANSACTION: 100_000,  // 100k sats max per withdrawal
  DAILY: 500_000,            // 500k sats max per day
  REQUIRES_APPROVAL: 25_000, // >=25k sats requires admin approval (lowered from 50k after attack)
  DELAY_THRESHOLD: 25_000,   // >=25k sats has delay (handled by approval)
  SYSTEM_HOURLY: 25_000,     // 25k sats max system-wide per hour (auto-disables withdrawals if exceeded)
}

// Admin email for approval notifications
const ADMIN_EMAIL = 'admin@example.com'

export interface WithdrawalSecurityCheck {
  allowed: boolean
  error?: string
  requiresApproval?: boolean
  delayMinutes?: number
  warnings?: string[]
}

export interface AuditLogEntry {
  transactionId: string
  userId: string
  action: string
  details: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Check withdrawal limits (per-transaction and daily)
 */
export async function checkWithdrawalLimits(
  supabase: SupabaseClient,
  userId: string,
  amount: number
): Promise<WithdrawalSecurityCheck> {
  const warnings: string[] = []

  // Check per-transaction limit
  if (amount > WITHDRAWAL_LIMITS.PER_TRANSACTION) {
    return {
      allowed: false,
      error: `Withdrawal amount exceeds maximum of ${formatSatsValue(WITHDRAWAL_LIMITS.PER_TRANSACTION)} per transaction`,
    }
  }

  // Check daily limit
  const { data: dailyTotal, error: dailyError } = await supabase
    .rpc('get_daily_withdrawal_total', { p_user_id: userId })

  if (dailyError) {
    console.error('[Withdrawal Security] Error checking daily total:', dailyError)
    return {
      allowed: false,
      error: 'Unable to verify withdrawal limits. Please try again.',
    }
  }

  const projectedDailyTotal = (dailyTotal || 0) + amount
  if (projectedDailyTotal > WITHDRAWAL_LIMITS.DAILY) {
    const remaining = WITHDRAWAL_LIMITS.DAILY - (dailyTotal || 0)
    return {
      allowed: false,
      error: `Daily withdrawal limit of ${formatSatsValue(WITHDRAWAL_LIMITS.DAILY)} would be exceeded. You can withdraw up to ${formatSatsValue(Math.max(0, remaining))} more today.`,
    }
  }

  // Check if approval is required (>= not > to prevent attackers staying just under the limit)
  const requiresApproval = amount >= WITHDRAWAL_LIMITS.REQUIRES_APPROVAL

  if (requiresApproval) {
    warnings.push(`Withdrawals of ${formatSatsValue(WITHDRAWAL_LIMITS.REQUIRES_APPROVAL)} or more require admin approval`)
  }

  return {
    allowed: true,
    requiresApproval,
    delayMinutes: requiresApproval ? 10 : 0,
    warnings,
  }
}

/**
 * Check balance reconciliation
 * Returns true if stored balance matches calculated balance from transactions
 */
export async function checkBalanceReconciliation(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  reconciles: boolean
  storedBalance: number
  calculatedBalance: number
  discrepancy: number
}> {
  const { data, error } = await supabase
    .rpc('check_balance_reconciliation', { p_user_id: userId })

  if (error) {
    console.error('[Withdrawal Security] Error checking reconciliation:', error)
    // On error, fail closed - don't allow withdrawal
    return {
      reconciles: false,
      storedBalance: 0,
      calculatedBalance: 0,
      discrepancy: 0,
    }
  }

  // The function returns a single row
  const result = data?.[0] || data
  
  return {
    reconciles: result?.reconciles ?? false,
    storedBalance: result?.stored_balance ?? 0,
    calculatedBalance: result?.calculated_balance ?? 0,
    discrepancy: result?.discrepancy ?? 0,
  }
}

/**
 * Log withdrawal audit event
 */
export async function logWithdrawalAudit(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  const { error } = await supabase
    .from('withdrawal_audit_logs')
    .insert({
      transaction_id: entry.transactionId,
      user_id: entry.userId,
      action: entry.action,
      details: entry.details,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
    })

  if (error) {
    console.error('[Withdrawal Security] Error logging audit:', error)
    // Don't throw - audit logging should not block withdrawals
  }
}

/**
 * Send balance reconciliation alert to admin
 */
export async function sendReconciliationAlert(
  userId: string,
  userEmail: string | undefined,
  storedBalance: number,
  calculatedBalance: number,
  discrepancy: number
): Promise<void> {
  // Send SMS alert
  const message = `Ganamos security code: RECONCILE_FAIL ${formatSatsValue(Math.abs(discrepancy))} discrepancy for user ${userEmail || userId.substring(0, 8)}. Do not share.`
  await sendSmsAlert(message)

  // Send detailed email
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        .alert { background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .details { background: #f9fafb; border-radius: 6px; padding: 15px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .row:last-child { border-bottom: none; }
        .label { font-weight: 600; color: #6b7280; }
        .value { color: #111827; }
        .discrepancy { color: #dc2626; font-weight: bold; font-size: 1.2em; }
      </style>
    </head>
    <body>
      <div class="alert">
        <h2 style="color: #dc2626; margin-top: 0;">⚠️ Balance Reconciliation Failed</h2>
        <p>A withdrawal was blocked because the user's balance does not match their transaction history.</p>
      </div>
      <div class="details">
        <div class="row">
          <span class="label">User ID:</span>
          <span class="value">${userId}</span>
        </div>
        <div class="row">
          <span class="label">User Email:</span>
          <span class="value">${userEmail || 'N/A'}</span>
        </div>
        <div class="row">
          <span class="label">Stored Balance:</span>
          <span class="value">${formatSatsValue(storedBalance)}</span>
        </div>
        <div class="row">
          <span class="label">Calculated Balance:</span>
          <span class="value">${formatSatsValue(calculatedBalance)}</span>
        </div>
        <div class="row">
          <span class="label">Discrepancy:</span>
          <span class="value discrepancy">${formatSatsValue(Math.abs(discrepancy))}</span>
        </div>
      </div>
      <p style="margin-top: 20px;">
        <strong>Action Required:</strong> Investigate this user's transaction history and balance.
      </p>
      <a href="https://www.ganamos.earth/admin/users" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 10px;">View in Admin Dashboard</a>
    </body>
    </html>
  `

  await sendEmail(
    ADMIN_EMAIL,
    '🚨 ALERT: Balance Reconciliation Failed',
    html,
    { type: 'security_alert', metadata: { userId, discrepancy } }
  )
}

/**
 * Send withdrawal approval request to admin
 */
export async function sendWithdrawalApprovalRequest(
  transactionId: string,
  userId: string,
  userEmail: string | undefined,
  amount: number,
  ipAddress?: string
): Promise<void> {
  // Send SMS alert
  await alertLargeWithdrawal(userId, amount, userEmail)

  // Send detailed email with approval button
  const approvalUrl = `https://www.ganamos.earth/admin/transactions?approve=${transactionId}`
  const formattedAmount = formatSatsValue(amount)

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .content { background: white; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
        .amount-box { background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .amount { font-size: 32px; font-weight: bold; color: #92400e; }
        .details { background: #f9fafb; border-radius: 6px; padding: 15px; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .row:last-child { border-bottom: none; }
        .label { font-weight: 600; color: #6b7280; }
        .value { color: #111827; font-family: monospace; font-size: 12px; }
        .buttons { text-align: center; margin-top: 30px; }
        .btn { display: inline-block; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 10px; }
        .btn-approve { background: #16a349; color: white; }
        .btn-view { background: #6b7280; color: white; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="color: #ffffff !important;">⏳ Withdrawal Pending Approval</h1>
      </div>
      <div class="content">
        <p>A large withdrawal requires your approval before processing.</p>
        
        <div class="amount-box">
          <div class="amount">${formattedAmount}</div>
          <div style="color: #92400e; margin-top: 5px;">Lightning Withdrawal</div>
        </div>
        
        <div class="details">
          <div class="row">
            <span class="label">User:</span>
            <span class="value">${userEmail || userId}</span>
          </div>
          <div class="row">
            <span class="label">Transaction ID:</span>
            <span class="value">${transactionId}</span>
          </div>
          <div class="row">
            <span class="label">IP Address:</span>
            <span class="value">${ipAddress || 'Unknown'}</span>
          </div>
          <div class="row">
            <span class="label">Time:</span>
            <span class="value">${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}</span>
          </div>
        </div>
        
        <div class="buttons">
          <a href="${approvalUrl}" class="btn btn-approve">Review & Approve</a>
        </div>
        
        <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px;">
          This withdrawal will remain pending until you approve or reject it.
        </p>
      </div>
    </body>
    </html>
  `

  await sendEmail(
    ADMIN_EMAIL,
    `⏳ Withdrawal Approval Required: ${formattedAmount}`,
    html,
    { type: 'withdrawal_approval', metadata: { transactionId, userId, amount } }
  )
}

/**
 * Send withdrawal failed notification to user
 * This is a generic failure message that doesn't reveal the approval workflow
 */
export async function sendWithdrawalFailedEmail(
  userEmail: string,
  userName: string,
  amount: number
): Promise<void> {
  const formattedAmount = formatSatsValue(amount)
  const firstName = userName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background: #f5f5f5; }
        .container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: #dc2626; padding: 30px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .content { padding: 30px 20px; }
        .greeting { font-size: 16px; margin-bottom: 20px; }
        .amount-box { background: #f9fafb; border-radius: 6px; padding: 20px; text-align: center; margin: 20px 0; }
        .amount { font-size: 28px; font-weight: bold; color: #111827; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        .footer a { color: #16a349; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">Withdrawal Failed</h1>
        </div>
        <div class="content">
          <div class="greeting">Hello ${firstName},</div>
          <p>Unfortunately, your withdrawal could not be processed. Your balance has not been affected.</p>
          <div class="amount-box">
            <div class="amount">${formattedAmount}</div>
          </div>
          <p>If you have questions, please contact support.</p>
        </div>
        <div class="footer">
          <p>This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail(userEmail, `Withdrawal Failed - ${formattedAmount}`, html, {
    type: 'withdrawal_failed',
    metadata: { amount },
  })
}

/**
 * Check system-wide withdrawal threshold
 * Returns true if adding this withdrawal would exceed the hourly system limit
 */
export async function checkSystemWithdrawalThreshold(
  supabase: SupabaseClient,
  amount: number
): Promise<{
  allowed: boolean
  currentTotal: number
  projectedTotal: number
  error?: string
}> {
  // Get total withdrawals across ALL users in the last hour
  // Using completed withdrawals only to avoid counting pending/failed ones
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('type', 'withdrawal')
    .eq('status', 'completed')
    .gte('created_at', oneHourAgo)

  if (error) {
    console.error('[Withdrawal Security] Error checking system threshold:', error)
    // Fail closed - block withdrawal if we can't verify
    return {
      allowed: false,
      currentTotal: 0,
      projectedTotal: amount,
      error: 'Unable to verify system withdrawal limits. Please try again later.',
    }
  }

  const currentTotal = (data || []).reduce((sum, tx) => sum + tx.amount, 0)
  const projectedTotal = currentTotal + amount

  if (projectedTotal > WITHDRAWAL_LIMITS.SYSTEM_HOURLY) {
    return {
      allowed: false,
      currentTotal,
      projectedTotal,
      error: 'System withdrawal limit reached. Withdrawals are temporarily disabled. Please try again later.',
    }
  }

  return {
    allowed: true,
    currentTotal,
    projectedTotal,
  }
}

/**
 * Send system threshold breach alert to admin
 * This triggers when the hourly system-wide withdrawal limit is exceeded
 */
export async function sendSystemThresholdAlert(
  userId: string,
  userEmail: string | undefined,
  amount: number,
  currentTotal: number,
  projectedTotal: number,
  ipAddress?: string
): Promise<void> {
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Send SMS alert
  const smsMessage = `🚨 Ganamos SYSTEM ALERT: ${formatSatsValue(projectedTotal)} withdrawals in 1hr (limit: ${formatSatsValue(WITHDRAWAL_LIMITS.SYSTEM_HOURLY)}). Withdrawals AUTO-DISABLED. User: ${userEmail || userId.substring(0, 8)}. ${timestamp}`
  await sendSmsAlert(smsMessage)

  // Send detailed email
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
        .alert { background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .alert h1 { color: #dc2626; margin: 0 0 10px 0; font-size: 24px; }
        .content { background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px; }
        .amount-box { background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .amount { font-size: 32px; font-weight: bold; color: #991b1b; }
        .amount-label { color: #dc2626; margin-top: 5px; font-weight: 600; }
        .details { background: #f9fafb; border-radius: 6px; padding: 15px; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .row:last-child { border-bottom: none; }
        .label { font-weight: 600; color: #6b7280; }
        .value { color: #111827; }
        .warning-box { background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; padding: 15px; margin-top: 20px; }
        .warning-box strong { color: #92400e; }
        .btn { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 10px; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="alert">
        <h1>🚨 SYSTEM WITHDRAWAL THRESHOLD EXCEEDED</h1>
        <p style="margin: 0; font-weight: 600;">Withdrawals have been automatically disabled.</p>
      </div>
      
      <div class="content">
        <p>The system-wide hourly withdrawal limit of <strong>${formatSatsValue(WITHDRAWAL_LIMITS.SYSTEM_HOURLY)}</strong> has been exceeded.</p>
        
        <div class="amount-box">
          <div class="amount">${formatSatsValue(projectedTotal)}</div>
          <div class="amount-label">Total Attempted in Last Hour</div>
        </div>
        
        <div class="details">
          <div class="row">
            <span class="label">Threshold Limit:</span>
            <span class="value" style="font-weight: 600;">${formatSatsValue(WITHDRAWAL_LIMITS.SYSTEM_HOURLY)}</span>
          </div>
          <div class="row">
            <span class="label">Current Total (before this):</span>
            <span class="value">${formatSatsValue(currentTotal)}</span>
          </div>
          <div class="row">
            <span class="label">This Withdrawal:</span>
            <span class="value">${formatSatsValue(amount)}</span>
          </div>
          <div class="row">
            <span class="label">Projected Total:</span>
            <span class="value" style="color: #dc2626; font-weight: bold;">${formatSatsValue(projectedTotal)}</span>
          </div>
        </div>

        <h3>Triggering User Details:</h3>
        <div class="details">
          <div class="row">
            <span class="label">User ID:</span>
            <span class="value" style="font-family: monospace; font-size: 12px;">${userId}</span>
          </div>
          ${userEmail ? `
          <div class="row">
            <span class="label">User Email:</span>
            <span class="value">${userEmail}</span>
          </div>
          ` : ''}
          ${ipAddress ? `
          <div class="row">
            <span class="label">IP Address:</span>
            <span class="value">${ipAddress}</span>
          </div>
          ` : ''}
          <div class="row">
            <span class="label">Timestamp:</span>
            <span class="value">${timestamp}</span>
          </div>
        </div>

        <div class="warning-box">
          <strong>⚠️ Action Taken:</strong>
          <ul style="margin: 10px 0 0 0; padding-left: 20px;">
            <li>This withdrawal was <strong>BLOCKED</strong></li>
            <li>All withdrawals are now <strong>DISABLED</strong> system-wide</li>
            <li>User's balance was not affected</li>
          </ul>
        </div>

        <p style="margin-top: 20px;">
          <strong>Required Actions:</strong>
        </p>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li>Review recent withdrawal activity in admin dashboard</li>
          <li>Investigate for potential attack or unusual patterns</li>
          <li>When safe, manually re-enable withdrawals from admin console</li>
        </ol>
        
        <a href="https://www.ganamos.earth/admin/transactions" class="btn">View Admin Dashboard</a>
      </div>
    </body>
    </html>
  `

  await sendEmail(
    ADMIN_EMAIL,
    `🚨 CRITICAL: System Withdrawal Limit Exceeded - Withdrawals Disabled`,
    html,
    { 
      type: 'system_threshold_breach', 
      metadata: { 
        userId, 
        amount, 
        currentTotal, 
        projectedTotal,
        threshold: WITHDRAWAL_LIMITS.SYSTEM_HOURLY,
      } 
    }
  )
}

