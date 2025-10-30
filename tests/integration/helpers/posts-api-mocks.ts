/**
 * Helper mocks for POST /api/posts integration tests
 * Following the pattern from bitcoin-price-mocks.ts
 */

import { vi } from 'vitest'

// Test constants matching production values
export const TEST_CONSTANTS = {
  API_ACCESS_FEE: 10,
  MIN_JOB_REWARD: 0,
  DEFAULT_JOB_REWARD: 1000,
  L402_ROOT_KEY: 'test-root-key-for-hmac-signatures',
  MACAROON_EXPIRY_HOURS: 1,
}

// Test data factories
export const createTestPost = (overrides = {}) => ({
  description: 'Test post description',
  reward: 1000,
  image_url: 'https://example.com/image.jpg',
  location: 'Test Location',
  latitude: 40.7128,
  longitude: -74.0060,
  city: 'Test City',
  ...overrides,
})

export const createTestMacaroon = (overrides = {}) => ({
  identifier: 'test-macaroon-id',
  signature: 'test-signature-hex',
  caveats: [
    { condition: 'action', value: 'create_post' },
    { condition: 'amount', value: '1010' }, // reward (1000) + API fee (10)
    { condition: 'expires', value: String(Date.now() + 3600000) }, // 1 hour from now
  ],
  ...overrides,
})

export const createTestInvoice = (amount: number, overrides = {}) => ({
  paymentRequest: `lnbc${amount}u1test-invoice-payment-request`,
  rHash: 'test-r-hash-hex-64-chars',
  addIndex: '12345',
  ...overrides,
})

export const createTestL402Token = (overrides = {}) => ({
  macaroon: 'test-macaroon-base64-encoded',
  preimage: 'test-preimage-hex-64-chars',
  ...overrides,
})

export const createTestPostResult = (overrides = {}) => ({
  postId: 'test-post-uuid-1234-5678-90ab-cdef',
  ...overrides,
})

// Mock L402 functions
export const mockCreateL402Challenge = vi.fn(async (amount: number, reward: number) => ({
  success: true,
  macaroon: 'test-macaroon-base64',
  invoice: createTestInvoice(amount).paymentRequest,
  paymentHash: 'test-payment-hash-hex',
  amount,
  reward,
}))

export const mockVerifyL402Token = vi.fn(async (token: { macaroon: string; preimage: string }) => ({
  success: true,
  paymentHash: 'test-payment-hash-hex',
  macaroon: createTestMacaroon(),
}))

export const mockVerifyL402TokenFailure = vi.fn(async () => ({
  success: false,
  error: 'Invalid L402 token',
}))

export const mockParseL402Header = vi.fn((authHeader: string) => {
  if (!authHeader || !authHeader.startsWith('L402 ')) {
    return null
  }
  const [macaroon, preimage] = authHeader.substring(5).split(':')
  return { macaroon, preimage }
})

// Mock Lightning functions
export const mockCreateInvoice = vi.fn(async (value: number, memo: string) => ({
  success: true,
  paymentRequest: `lnbc${value}u1test-invoice-${memo.substring(0, 10)}`,
  rHash: 'test-r-hash-hex',
  addIndex: '12345',
}))

export const mockCreateInvoiceFailure = vi.fn(async () => ({
  success: false,
  error: 'Failed to create invoice',
  details: 'LND node unavailable',
}))

export const mockCheckInvoice = vi.fn(async (rHash: string) => ({
  success: true,
  settled: true,
  amountPaid: 1010, // reward + API fee
  state: 'SETTLED',
  preimage: 'test-preimage-hex',
}))

export const mockCheckInvoiceUnpaid = vi.fn(async () => ({
  success: true,
  settled: false,
  amountPaid: 0,
  state: 'OPEN',
  preimage: null,
}))

// Mock post creation function
export const mockCreateFundedAnonymousPostAction = vi.fn(async (data: any) => ({
  success: true,
  postId: 'test-post-uuid-1234-5678-90ab-cdef',
}))

export const mockCreateFundedAnonymousPostActionFailure = vi.fn(async () => ({
  success: false,
  error: 'Database error: Failed to insert post',
}))

// Mock Supabase responses
export const mockSupabaseInsertPost = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({
    data: { id: 'test-post-uuid-1234-5678-90ab-cdef' },
    error: null,
  }),
}))

export const mockSupabaseInsertActivity = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({
    data: { id: 'test-activity-uuid' },
    error: null,
  }),
}))

// Mock fetch for Nostr publishing (async/fire-and-forget)
export const mockNostrFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({
      success: true,
      eventId: 'test-nostr-event-id',
      relaysPublished: 5,
    }),
  })
)

