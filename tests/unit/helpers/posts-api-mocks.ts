import { vi, expect } from 'vitest'
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
  funding_r_hash?: string
  funding_payment_request?: string
} = {}) {
  return {
    description: 'Fix broken streetlight on Main St',
    reward: 1000,
    image_url: 'https://example.com/image.jpg',
    location: 'Main Street',
    latitude: 40.7128,
    longitude: -74.0060,
    city: 'New York',
    funding_r_hash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    funding_payment_request: 'lnbc10n1pj9x7xmpp5abc123def456',
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

/**
 * Helper to create mock GET request for /api/posts
 */
export function createMockGetRequest(headers?: Headers) {
  return {
    method: 'GET',
    headers: headers || new Headers(),
  } as any
}

/**
 * Helper to fetch and parse GET response
 */
export async function getApiDocumentation(request: any, getHandler: any) {
  const response = await getHandler(request)
  const data = await response.json()
  return { response, data }
}

/**
 * Helper to verify GET /api/posts documentation response structure
 */
export function expectApiDocumentationResponse(data: any) {
  expect(data).toHaveProperty('message', 'Posts API endpoint')
  expect(data).toHaveProperty('endpoints')
  expect(data).toHaveProperty('l402_info')
  
  // Verify endpoints structure
  expect(data.endpoints).toEqual({
    'POST /api/posts': 'Create a new post (requires L402 payment)',
    'GET /api/posts': 'List posts (free)'
  })
  
  // Verify L402 info structure
  expect(data.l402_info).toMatchObject({
    api_fee: expect.stringContaining('sats'),
    job_reward: expect.stringContaining('sats'),
    total_cost: expect.stringContaining('sats'),
    currency: 'satoshis',
    documentation: expect.stringContaining('https://')
  })
}

/**
 * Helper to verify GET /api/posts documentation matches constants
 */
export function expectDocumentationMatchesConstants(
  data: any,
  constants: { API_ACCESS_FEE: number; MIN_JOB_REWARD: number; DEFAULT_JOB_REWARD: number }
) {
  expect(data.l402_info.api_fee).toBe(`${constants.API_ACCESS_FEE} sats (fixed)`)
  expect(data.l402_info.job_reward).toContain(`minimum: ${constants.MIN_JOB_REWARD} sats`)
  expect(data.l402_info.job_reward).toContain(`default: ${constants.DEFAULT_JOB_REWARD} sats`)
  expect(data.l402_info.documentation).toBe('https://docs.lightning.engineering/the-lightning-network/l402')
}
