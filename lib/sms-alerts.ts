/**
 * SMS Alerts for Security Events
 * Uses Twilio REST API directly (no SDK needed)
 * 
 * Required environment variables:
 * - TWILIO_ACCOUNT_SID: Your Twilio Account SID
 * - TWILIO_AUTH_TOKEN: Your Twilio Auth Token
 * - TWILIO_MESSAGING_SERVICE_SID: The Messaging Service SID with A2P campaign (preferred)
 * - TWILIO_FROM_NUMBER: Fallback - The Twilio phone number to send from (e.g., +15551234567)
 * - ADMIN_PHONE_NUMBER: The phone number to receive alerts (e.g., +15559876543)
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER

// Threshold for "large" transactions (in sats)
export const LARGE_TRANSACTION_THRESHOLD = 50000

export type SecurityEventType = 
  | 'rate_limit_violation'
  | 'large_withdrawal'
  | 'large_transfer'
  | 'large_deposit'
  | 'large_post_bounty'
  | 'suspicious_activity'

export interface SecurityEvent {
  type: SecurityEventType
  userId: string
  userEmail?: string
  amount?: number
  details: string
  timestamp?: Date
}

/**
 * Check if SMS alerts are properly configured
 * Requires either MessagingServiceSid (preferred) or From number
 */
export function isSmsConfigured(): boolean {
  const hasAuth = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && ADMIN_PHONE_NUMBER)
  const hasSender = !!(TWILIO_MESSAGING_SERVICE_SID || TWILIO_FROM_NUMBER)
  return hasAuth && hasSender
}

/**
 * Format sats amount for display
 */
function formatSats(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M sats`
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}k sats`
  }
  return `${amount} sats`
}

/**
 * Send an SMS alert via Twilio REST API
 * Uses MessagingServiceSid (for A2P compliance) if available, otherwise falls back to From number
 */
export async function sendSmsAlert(message: string): Promise<{ success: boolean; error?: string }> {
  if (!isSmsConfigured()) {
    console.warn('[SMS Alert] Twilio not configured - skipping SMS')
    return { success: false, error: 'Twilio not configured' }
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
    
    // Build request body - prefer MessagingServiceSid for A2P compliance
    const bodyParams: Record<string, string> = {
      To: ADMIN_PHONE_NUMBER!,
      Body: message,
    }
    
    if (TWILIO_MESSAGING_SERVICE_SID) {
      bodyParams.MessagingServiceSid = TWILIO_MESSAGING_SERVICE_SID
      console.log('[SMS Alert] Using MessagingServiceSid for A2P compliance')
    } else if (TWILIO_FROM_NUMBER) {
      bodyParams.From = TWILIO_FROM_NUMBER
      console.log('[SMS Alert] Using From number (no MessagingServiceSid configured)')
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(bodyParams),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[SMS Alert] Twilio API error:', error)
      return { success: false, error: `Twilio API error: ${response.status}` }
    }

    const result = await response.json()
    console.log(`[SMS Alert] Sent successfully. SID: ${result.sid}`)
    return { success: true }
  } catch (error) {
    console.error('[SMS Alert] Failed to send:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send a security event SMS alert
 */
export async function sendSecuritySmsAlert(event: SecurityEvent): Promise<void> {
  const timestamp = (event.timestamp || new Date()).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  let emoji: string
  let title: string

  switch (event.type) {
    case 'rate_limit_violation':
      emoji = '🚨'
      title = 'RATE LIMIT'
      break
    case 'large_withdrawal':
      emoji = '💸'
      title = 'LARGE WITHDRAW'
      break
    case 'large_transfer':
      emoji = '💰'
      title = 'LARGE TRANSFER'
      break
    case 'large_deposit':
      emoji = '📥'
      title = 'LARGE DEPOSIT'
      break
    case 'large_post_bounty':
      emoji = '📢'
      title = 'LARGE BOUNTY'
      break
    case 'suspicious_activity':
      emoji = '⚠️'
      title = 'SUSPICIOUS'
      break
    default:
      emoji = '🔔'
      title = 'ALERT'
  }

  const amountStr = event.amount ? ` ${formatSats(event.amount)}` : ''
  const userStr = event.userEmail || event.userId.substring(0, 8)
  
  // Keep SMS concise (160 char limit for single SMS)
  const message = `${emoji} Ganamos ${title}${amountStr}\nUser: ${userStr}\n${event.details}\n${timestamp}`

  await sendSmsAlert(message)
}

/**
 * Check if a transaction amount exceeds the threshold for alerts
 */
export function isLargeTransaction(amount: number): boolean {
  return amount >= LARGE_TRANSACTION_THRESHOLD
}

/**
 * Send alert for large withdrawal
 */
export async function alertLargeWithdrawal(userId: string, amount: number, userEmail?: string): Promise<void> {
  if (!isLargeTransaction(amount)) return

  await sendSecuritySmsAlert({
    type: 'large_withdrawal',
    userId,
    userEmail,
    amount,
    details: 'Lightning withdrawal',
  })
}

/**
 * Send alert for large internal transfer
 */
export async function alertLargeTransfer(
  fromUserId: string,
  toUsername: string,
  amount: number,
  fromUserEmail?: string
): Promise<void> {
  if (!isLargeTransaction(amount)) return

  await sendSecuritySmsAlert({
    type: 'large_transfer',
    userId: fromUserId,
    userEmail: fromUserEmail,
    amount,
    details: `To: @${toUsername}`,
  })
}

/**
 * Send alert for large deposit
 */
export async function alertLargeDeposit(userId: string, amount: number, userEmail?: string): Promise<void> {
  if (!isLargeTransaction(amount)) return

  await sendSecuritySmsAlert({
    type: 'large_deposit',
    userId,
    userEmail,
    amount,
    details: 'Lightning deposit',
  })
}

/**
 * Send alert for large post bounty
 */
export async function alertLargePostBounty(
  userId: string,
  amount: number,
  postTitle?: string,
  userEmail?: string
): Promise<void> {
  if (!isLargeTransaction(amount)) return

  const truncatedTitle = postTitle 
    ? (postTitle.length > 30 ? postTitle.substring(0, 27) + '...' : postTitle)
    : 'New post'

  await sendSecuritySmsAlert({
    type: 'large_post_bounty',
    userId,
    userEmail,
    amount,
    details: truncatedTitle,
  })
}

/**
 * Send alert for rate limit violation
 */
export async function alertRateLimitViolation(
  userId: string,
  endpoint: string,
  limitType: string,
  requestCount: number,
  userEmail?: string
): Promise<void> {
  await sendSecuritySmsAlert({
    type: 'rate_limit_violation',
    userId,
    userEmail,
    details: `${endpoint} (${requestCount} reqs, ${limitType})`,
  })
}