// Helper to setup all mocks for a test suite
export const setupPostApiMocks = () => {
  // Mock environment variables
  vi.stubEnv('API_ACCESS_FEE', String(TEST_CONSTANTS.API_ACCESS_FEE))
  vi.stubEnv('MIN_JOB_REWARD', String(TEST_CONSTANTS.MIN_JOB_REWARD))
  vi.stubEnv('DEFAULT_JOB_REWARD', String(TEST_CONSTANTS.DEFAULT_JOB_REWARD))
  vi.stubEnv('L402_ROOT_KEY', TEST_CONSTANTS.L402_ROOT_KEY)
  vi.stubEnv('NODE_ENV', 'development') // For CORS testing

  // Reset all mocks
  mockCreateL402Challenge.mockClear()
  mockVerifyL402Token.mockClear()
  mockParseL402Header.mockClear()
  mockCreateInvoice.mockClear()
  mockCheckInvoice.mockClear()
  mockCreateFundedAnonymousPostAction.mockClear()
  mockNostrFetch.mockClear()
}

// Helper to restore all mocks
export const teardownPostApiMocks = () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
}import { vi } from 'vitest'
import type { L402Challenge, L402Token, Macaroon } from '@/lib/l402'

/**
 * Helper to create mock post data with sensible defaults
 */
export function createMockPostData(overrides: {
  description?: string
  reward?: number
  image_url?: string | null
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  city?: string | null
} = {}) {
  return {
    description: 'Fix broken streetlight on Main St',
    reward: 1000,
    image_url: 'https://example.com/image.jpg',
    location: 'Main Street',
    latitude: 40.7128,
    longitude: -74.0060,
    city: 'New York',
    ...overrides,
  }
}

/**
 * Helper to create mock Lightning invoice with defaults
 */
export function createMockInvoice(overrides: {
  paymentRequest?: string
  rHash?: string
  amount?: number
} = {}) {
  return {
    paymentRequest: 'lnbc10n1pj9x7xmpp5abc123def456',
    rHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    amount: 1010, // Default: 1000 reward + 10 API fee
    ...overrides,
  }
}

/**
 * Helper to create mock L402 macaroon
 */
export function createMockMacaroon(overrides: {
  identifier?: string
  amount?: number
  expires?: number
} = {}): Macaroon {
  const identifier = overrides.identifier || 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
  const amount = overrides.amount || 1010
  const expires = overrides.expires || Date.now() + 3600000

  return {
    identifier,
    location: 'ganamos-posts',
    signature: 'mock-signature-1234567890abcdef',
    caveats: [
      { condition: 'action', value: 'create_post' },
      { condition: 'amount', value: amount.toString() },
      { condition: 'expires', value: expires.toString() },
    ],
  }
}

/**
 * Helper to create mock L402 challenge response
 */
export function createMockL402Challenge(overrides: {
  macaroon?: string
  invoice?: string
} = {}): L402Challenge {
  const mockMacaroon = createMockMacaroon()
  return {
    macaroon: overrides.macaroon || Buffer.from(JSON.stringify(mockMacaroon)).toString('base64'),
    invoice: overrides.invoice || 'lnbc10n1pj9x7xmpp5abc123def456',
  }
}

/**
 * Helper to create mock L402 token
 */
