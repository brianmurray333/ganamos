import { NextRequest } from 'next/server'
import { vi } from 'vitest'

/**
 * Create a mock Next.js request for email notification endpoint
 */
export function createEmailNotificationRequest(body: {
  fromUserId?: string
  toUserId?: string
  amount?: number
  date?: string
}) {
  return new NextRequest('http://localhost:3000/api/email/transfer-notification', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

/**
 * Create mock user profiles for testing
 */
export function createMockProfiles(options?: {
  senderEmail?: string | null
  senderName?: string
  receiverEmail?: string | null
  receiverName?: string
}) {
  return {
    sender: {
      email: options?.senderEmail ?? 'sender@example.com',
      name: options?.senderName ?? 'Bob Sender'
    },
    receiver: {
      email: options?.receiverEmail ?? 'receiver@example.com',
      name: options?.receiverName ?? 'Alice Receiver'
    }
  }
}

/**
 * Setup Supabase mock to return specific profiles
 */
export function mockSupabaseProfiles(
  mockSupabase: any,
  senderProfile: { email: string | null; name: string },
  receiverProfile: { email: string | null; name: string }
) {
  const mockSingle = vi.fn()
    .mockResolvedValueOnce({ data: senderProfile })
    .mockResolvedValueOnce({ data: receiverProfile })

  mockSupabase.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockSingle
      }))
    }))
  })
  
  return mockSingle
}

/**
 * Standard test profiles for common scenarios
 */
export const TEST_PROFILES = {
  validUsers: createMockProfiles(),
  senderGanamosApp: createMockProfiles({
    senderEmail: 'childaccount@ganamos.app'
  }),
  receiverGanamosApp: createMockProfiles({
    receiverEmail: 'childaccount@ganamos.app'
  }),
  bothGanamosApp: createMockProfiles({
    senderEmail: 'sender@ganamos.app',
    receiverEmail: 'receiver@ganamos.app'
  }),
  senderNoEmail: createMockProfiles({
    senderEmail: null
  })
}
