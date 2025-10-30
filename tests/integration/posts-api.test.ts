/**
 * Integration tests for POST /api/posts endpoint
 * Tests L402 payment flow, validation, database operations, and downstream effects
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST, GET, OPTIONS } from '@/app/api/posts/route'
import { NextRequest } from 'next/server'
import {
  setupPostApiMocks,
  teardownPostApiMocks,
  mockCreateL402Challenge,
  mockVerifyL402Token,
  mockVerifyL402TokenFailure,
  mockParseL402Header,
  mockCreateInvoice,
  mockCreateInvoiceFailure,
  mockCheckInvoice,
  mockCheckInvoiceUnpaid,
  mockCreateFundedAnonymousPostAction,
  mockCreateFundedAnonymousPostActionFailure,
  mockNostrFetch,
  createTestPost,
  createTestL402Token,
  TEST_CONSTANTS,
} from './helpers/posts-api-mocks'

// Mock external dependencies
vi.mock('@/lib/l402', () => ({
  createL402Challenge: mockCreateL402Challenge,
  verifyL402Token: mockVerifyL402Token,
  parseL402Header: mockParseL402Header,
}))

vi.mock('@/lib/lightning', () => ({
  createInvoice: mockCreateInvoice,
  checkInvoice: mockCheckInvoice,
}))

vi.mock('@/app/actions/post-actions', () => ({
  createFundedAnonymousPostAction: mockCreateFundedAnonymousPostAction,
}))

// Mock global fetch for Nostr publishing
global.fetch = mockNostrFetch as any

describe('POST /api/posts - L402 Payment Challenge Flow', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should issue L402 challenge (402) when no Authorization header is provided', async () => {
    const testPost = createTestPost()
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(402)
    expect(data).toMatchObject({
      success: false,
      error: 'Payment Required',
      paymentRequired: true,
    })
    expect(data.macaroon).toBeDefined()
    expect(data.invoice).toBeDefined()
    expect(data.amount).toBe(testPost.reward + TEST_CONSTANTS.API_ACCESS_FEE)
    expect(mockCreateL402Challenge).toHaveBeenCalledWith(
      testPost.reward + TEST_CONSTANTS.API_ACCESS_FEE,
      testPost.reward
    )
  })

  it('should use DEFAULT_JOB_REWARD when reward not provided in challenge request', async () => {
    const testPostNoReward = { ...createTestPost(), reward: undefined }
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostNoReward),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(402)
    expect(data.amount).toBe(TEST_CONSTANTS.DEFAULT_JOB_REWARD + TEST_CONSTANTS.API_ACCESS_FEE)
    expect(mockCreateL402Challenge).toHaveBeenCalledWith(
      TEST_CONSTANTS.DEFAULT_JOB_REWARD + TEST_CONSTANTS.API_ACCESS_FEE,
      TEST_CONSTANTS.DEFAULT_JOB_REWARD
    )
  })

  it('should enforce MIN_JOB_REWARD when reward is below minimum', async () => {
    const testPostLowReward = createTestPost({ reward: -100 })
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostLowReward),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(402)
    expect(data.amount).toBe(TEST_CONSTANTS.MIN_JOB_REWARD + TEST_CONSTANTS.API_ACCESS_FEE)
  })

  it('should include WWW-Authenticate header with L402 challenge details', async () => {
    const testPost = createTestPost()
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
    })

    const response = await POST(request)

    expect(response.headers.get('WWW-Authenticate')).toContain('L402')
    expect(response.headers.get('WWW-Authenticate')).toContain('macaroon=')
    expect(response.headers.get('WWW-Authenticate')).toContain('invoice=')
  })

  it('should return 500 error when invoice creation fails', async () => {
    mockCreateInvoice.mockImplementationOnce(mockCreateInvoiceFailure)

    const testPost = createTestPost()
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to create L402 challenge')
  })
})

describe('POST /api/posts - Successful Post Creation with L402 Token', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should create post (201) when valid L402 token is provided', async () => {
    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data).toMatchObject({
      success: true,
      post_id: expect.any(String),
      message: 'Job posted successfully',
      job_reward: testPost.reward,
      api_fee: TEST_CONSTANTS.API_ACCESS_FEE,
      total_paid: testPost.reward + TEST_CONSTANTS.API_ACCESS_FEE,
    })
    expect(mockParseL402Header).toHaveBeenCalled()
    expect(mockVerifyL402Token).toHaveBeenCalled()
    expect(mockCreateFundedAnonymousPostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        description: testPost.description,
        reward: testPost.reward,
        image_url: testPost.image_url,
        location: testPost.location,
      })
    )
  })

  it('should pass payment hash and request details to post creation action', async () => {
    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    await POST(request)

    expect(mockCreateFundedAnonymousPostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        funding_r_hash: expect.any(String),
        funding_payment_request: '',
      })
    )
  })

  it('should handle post creation with optional fields (location, image)', async () => {
    const testPostMinimal = {
      description: 'Minimal post',
      reward: 500,
    }
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostMinimal),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(mockCreateFundedAnonymousPostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        description: testPostMinimal.description,
        reward: testPostMinimal.reward,
        image_url: null,
        location: null,
      })
    )
  })

  it('should trigger async Nostr publishing (fire-and-forget pattern)', async () => {
    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    // Note: Nostr publishing is async via fetch in createFundedAnonymousPostAction
    // The endpoint should not wait for or validate Nostr publishing result
  })
})

describe('POST /api/posts - Request Validation Errors', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return 400 error when description is missing', async () => {
    const testPostNoDescription = { ...createTestPost(), description: undefined }
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostNoDescription),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Description is required')
  })

  it('should return 400 error when description is not a string', async () => {
    const testPostInvalidDescription = { ...createTestPost(), description: 12345 }
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostInvalidDescription),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Description is required and must be a string')
  })

  it('should return 400 error when reward is negative', async () => {
    const testPostNegativeReward = createTestPost({ reward: -500 })
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostNegativeReward),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Reward must be a non-negative number')
  })

  it('should return 400 error when reward is not a number', async () => {
    const testPostInvalidReward = { ...createTestPost(), reward: 'not-a-number' }
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostInvalidReward),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Reward must be a non-negative number')
  })
})

describe('POST /api/posts - L402 Authentication Errors', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return 401 error when Authorization header format is invalid', async () => {
    mockParseL402Header.mockReturnValueOnce(null)

    const testPost = createTestPost()
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('Invalid Authorization header format')
  })

  it('should return 401 error when L402 token verification fails', async () => {
    mockVerifyL402Token.mockImplementationOnce(mockVerifyL402TokenFailure)

    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('L402 verification failed')
  })

  it('should return 401 error when invoice is not paid', async () => {
    mockCheckInvoice.mockImplementationOnce(mockCheckInvoiceUnpaid)

    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    // Mock verifyL402Token to call checkInvoice which will return unpaid
    mockVerifyL402Token.mockImplementationOnce(async () => {
      const invoiceResult = await mockCheckInvoice('test-hash')
      if (!invoiceResult.settled) {
        return {
          success: false,
          error: 'Invoice not paid',
        }
      }
      return {
        success: true,
        paymentHash: 'test-payment-hash',
        macaroon: {},
      }
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('verification failed')
  })
})

describe('POST /api/posts - Payment Amount Verification', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return 401 error when payment amount does not match reward + API fee', async () => {
    const testPost = createTestPost({ reward: 1000 })
    const testToken = createTestL402Token()

    // Mock verification to return macaroon with wrong amount
    mockVerifyL402Token.mockImplementationOnce(async () => ({
      success: true,
      paymentHash: 'test-payment-hash',
      macaroon: {
        caveats: [
          { condition: 'action', value: 'create_post' },
          { condition: 'amount', value: '500' }, // Wrong amount (should be 1010)
        ],
      },
    }))

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('Payment amount mismatch')
    expect(data.error).toContain('Expected 1010 sats')
  })

  it('should correctly calculate total payment for custom rewards', async () => {
    const customReward = 2500
    const testPost = createTestPost({ reward: customReward })
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.total_paid).toBe(customReward + TEST_CONSTANTS.API_ACCESS_FEE)
    expect(data.job_reward).toBe(customReward)
    expect(data.api_fee).toBe(TEST_CONSTANTS.API_ACCESS_FEE)
  })
})

describe('POST /api/posts - Database Integration', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return 500 error when database insert fails', async () => {
    mockCreateFundedAnonymousPostAction.mockImplementationOnce(
      mockCreateFundedAnonymousPostActionFailure
    )

    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to create post')
  })

  it('should pass all post fields to database action', async () => {
    const testPost = createTestPost({
      description: 'Detailed description',
      reward: 1500,
      image_url: 'https://example.com/custom-image.jpg',
      location: 'Custom Location',
      latitude: 51.5074,
      longitude: -0.1278,
      city: 'London',
    })
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    await POST(request)

    expect(mockCreateFundedAnonymousPostAction).toHaveBeenCalledWith({
      description: testPost.description,
      reward: testPost.reward,
      image_url: testPost.image_url,
      location: testPost.location,
      latitude: testPost.latitude,
      longitude: testPost.longitude,
      city: testPost.city,
      funding_r_hash: expect.any(String),
      funding_payment_request: '',
    })
  })
})

describe('POST /api/posts - CORS Headers in Development Mode', () => {
  beforeEach(() => {
    setupPostApiMocks()
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should include CORS headers in 402 challenge response', async () => {
    const testPost = createTestPost()
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
    })

    const response = await POST(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })

  it('should include CORS headers in successful post creation response', async () => {
    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('should include CORS headers in error responses', async () => {
    mockParseL402Header.mockReturnValueOnce(null)

    const testPost = createTestPost()
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: 'Invalid',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

describe('POST /api/posts - Error Handling and Edge Cases', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return 500 error when unexpected exception occurs', async () => {
    mockParseL402Header.mockImplementationOnce(() => {
      throw new Error('Unexpected error')
    })

    const testPost = createTestPost()
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPost),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })

  it('should handle malformed JSON request body gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: 'invalid-json{{{',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })

  it('should enforce reward >= 0 even with MIN_JOB_REWARD = 0', async () => {
    const testPostZeroReward = createTestPost({ reward: 0 })
    const testToken = createTestL402Token()

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: JSON.stringify(testPostZeroReward),
      headers: {
        Authorization: `L402 ${testToken.macaroon}:${testToken.preimage}`,
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.job_reward).toBe(0)
    expect(data.total_paid).toBe(TEST_CONSTANTS.API_ACCESS_FEE) // Only API fee
  })
})

describe('GET /api/posts - API Documentation', () => {
  beforeEach(() => {
    setupPostApiMocks()
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return API documentation with 200 status', async () => {
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe('Posts API endpoint')
    expect(data.endpoints).toBeDefined()
    expect(data.l402_info).toBeDefined()
  })

  it('should include L402 payment information in documentation', async () => {
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(data.l402_info.api_fee).toContain('10 sats')
    expect(data.l402_info.job_reward).toBeDefined()
    expect(data.l402_info.total_cost).toBeDefined()
  })

  it('should include CORS headers in GET response (dev mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'GET',
    })

    const response = await GET(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })
})

describe('OPTIONS /api/posts - CORS Preflight', () => {
  beforeEach(() => {
    setupPostApiMocks()
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    teardownPostApiMocks()
  })

  it('should return 200 status with CORS headers for OPTIONS request', async () => {
    const request = new NextRequest('http://localhost:3000/api/posts', {
      method: 'OPTIONS',
    })

    const response = await OPTIONS(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })
})import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/posts/route'
import { NextRequest } from 'next/server'
import {
  createMockPostData,
  createMockL402Token,
  createMockL402Challenge,
  createMockMacaroon,
  mockL402ChallengeSuccess,
  mockL402ChallengeFailure,
  mockL402VerificationSuccess,
  mockL402VerificationFailure,
  mockL402TokenParsingSuccess,
  mockL402TokenParsingFailure,
  mockPostCreationSuccess,
  mockPostCreationFailure,
  expectL402ChallengeResponse,
  expectPostCreatedResponse,
  expectCorsHeadersPresent,
  expectL402ChallengeHeaders,
  expectExposeHeaders,
  createL402AuthHeader,
  expectPostActionCalled,
  expectL402ChallengeCalled,
} from './helpers/posts-api-mocks'

// Mock all external dependencies
vi.mock('@/lib/l402', () => ({
  createL402Challenge: vi.fn(),
  verifyL402Token: vi.fn(),
  parseL402Header: vi.fn(),
  createL402Headers: vi.fn(),
}))

vi.mock('@/lib/lightning', () => ({
  createInvoice: vi.fn(),
  checkInvoice: vi.fn(),
}))

vi.mock('@/app/actions/post-actions', () => ({
  createFundedAnonymousPostAction: vi.fn(),
}))

// Import mocked functions for assertions
import * as l402 from '@/lib/l402'
import * as lightning from '@/lib/lightning'
import * as postActions from '@/app/actions/post-actions'

// Test Constants
const API_ACCESS_FEE = 10
const DEFAULT_JOB_REWARD = 1000
const MIN_JOB_REWARD = 0

// Helper to create mock NextRequest
function createMockRequest(body: any, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) {
    headers.set('Authorization', authHeader)
  }

  return {
    json: vi.fn().mockResolvedValue(body),
    headers,
    method: 'POST',
  } as any
}

describe('POST /api/posts Integration Tests', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'production' // Default to production for testing
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
  })

  describe('L402 Payment Challenge Flow', () => {
    it('should issue 402 challenge when no Authorization header is provided', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockChallenge = createMockL402Challenge()
      
      mockL402ChallengeSuccess(l402, mockChallenge)

      const request = createMockRequest(mockPostData)
      const response = await POST(request)
      const data = await response.json()

      expectL402ChallengeResponse(response, data)
      expectL402ChallengeHeaders(response)
      expectL402ChallengeCalled(l402, 1010, 1000)
      expect(data.total_amount).toBe(1010)
      expect(data.job_reward).toBe(1000)
      expect(data.payment_request).toBe(mockChallenge.invoice)
    })

    it('should use default job reward when reward is not provided in challenge', async () => {
      const mockPostData = createMockPostData({ reward: undefined as any })
      const mockChallenge = createMockL402Challenge()
      
      mockL402ChallengeSuccess(l402, mockChallenge)

      const request = createMockRequest(mockPostData)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(402)
      expect(data.job_reward).toBe(DEFAULT_JOB_REWARD)
      expect(data.total_amount).toBe(DEFAULT_JOB_REWARD + API_ACCESS_FEE)
      expectL402ChallengeCalled(l402, 1010, 1000)
    })

    it('should enforce minimum job reward of 0 sats', async () => {
      const mockPostData = createMockPostData({ reward: -100 })
      const mockChallenge = createMockL402Challenge()
      
      mockL402ChallengeSuccess(l402, mockChallenge)

      const request = createMockRequest(mockPostData)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(402)
      expect(data.job_reward).toBe(MIN_JOB_REWARD)
      expect(data.total_amount).toBe(MIN_JOB_REWARD + API_ACCESS_FEE)
    })

    it('should return 500 when L402 challenge creation fails', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      
      mockL402ChallengeFailure(l402, 'Lightning node unavailable')

      const request = createMockRequest(mockPostData)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toContain('Failed to create payment challenge')
      expect(data.error).toContain('Lightning node unavailable')
    })

    it('should include Expose-Headers for L402 challenge in development mode', async () => {
      process.env.NODE_ENV = 'development'
      
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockChallenge = createMockL402Challenge()
      
      mockL402ChallengeSuccess(l402, mockChallenge)

      const request = createMockRequest(mockPostData)
      const response = await POST(request)

      expect(response.status).toBe(402)
      expectExposeHeaders(response)
    })
  })

  describe('L402 Token Authentication', () => {
    it('should return 401 when Authorization header has invalid format', async () => {
      const mockPostData = createMockPostData()
      
      mockL402TokenParsingFailure(l402)

      const request = createMockRequest(mockPostData, 'Bearer invalid-token')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invalid Authorization header format')
      expect(data.error).toContain('Expected: L402 <macaroon>:<preimage>')
    })

    it('should return 401 when L402 token verification fails', async () => {
      const mockPostData = createMockPostData()
      const mockToken = createMockL402Token()
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationFailure(l402, 'Invalid macaroon signature')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 verification failed')
      expect(data.error).toContain('Invalid macaroon signature')
    })

    it('should return 401 when preimage does not match payment hash', async () => {
      const mockPostData = createMockPostData()
      const mockToken = createMockL402Token({ preimage: 'wrong-preimage-1234567890' })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationFailure(l402, 'Preimage does not match payment hash')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Preimage does not match payment hash')
    })

    it('should return 401 when invoice is not paid', async () => {
      const mockPostData = createMockPostData()
      const mockToken = createMockL402Token()
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationFailure(l402, 'Invoice not paid')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invoice not paid')
    })

    it('should return 401 when L402 token has expired', async () => {
      const mockPostData = createMockPostData()
      const expiredMacaroon = createMockMacaroon({ expires: Date.now() - 3600000 })
      const mockToken = createMockL402Token({
        macaroon: Buffer.from(JSON.stringify(expiredMacaroon)).toString('base64'),
      })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationFailure(l402, 'L402 token expired')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 token expired')
    })
  })

  describe('Request Body Validation', () => {
    it('should return 400 when description is missing', async () => {
      const mockPostData = { reward: 1000 } as any
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash)

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Description is required and must be a string')
    })

    it('should return 400 when description is not a string', async () => {
      const mockPostData = { description: 12345, reward: 1000 } as any
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash)

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Description is required and must be a string')
    })

    it('should return 400 when reward is negative', async () => {
      const mockPostData = createMockPostData({ reward: -100 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash)

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Reward must be a non-negative number')
    })

    it('should return 400 when reward is not a number', async () => {
      const mockPostData = createMockPostData({ reward: 'invalid' as any })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash)

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Reward must be a non-negative number')
    })

    it('should accept zero as a valid reward amount', async () => {
      const mockPostData = createMockPostData({ reward: 0 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 10 }) // 0 reward + 10 API fee
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.job_reward).toBe(0)
      expect(data.total_paid).toBe(10)
    })
  })

  describe('Payment Amount Verification', () => {
    it('should return 401 when payment amount does not match expected total', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 500 }) // Wrong amount
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Payment amount mismatch')
      expect(data.error).toContain('Expected 1010 sats')
      expect(data.error).toContain('1000 reward + 10 API fee')
      expect(data.error).toContain('token was for 500 sats')
    })

    it('should accept payment when amount matches reward + API fee', async () => {
      const mockPostData = createMockPostData({ reward: 2000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 2010 }) // 2000 + 10
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.total_paid).toBe(2010)
    })

    it('should use default reward when calculating expected payment if reward not provided', async () => {
      const mockPostData = createMockPostData({ reward: undefined as any })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 }) // Default 1000 + 10
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.job_reward).toBe(DEFAULT_JOB_REWARD)
      expect(data.total_paid).toBe(1010)
    })
  })

  describe('Post Creation', () => {
    it('should successfully create post with valid payment and data', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-uuid-1234')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expectPostCreatedResponse(response, data)
      expect(data.post_id).toBe('post-uuid-1234')
      expect(data.payment_hash).toBe(paymentHash)
      
      expectPostActionCalled(postActions, {
        description: mockPostData.description,
        reward: 1000,
        funding_r_hash: paymentHash,
      })
    })

    it('should return 500 when post creation fails', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationFailure(postActions, 'Database connection failed')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toContain('Failed to create post')
      expect(data.error).toContain('Database connection failed')
    })

    it('should pass all post details to createFundedAnonymousPostAction', async () => {
      const mockPostData = createMockPostData({
        description: 'Fix streetlight',
        reward: 1500,
        image_url: 'https://example.com/image.jpg',
        location: 'Main St',
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
      })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1510 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      await POST(request)

      // API uses location as city when both are provided (see route.ts line 140)
      expect(postActions.createFundedAnonymousPostAction).toHaveBeenCalledWith({
        description: 'Fix streetlight',
        reward: 1500,
        image_url: 'https://example.com/image.jpg',
        location: 'Main St',
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'Main St', // API uses location for city field
        funding_r_hash: paymentHash,
        funding_payment_request: '',
      })
    })

    it('should handle null optional fields in post data', async () => {
      const mockPostData = createMockPostData({
        image_url: null,
        location: null,
        latitude: null,
        longitude: null,
        city: null,
      })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      
      expect(postActions.createFundedAnonymousPostAction).toHaveBeenCalledWith(
        expect.objectContaining({
          image_url: null,
          location: null,
          latitude: null,
          longitude: null,
          city: null,
        })
      )
    })
  })

  describe('CORS Configuration', () => {
    it('should include CORS headers in all responses in development mode', async () => {
      process.env.NODE_ENV = 'development'
      
      const mockPostData = createMockPostData()
      const request = createMockRequest(mockPostData)
      
      mockL402ChallengeSuccess(l402, createMockL402Challenge())

      const response = await POST(request)

      expectCorsHeadersPresent(response)
    })

    it('should not include CORS headers in successful post creation in production mode', async () => {
      process.env.NODE_ENV = 'production'
      
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
    })

    it('should include CORS headers in error responses in development mode', async () => {
      process.env.NODE_ENV = 'development'
      
      const mockPostData = { reward: 1000 } as any // Missing description
      const mockToken = createMockL402Token()
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, 'payment-hash-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)

      expect(response.status).toBe(400)
      expectCorsHeadersPresent(response)
    })
  })

  describe('Error Handling', () => {
    it('should return 500 with generic error message on unexpected errors', async () => {
      const mockPostData = createMockPostData()
      
      vi.mocked(l402.parseL402Header).mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      const authHeader = 'L402 some-token:some-preimage'
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should handle JSON parsing errors gracefully', async () => {
      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: new Headers(),
        method: 'POST',
      } as any

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const mockPostData = createMockPostData()
      const testError = new Error('Test error')
      
      vi.mocked(l402.parseL402Header).mockImplementation(() => {
        throw testError
      })

      const authHeader = 'L402 some-token:some-preimage'
      const request = createMockRequest(mockPostData, authHeader)
      await POST(request)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in /api/posts:', testError)
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large reward amounts', async () => {
      const largeReward = 10000000 // 10M sats
      const mockPostData = createMockPostData({ reward: largeReward })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: largeReward + 10 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.job_reward).toBe(largeReward)
      expect(data.total_paid).toBe(largeReward + 10)
    })

    it('should handle very long description strings', async () => {
      const longDescription = 'Fix streetlight. '.repeat(100) // ~1700 characters
      const mockPostData = createMockPostData({ description: longDescription, reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(postActions.createFundedAnonymousPostAction).toHaveBeenCalledWith(
        expect.objectContaining({
          description: longDescription,
        })
      )
    })

    it('should handle missing title field gracefully', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      delete (mockPostData as any).title // Remove title field
      
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
    })

    it('should handle concurrent payment verification requests', async () => {
      const mockPostData1 = createMockPostData({ description: 'Post 1', reward: 1000 })
      const mockPostData2 = createMockPostData({ description: 'Post 2', reward: 2000 })
      
      const mockToken1 = createMockL402Token({ paymentHash: 'hash-1' })
      const mockToken2 = createMockL402Token({ paymentHash: 'hash-2' })
      
      mockL402TokenParsingSuccess(l402, mockToken1)
      vi.mocked(l402.verifyL402Token)
        .mockResolvedValueOnce({
          success: true,
          paymentHash: 'hash-1',
          macaroon: createMockMacaroon({ amount: 1010 }),
        })
        .mockResolvedValueOnce({
          success: true,
          paymentHash: 'hash-2',
          macaroon: createMockMacaroon({ amount: 2010 }),
        })
      
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader1 = createL402AuthHeader(mockToken1)
      const authHeader2 = createL402AuthHeader(mockToken2)
      
      const request1 = createMockRequest(mockPostData1, authHeader1)
      const request2 = createMockRequest(mockPostData2, authHeader2)

      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ])

      expect(response1.status).toBe(201)
      expect(response2.status).toBe(201)
    })

    it('should handle missing macaroon caveats gracefully', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = { ...createMockMacaroon(), caveats: [] } // No caveats
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon as any)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      const response = await POST(request)
      const data = await response.json()

      // Should proceed without amount verification when caveat is missing
      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
    })
  })

  describe('Integration with createFundedAnonymousPostAction', () => {
    it('should pass funding_payment_request as empty string', async () => {
      const mockPostData = createMockPostData({ reward: 1000 })
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      await POST(request)

      expect(postActions.createFundedAnonymousPostAction).toHaveBeenCalledWith(
        expect.objectContaining({
          funding_payment_request: '',
        })
      )
    })

    it('should use location as city when city is not provided', async () => {
      const mockPostData = createMockPostData({
        location: 'Main Street',
        city: undefined as any,
      })
      delete (mockPostData as any).city
      
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      await POST(request)

      expect(postActions.createFundedAnonymousPostAction).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Main Street',
          location: 'Main Street',
        })
      )
    })

    it('should preserve null values for optional fields', async () => {
      const mockPostData = {
        description: 'Fix issue',
        reward: 1000,
        image_url: null,
        location: null,
        latitude: null,
        longitude: null,
        city: null,
      }
      
      const mockToken = createMockL402Token()
      const paymentHash = 'payment-hash-123'
      const mockMacaroon = createMockMacaroon({ amount: 1010 })
      
      mockL402TokenParsingSuccess(l402, mockToken)
      mockL402VerificationSuccess(l402, paymentHash, mockMacaroon)
      mockPostCreationSuccess(postActions, 'post-123')

      const authHeader = createL402AuthHeader(mockToken)
      const request = createMockRequest(mockPostData, authHeader)
      await POST(request)

      expect(postActions.createFundedAnonymousPostAction).toHaveBeenCalledWith({
        description: 'Fix issue',
        reward: 1000,
        image_url: null,
        location: null,
        latitude: null,
        longitude: null,
        city: null,
        funding_r_hash: paymentHash,
        funding_payment_request: '',
      })
    })
  })
})