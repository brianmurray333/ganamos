/**
 * In-memory store for mock email sends
 * Tracks emails sent during development/testing when USE_MOCKS=true
 */

export type EmailType =
  | "deposit"
  | "withdrawal"
  | "transfer_sent"
  | "transfer_received"
  | "issue_fixed"
  | "fix_submitted"
  | "reward_earned"
  | "device_job_completion"
  | "group_join_request"
  | "group_join_request_confirmation"
  | "group_admin_closed_issue"
  | "security_alert"
  | "withdrawal_approval"
  | "withdrawal_failed"
  | "system_threshold_breach"

export interface SentEmail {
  id: string
  to: string
  subject: string
  html: string
  type: EmailType
  sentAt: Date
  metadata: {
    // Transaction emails
    amountSats?: number
    amountUsd?: string
    userName?: string
    fromName?: string
    toName?: string
    transactionType?: string

    // Issue emails
    issueTitle?: string
    postId?: string
    reward?: number
    fixerName?: string

    // Common
    date?: Date
  }
}

interface EmailFilter {
  type?: EmailType
  to?: string
  limit?: number
}

class MockEmailStore {
  private emails: SentEmail[] = []
  private emailCounter = 1

  /**
   * Store a sent email
   */
  storeEmail(email: Omit<SentEmail, "id" | "sentAt">): SentEmail {
    const storedEmail: SentEmail = {
      ...email,
      id: `mock-email-${this.emailCounter++}`,
      sentAt: new Date(),
    }

    this.emails.push(storedEmail)

    console.log(`[Mock Email] Stored email: ${email.type} to ${email.to}`)
    console.log(`[Mock Email] Subject: ${email.subject}`)

    return storedEmail
  }

  /**
   * Get all emails with optional filtering
   */
  getEmails(filter?: EmailFilter): SentEmail[] {
    let filtered = [...this.emails]

    if (filter?.type) {
      filtered = filtered.filter(email => email.type === filter.type)
    }

    if (filter?.to) {
      filtered = filtered.filter(email => email.to === filter.to)
    }

    // Sort by most recent first
    filtered.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())

    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit)
    }

    return filtered
  }

  /**
   * Get emails by type
   */
  getEmailsByType(type: EmailType): SentEmail[] {
    return this.getEmails({ type })
  }

  /**
   * Get emails by recipient
   */
  getEmailsByRecipient(to: string): SentEmail[] {
    return this.getEmails({ to })
  }

  /**
   * Get the most recent email
   */
  getLatestEmail(): SentEmail | undefined {
    return this.emails.length > 0 ? this.emails[this.emails.length - 1] : undefined
  }

  /**
   * Get email count
   */
  getCount(): number {
    return this.emails.length
  }

  /**
   * Clear all emails (for test cleanup)
   */
  clear(): void {
    this.emails = []
    this.emailCounter = 1
    console.log("[Mock Email] Email store cleared")
  }

  /**
   * Check if an email was sent
   */
  wasEmailSent(filter: EmailFilter): boolean {
    return this.getEmails(filter).length > 0
  }
}

// Ensure singleton across all Next.js contexts (API routes, server actions, etc.)
// This is necessary because Next.js can run code in different "realms" that don't share module state
const globalForEmailStore = globalThis as unknown as {
  mockEmailStore: MockEmailStore | undefined
}

export const mockEmailStore = globalForEmailStore.mockEmailStore ?? new MockEmailStore()

// Store in global during development to prevent issues with hot module reloading
if (process.env.NODE_ENV !== 'production') {
  globalForEmailStore.mockEmailStore = mockEmailStore
}
