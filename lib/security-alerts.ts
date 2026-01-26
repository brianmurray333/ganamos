import { sendEmail } from './email'
import { alertRateLimitViolation } from './sms-alerts'

const ADMIN_EMAIL = 'admin@example.com'

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

