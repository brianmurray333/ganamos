import { vi } from 'vitest'

/**
 * Create mock Supabase admin client for email notification tests
 */
export function createEmailNotificationSupabaseMock(options: {
  senderProfile?: { email: string; name: string } | null
  receiverProfile?: { email: string; name: string } | null
  senderError?: Error | null
  receiverError?: Error | null
} = {}) {
  const { 
    senderProfile = { email: 'sender@example.com', name: 'Sender User' },
    receiverProfile = { email: 'receiver@example.com', name: 'Receiver User' },
    senderError = null,
    receiverError = null
  } = options

  const mockFrom = vi.fn()
  const mockSelect = vi.fn()
  const mockEq = vi.fn()
  const mockSingle = vi.fn()

  // Chain mock setup
  mockFrom.mockReturnValue({ select: mockSelect })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockEq.mockReturnValue({ single: mockSingle })

  // Setup responses based on user ID
  mockSingle.mockImplementation(() => {
    // Get the last eq call to determine which user is being queried
    const lastEqCall = mockEq.mock.calls[mockEq.mock.calls.length - 1]
    const userId = lastEqCall?.[1]

    // Return appropriate profile based on call sequence
    if (mockSingle.mock.calls.length === 0) {
      // First call is for sender
      return Promise.resolve({
        data: senderProfile,
        error: senderError
      })
    } else {
      // Second call is for receiver
      return Promise.resolve({
        data: receiverProfile,
        error: receiverError
      })
    }
  })

  return {
    from: mockFrom,
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle
  }
}

/**
 * Create mock email functions for testing
 */
export function createEmailFunctionMocks() {
  return {
    sendBitcoinSentEmail: vi.fn(() => Promise.resolve({ success: true })),
    sendBitcoinReceivedEmail: vi.fn(() => Promise.resolve({ success: true }))
  }
}

/**
 * Test data factory for transfer notification requests
 */
export function createTransferNotificationRequest(overrides?: {
  fromUserId?: string
  toUserId?: string
  amount?: number
  date?: string
}) {
  const defaults = {
    fromUserId: 'sender-user-id-123',
    toUserId: 'receiver-user-id-456',
    amount: 10000,
    date: new Date('2024-01-15T10:30:00Z').toISOString()
  }

  return { ...defaults, ...overrides }
}

/**
 * Create mock profile data
 */
export function createMockProfile(overrides?: {
  email?: string
  name?: string
}) {
  return {
    email: overrides?.email ?? 'user@example.com',
    name: overrides?.name ?? 'Test User'
  }
}

/**
 * Create profiles with @ganamos.app email for testing filtering
 */
export function createGanamosProfile(name: string = 'Internal User') {
  return {
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@ganamos.app`,
    name
  }
}