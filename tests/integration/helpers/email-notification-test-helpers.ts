import { vi } from 'vitest'

/**
 * Test data constants for email notification tests
 */
export const TEST_USERS = {
  sender: {
    id: 'user-1',
    email: 'sender@example.com',
    name: 'Sender',
  },
  receiver: {
    id: 'user-2',
    email: 'receiver@example.com',
    name: 'Receiver',
  },
  alice: {
    id: 'user-1',
    email: 'sender@example.com',
    name: 'Alice',
  },
  bob: {
    id: 'user-2',
    email: 'receiver@example.com',
    name: 'Bob',
  },
  senderWithGanamosEmail: {
    id: 'user-1',
    email: 'sender@ganamos.app',
    name: 'Sender',
  },
  receiverWithGanamosEmail: {
    id: 'user-2',
    email: 'receiver@ganamos.app',
    name: 'Receiver',
  },
  senderWithNullEmail: {
    id: 'user-1',
    email: null,
    name: 'Sender',
  },
  specificIds: {
    sender: 'user-123',
    receiver: 'user-456',
  },
}

export const TEST_AMOUNTS = {
  default: 1000,
  large: 5000,
}

/**
 * Helper to create a mock Supabase client for email notification tests
 * Returns a chainable mock that simulates Supabase query builder pattern
 */
export function createEmailNotificationMockClient() {
  const mockClient: any = {
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
  }
  return mockClient
}

/**
 * Helper to create mock profile data
 */
export function createMockProfile(overrides: {
  email?: string | null
  name?: string
} = {}) {
  return {
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  }
}

/**
 * Helper to setup mock Supabase responses for sender and receiver profiles
 */
export function setupMockProfiles(
  mockClient: any,
  senderProfile: { email: string | null; name: string } | null,
  receiverProfile: { email: string | null; name: string } | null
) {
  mockClient.single
    .mockResolvedValueOnce({
      data: senderProfile,
      error: null,
    })
    .mockResolvedValueOnce({
      data: receiverProfile,
      error: null,
    })
}

/**
 * Helper to create a transfer notification request
 */
export function createTransferNotificationRequest(params: {
  fromUserId?: string
  toUserId?: string
  amount?: number
  date?: string | Date
  baseUrl?: string
}) {
  const {
    fromUserId,
    toUserId,
    amount,
    date,
    baseUrl = 'http://localhost:3000',
  } = params

  const body: any = {}
  if (fromUserId !== undefined) body.fromUserId = fromUserId
  if (toUserId !== undefined) body.toUserId = toUserId
  if (amount !== undefined) body.amount = amount
  if (date !== undefined) {
    body.date = date instanceof Date ? date.toISOString() : date
  }

  return new Request(`${baseUrl}/api/email/transfer-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Helper to create a valid transfer notification request with all required params
 */
export function createValidTransferRequest(overrides?: {
  fromUserId?: string
  toUserId?: string
  amount?: number
  date?: Date
}) {
  return createTransferNotificationRequest({
    fromUserId: overrides?.fromUserId || TEST_USERS.sender.id,
    toUserId: overrides?.toUserId || TEST_USERS.receiver.id,
    amount: overrides?.amount || TEST_AMOUNTS.default,
    date: overrides?.date,
  })
}

/**
 * Helper to create an invalid JSON request
 */
export function createInvalidJsonRequest() {
  return new Request('http://localhost:3000/api/email/transfer-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid json',
  })
}