export function createMockL402Token(overrides: {
  macaroon?: string
  preimage?: string
  paymentHash?: string
} = {}): L402Token {
  const paymentHash = overrides.paymentHash || 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
  const mockMacaroon = createMockMacaroon({ identifier: paymentHash })
  
  return {
    macaroon: overrides.macaroon || Buffer.from(JSON.stringify(mockMacaroon)).toString('base64'),
    preimage: overrides.preimage || '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  }
}

/**
 * Helper to create mock post creation result
 */
export function createMockPostResult(overrides: {
  success?: boolean
  postId?: string
  error?: string
} = {}) {
  return {
    success: overrides.success !== undefined ? overrides.success : true,
    postId: overrides.postId || 'post-uuid-1234',
    error: overrides.error,
  }
}

/**
 * Mock successful L402 challenge creation
 */
export function mockL402ChallengeSuccess(mockL402: any, challenge: L402Challenge) {
  mockL402.createL402Challenge.mockResolvedValue({
    success: true,
    challenge,
  })
}

/**
 * Mock failed L402 challenge creation
 */
export function mockL402ChallengeFailure(mockL402: any, error: string) {
  mockL402.createL402Challenge.mockResolvedValue({
    success: false,
    error,
  })
}

/**
 * Mock successful L402 token verification
 */
export function mockL402VerificationSuccess(
  mockL402: any,
  paymentHash: string,
  macaroon?: Macaroon
) {
  mockL402.verifyL402Token.mockResolvedValue({
    success: true,
    paymentHash,
    macaroon: macaroon || createMockMacaroon({ identifier: paymentHash }),
  })
}

/**
 * Mock failed L402 token verification
 */
export function mockL402VerificationFailure(mockL402: any, error: string) {
  mockL402.verifyL402Token.mockResolvedValue({
    success: false,
    error,
  })
}

/**
 * Mock successful L402 token parsing
 */
export function mockL402TokenParsingSuccess(mockL402: any, token: L402Token) {
  mockL402.parseL402Header.mockReturnValue(token)
}

/**
 * Mock failed L402 token parsing
 */
export function mockL402TokenParsingFailure(mockL402: any) {
  mockL402.parseL402Header.mockReturnValue(null)
}

/**
 * Mock successful Lightning invoice creation
 */
export function mockInvoiceCreationSuccess(mockLightning: any, invoice: ReturnType<typeof createMockInvoice>) {
  mockLightning.createInvoice.mockResolvedValue({
    success: true,
    paymentRequest: invoice.paymentRequest,
    rHash: invoice.rHash,
    addIndex: '12345',
  })
}

/**
 * Mock failed Lightning invoice creation
 */
export function mockInvoiceCreationFailure(mockLightning: any, error: string) {
  mockLightning.createInvoice.mockResolvedValue({
    success: false,
    error,
  })
}

/**
 * Mock successful invoice payment check
 */
export function mockInvoiceCheckSuccess(mockLightning: any, settled: boolean = true) {
  mockLightning.checkInvoice.mockResolvedValue({
    success: true,
    settled,
    amountPaid: settled ? '1010' : '0',
    state: settled ? 'SETTLED' : 'OPEN',
  })
}

/**
 * Mock failed invoice payment check
 */
export function mockInvoiceCheckFailure(mockLightning: any, error: string) {
  mockLightning.checkInvoice.mockResolvedValue({
    success: false,
    error,
  })
}

/**
 * Mock successful post creation
 */
export function mockPostCreationSuccess(mockPostActions: any, postId: string = 'post-uuid-1234') {
  mockPostActions.createFundedAnonymousPostAction.mockResolvedValue({
    success: true,
    postId,
  })
}

/**
 * Mock failed post creation
 */
export function mockPostCreationFailure(mockPostActions: any, error: string) {
  mockPostActions.createFundedAnonymousPostAction.mockResolvedValue({
    success: false,
    error,
  })
}

/**
 * Helper to verify L402 challenge response structure
 */
export function expectL402ChallengeResponse(response: Response, data: any) {
  expect(response.status).toBe(402)
  expect(data).toHaveProperty('error', 'Payment required to post job')
  expect(data).toHaveProperty('total_amount')
  expect(data).toHaveProperty('job_reward')
  expect(data).toHaveProperty('api_fee', 10)
  expect(data).toHaveProperty('currency', 'sats')
  expect(data).toHaveProperty('message')
  expect(data).toHaveProperty('payment_request')
  
  // Verify WWW-Authenticate header
  const wwwAuth = response.headers.get('WWW-Authenticate')
  expect(wwwAuth).toBeTruthy()
  expect(wwwAuth).toMatch(/^L402 macaroon=".*", invoice=".*"$/)
}

/**
 * Helper to verify successful post creation response
 */
export function expectPostCreatedResponse(response: Response, data: any) {
  expect(response.status).toBe(201)
  expect(data).toHaveProperty('success', true)
  expect(data).toHaveProperty('post_id')
  expect(data).toHaveProperty('message', 'Job posted successfully')
  expect(data).toHaveProperty('job_reward')
  expect(data).toHaveProperty('api_fee', 10)
  expect(data).toHaveProperty('total_paid')
  expect(data).toHaveProperty('payment_hash')
  expect(data.total_paid).toBe(data.job_reward + 10)
}

/**
 * Helper to verify CORS headers in development mode
 */
export function expectDevCorsHeaders(response: Response) {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
}

/**
 * Helper to verify CORS headers are present (development mode)
 */
export function expectCorsHeadersPresent(response: Response) {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
  expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy()
  expect(response.headers.get('Access-Control-Allow-Headers')).toBeTruthy()
}

/**
 * Helper to verify L402 challenge headers
 */
export function expectL402ChallengeHeaders(response: Response) {
  const wwwAuth = response.headers.get('WWW-Authenticate')
  expect(wwwAuth).toBeTruthy()
  expect(wwwAuth).toContain('L402 macaroon=')
  expect(wwwAuth).toContain('invoice=')
}

/**
 * Helper to verify Expose-Headers for L402 challenge
 */
export function expectExposeHeaders(response: Response) {
  const exposeHeaders = response.headers.get('Access-Control-Expose-Headers')
  expect(exposeHeaders).toContain('WWW-Authenticate')
}

/**
 * Helper to create Authorization header with L402 token
 */
export function createL402AuthHeader(token: L402Token): string {
  return `L402 ${token.macaroon}:${token.preimage}`
}

/**
 * Helper to verify createFundedAnonymousPostAction was called with correct params
 */
export function expectPostActionCalled(
  mockPostActions: any,
  expectedParams: {
    description: string
    reward: number
    funding_r_hash: string
  }
) {
  expect(mockPostActions.createFundedAnonymousPostAction).toHaveBeenCalledWith(
    expect.objectContaining({
      description: expectedParams.description,
      reward: expectedParams.reward,
      funding_r_hash: expectedParams.funding_r_hash,
      funding_payment_request: expect.any(String),
    })
  )
}

/**
 * Helper to verify L402 challenge was created with correct amount
 */
export function expectL402ChallengeCalled(
  mockL402: any,
  totalAmount: number,
  jobReward: number
) {
  expect(mockL402.createL402Challenge).toHaveBeenCalledWith(
    totalAmount,
    expect.stringContaining(`Pay ${totalAmount} sats`),
    'ganamos-posts'
  )
}