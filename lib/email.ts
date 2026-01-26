import { Resend } from 'resend'
import { serverEnv } from './env'
import { mockEmailStore, type EmailType } from './mock-email-store'

// Create a fresh Resend client for each request
// Singleton pattern can cause stale connections in serverless environments
function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured')
  }
  return new Resend(process.env.RESEND_API_KEY)
}

interface EmailMetadata {
  type?: EmailType
  metadata?: Record<string, any>
}

/**
 * Mock email implementation - stores emails in memory
 */
async function sendMockEmail(to: string, subject: string, html: string, options?: EmailMetadata) {
  console.log('[Mock Email] Intercepted email send')
  const storedEmail = mockEmailStore.storeEmail({
    to,
    subject,
    html,
    type: options?.type || "deposit", // Default type if not specified
    metadata: options?.metadata || {},
  })
  return { success: true, messageId: storedEmail.id }
}

/**
 * Helper to add timeout to a promise
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    
    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

/**
 * Real email implementation - sends via Resend SDK
 */
async function sendRealEmail(to: string, subject: string, html: string, options?: EmailMetadata) {
  const startTime = Date.now()
  console.log('[EMAIL DEBUG] Starting sendEmail function')
  console.log('[EMAIL DEBUG] To:', to)
  console.log('[EMAIL DEBUG] Subject:', subject)
  console.log('[EMAIL DEBUG] HTML length:', html.length)
  console.log('[EMAIL DEBUG] RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY)

  try {
    // Create fresh client for each request (avoids stale connections in serverless)
    const resendClient = getResendClient()

    console.log('[EMAIL DEBUG] About to call resend.emails.send')
    
    // Add 10-second timeout to prevent hanging
    const { data, error } = await withTimeout(
      resendClient.emails.send({
        from: 'Ganamos <noreply@ganamos.earth>',
        to: [to],
        subject,
        html
      }),
      10000,
      'Resend email send'
    )

    const duration = Date.now() - startTime
    console.log(`[EMAIL DEBUG] Resend response received in ${duration}ms`)
    console.log('[EMAIL DEBUG] Resend response - data:', data)
    console.log('[EMAIL DEBUG] Resend response - error:', error)

    if (error) {
      console.error('[EMAIL DEBUG] Resend error details:', JSON.stringify(error, null, 2))
      return { success: false, error: error.message }
    }

    console.log('[EMAIL DEBUG] Email sent successfully:', data?.id)
    return { success: true, messageId: data?.id }
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[EMAIL DEBUG] Exception caught after ${duration}ms:`, error)
    console.error('[EMAIL DEBUG] Exception type:', typeof error)
    console.error('[EMAIL DEBUG] Exception stack:', error instanceof Error ? error.stack : 'No stack')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// Choose implementation once at module load time
const sendEmailImpl = serverEnv?.useMock ? sendMockEmail : sendRealEmail

/**
 * Send email (mock or real based on USE_MOCKS environment variable)
 * Decision is made once at module load time for performance
 */
export async function sendEmail(to: string, subject: string, html: string, options?: EmailMetadata) {
  return sendEmailImpl(to, subject, html, options)
}
