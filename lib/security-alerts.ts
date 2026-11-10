import { sendEmail } from './email'
import { alertRateLimitViolation } from './sms-alerts'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@example.com'

export interface RateLimitViolation {
  userId: string
  userEmail?: string
  endpoint: string
  limitType: 'per-minute' | 'per-hour'
  requestCount: number
  maxAllowed: number
  ipAddress?: string
  userAgent?: string
}

/**
 * Send email AND SMS alert for rate limit violations on wallet endpoints
 */
export async function sendRateLimitAlert(violation: RateLimitViolation): Promise<void> {
  const { userId, userEmail, endpoint, limitType, requestCount, maxAllowed, ipAddress, userAgent } = violation

  // Send SMS alert (async, don't block)
  alertRateLimitViolation(userId, endpoint, limitType, requestCount, userEmail)
    .catch(err => console.error('[Security Alert] SMS failed:', err))

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .detail { margin: 10px 0; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .warning { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin-top: 15px; }
    .code { background: #1f2937; color: #10b981; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color: #ffffff !important;">⚠️ Rate Limit Violation</h1>
    </div>
    <div class="content">
      <p>A user has exceeded the rate limit on a wallet endpoint:</p>
      
      <div class="detail">
        <span class="label">Timestamp:</span>
        <span class="value">${timestamp}</span>
      </div>
      
      <div class="detail">
        <span class="label">Endpoint:</span>
        <span class="code">${endpoint}</span>
      </div>
      
      <div class="detail">
        <span class="label">User ID:</span>
        <span class="code">${userId}</span>
      </div>
      
      ${userEmail ? `
      <div class="detail">
        <span class="label">User Email:</span>
        <span class="value">${userEmail}</span>
      </div>
      ` : ''}
      
      <div class="detail">
        <span class="label">Limit Type:</span>
        <span class="value">${limitType}</span>
      </div>
      
      <div class="detail">
        <span class="label">Request Count:</span>
        <span class="value" style="color: #dc2626; font-weight: bold;">${requestCount} requests</span>
        <span class="value">(max allowed: ${maxAllowed})</span>
      </div>
      
      ${ipAddress ? `
      <div class="detail">
        <span class="label">IP Address:</span>
        <span class="code">${ipAddress}</span>
      </div>
      ` : ''}
      
      ${userAgent ? `
      <div class="detail">
        <span class="label">User Agent:</span>
        <span class="value" style="font-size: 12px;">${userAgent}</span>
      </div>
      ` : ''}
      
      <div class="warning">
        <strong>Action Required:</strong> Review this user's activity. Multiple violations may indicate an attempted attack or compromised account.
      </div>
    </div>
  </div>
</body>
</html>
`

  try {
    await sendEmail(
      ADMIN_EMAIL,
      'Ganamos Alert - Rate limiting violation',
      html
    )
    console.log(`[Security Alert] Rate limit violation email sent for user ${userId}`)
  } catch (error) {
    console.error('[Security Alert] Failed to send rate limit violation email:', error)
  }
}

/**
 * Send admin email when a user attempts a withdrawal while withdrawals are disabled.
 */
export async function sendWithdrawalsDisabledAttemptAlert(params: {
  userId: string
  userEmail?: string
  amount?: number
  ipAddress?: string
  userAgent?: string
}): Promise<void> {
  const { userId, userEmail, amount, ipAddress, userAgent } = params

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .detail { margin: 10px 0; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .code { background: #1f2937; color: #10b981; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .info { background: #fffbeb; border: 1px solid #fde68a; padding: 15px; border-radius: 6px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color: #ffffff !important;">Withdrawal Attempted While Disabled</h1>
    </div>
    <div class="content">
      <p>A user tried to withdraw while the withdrawal kill switch is <strong>OFF</strong>:</p>
      
      <div class="detail">
        <span class="label">Timestamp:</span>
        <span class="value">${timestamp}</span>
      </div>
      
      <div class="detail">
        <span class="label">User ID:</span>
        <span class="code">${userId}</span>
      </div>
      
      ${userEmail ? `
      <div class="detail">
        <span class="label">User Email:</span>
        <span class="value">${userEmail}</span>
      </div>
      ` : ''}

      ${amount ? `
      <div class="detail">
        <span class="label">Amount Requested:</span>
        <span class="value">${amount.toLocaleString()} sats</span>
      </div>
      ` : ''}
      
      ${ipAddress ? `
      <div class="detail">
        <span class="label">IP Address:</span>
        <span class="code">${ipAddress}</span>
      </div>
      ` : ''}
      
      ${userAgent ? `
      <div class="detail">
        <span class="label">User Agent:</span>
        <span class="value" style="font-size: 12px;">${userAgent}</span>
      </div>
      ` : ''}
      
      <div class="info">
        <strong>Note:</strong> Withdrawals are currently disabled. If this is a legitimate user, consider re-enabling withdrawals when the incident is resolved. Repeated attempts from the same user may indicate frustration or an attacker probing.
      </div>
    </div>
  </div>
</body>
</html>
`

  try {
    await sendEmail(
      ADMIN_EMAIL,
      'Ganamos Alert - Withdrawal attempted while disabled',
      html
    )
    console.log(`[Security Alert] Withdrawals-disabled attempt email sent for user ${userId}`)
  } catch (error) {
    console.error('[Security Alert] Failed to send withdrawals-disabled attempt email:', error)
  }
}


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Send admin email when an anonymous reward payout is left on hold: the
 * Lightning payment outcome is uncertain (it may or may not have been sent),
 * or it was sent but the post couldn't be marked paid. The payout lock stays
 * set so nobody can retry and pay twice; an admin has to check the node.
 */
export async function sendRewardOnHoldAlert(params: {
  postId: string
  amount?: number | null
  reason: 'payment_uncertain' | 'paid_but_not_recorded'
  flow: string
  paymentHash?: string | null
  details?: string | null
}): Promise<void> {
  const { postId, amount, reason, flow, paymentHash, details } = params

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

  const summary = reason === 'payment_uncertain'
    ? 'A Lightning payout failed without a definitive error, so it may or may not have been sent.'
    : 'A Lightning payout was sent, but the post could not be marked as paid.'

  const nextSteps = reason === 'payment_uncertain'
    ? `Look up the payment on the Lightning node. If it <strong>was paid</strong>, set <span class="code">anonymous_reward_paid_at</span> and <span class="code">anonymous_reward_payment_hash</span> on the post. If it <strong>was not paid</strong>, clear <span class="code">anonymous_reward_payment_lock</span> so the fixer can claim again.`
    : `The payment went out. Set <span class="code">anonymous_reward_paid_at</span> and <span class="code">anonymous_reward_payment_hash</span> on the post. Do not clear the lock.`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .detail { margin: 10px 0; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .code { background: #1f2937; color: #10b981; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .warning { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color: #ffffff !important;">Reward On Hold</h1>
    </div>
    <div class="content">
      <p>${summary} The reward is locked so it can't be paid twice.</p>

      <div class="detail">
        <span class="label">Timestamp:</span>
        <span class="value">${timestamp}</span>
      </div>

      <div class="detail">
        <span class="label">Post ID:</span>
        <span class="code">${escapeHtml(postId)}</span>
      </div>

      ${amount ? `
      <div class="detail">
        <span class="label">Amount:</span>
        <span class="value">${Number(amount).toLocaleString()} sats</span>
      </div>
      ` : ''}

      <div class="detail">
        <span class="label">Flow:</span>
        <span class="value">${escapeHtml(flow)}</span>
      </div>

      ${paymentHash ? `
      <div class="detail">
        <span class="label">Payment Hash:</span>
        <span class="code">${escapeHtml(paymentHash)}</span>
      </div>
      ` : ''}

      ${details ? `
      <div class="detail">
        <span class="label">Error:</span>
        <span class="value" style="font-size: 12px;">${escapeHtml(details.slice(0, 500))}</span>
      </div>
      ` : ''}

      <div class="warning">
        <strong>What to do:</strong> ${nextSteps}
      </div>
    </div>
  </div>
</body>
</html>
`

  try {
    await sendEmail(
      ADMIN_EMAIL,
      `Ganamos Alert - Reward on hold (${amount ? `${Number(amount).toLocaleString()} sats` : postId})`,
      html
    )
    console.log(`[Security Alert] Reward-on-hold email sent for post ${postId}`)
  } catch (error) {
    console.error('[Security Alert] Failed to send reward-on-hold email:', error)
  }
}
