import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Mock helpers for transfer-notification-email-api tests
 * 
 * Provides mock implementations for:
 * - Resend email service
 * - Supabase client (wraps real client for testing)
 * - Test setup helpers to reduce duplication
 */

/**
 * Helper to create a mock NextRequest for the transfer-notification API
 */
export function createMockTransferRequest(payload: {
  fromUserId?: string
  toUserId?: string
  amount?: number
  date?: string
}) {
  return new NextRequest('http://localhost:3000/api/email/transfer-notification', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Helper to setup successful Resend mock
 */
export function setupSuccessfulResendMock(mockSend = vi.fn().mockResolvedValue({ 
  data: { id: 'email-123' }, 
  error: null 
})) {
  return {
    mockSend,
    mock: () => ({
      emails: { send: mockSend }
    })
  }
}

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
 * Helper to create test user profiles
 */
export function createTestProfiles(overrides?: {
  senderUserId?: string
  receiverUserId?: string
  senderEmail?: string
  receiverEmail?: string
  senderName?: string
  receiverName?: string
}) {
  const defaults = {
    senderUserId: 'sender-user-123',
    receiverUserId: 'receiver-user-456',
    senderEmail: 'sender@test.com',
    receiverEmail: 'receiver@test.com',
    senderName: 'Sender User',
    receiverName: 'Receiver User',
  }
  
  const config = { ...defaults, ...overrides }
  
  return {
    config,
    profiles: {
      [config.senderUserId]: { 
        id: config.senderUserId, 
        email: config.senderEmail, 
        name: config.senderName 
      },
      [config.receiverUserId]: { 
        id: config.receiverUserId, 
        email: config.receiverEmail, 
        name: config.receiverName 
      }
    }
  }
}

/**
 * Helper to setup complete test environment with all mocks
 */
export async function setupTestEnvironment(options: {
  profiles?: Record<string, any>
  mockSend?: any
}) {
  const { Resend } = await import('resend')
  const { createServerSupabaseClient } = await import('@/lib/supabase')
  const { POST } = await import('@/app/api/email/transfer-notification/route')
  
  const mockSend = options.mockSend || vi.fn().mockResolvedValue({ 
    data: { id: 'email-123' }, 
    error: null 
  })
  
  ;(Resend as any).mockImplementation(() => ({
    emails: { send: mockSend }
  }))
  
  ;(createServerSupabaseClient as any).mockReturnValue(
    createMockSupabaseFromProfiles(options.profiles || {})
  )
  
  return { POST, mockSend }
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
