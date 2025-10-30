import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mock helpers for transfer-notification-email-api tests
 * 
 * Provides mock implementations for:
 * - Resend email service
 * - Supabase client (wraps real client for testing)
 */

/**
 * Mock Resend SDK: Successful email send
 */
export function mockSuccessfulEmailSend() {
  return {
    emails: {
      send: async () => ({
        data: { id: 'mock-email-id-123' },
        error: null
      })
    }
  }
}

/**
 * Mock Resend SDK: Email service failure
 */
export function mockEmailServiceFailure() {
  return {
    emails: {
      send: async () => ({
        data: null,
        error: new Error('Email service unavailable')
      })
    }
  }
}

/**
 * Mock Resend SDK: Rate limit error
 */
export function mockEmailRateLimitError() {
  return {
    emails: {
      send: async () => ({
        data: null,
        error: { message: 'Rate limit exceeded', statusCode: 429 }
      })
    }
  }
}

/**
 * Mock Resend SDK: Invalid email address
 */
export function mockEmailInvalidAddressError() {
  return {
    emails: {
      send: async () => ({
        data: null,
        error: { message: 'Invalid email address', statusCode: 400 }
      })
    }
  }
}

/**
 * Create a mock Supabase client from a profiles map
 * This allows us to test with mocked database data
 */
export function createMockSupabaseFromProfiles(profiles: Record<string, any>) {
  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          single: async () => {
            if (table === 'profiles' && column === 'id') {
              const profile = profiles[value]
              if (profile) {
                return { data: profile, error: null }
              }
              return { data: null, error: null }
            }
            return { data: null, error: null }
          }
        })
      })
    }),
    auth: {},
    storage: {},
    rpc: () => {},
    channel: () => {},
  }
}

/**
 * Helper to verify email content contains expected fields
 */
export function verifyEmailContent(html: string, expectedFields: {
  userName?: string
  amount?: string
  fromName?: string
  toName?: string
  date?: string
}) {
  const checks = []
  
  if (expectedFields.userName) {
    checks.push(html.includes(expectedFields.userName))
  }
  
  if (expectedFields.amount) {
    checks.push(html.includes(expectedFields.amount))
  }
  
  if (expectedFields.fromName) {
    checks.push(html.includes(expectedFields.fromName))
  }
  
  if (expectedFields.toName) {
    checks.push(html.includes(expectedFields.toName))
  }
  
  if (expectedFields.date) {
    checks.push(html.includes(expectedFields.date))
  }
  
  return checks.every(check => check === true)
}
