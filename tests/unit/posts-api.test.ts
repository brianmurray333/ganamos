import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST, GET } from '@/app/api/posts/route'
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
  createMockGetRequest,
  getApiDocumentation,
  expectApiDocumentationResponse,
  expectDocumentationMatchesConstants,
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

  describe('GET /api/posts - API Documentation', () => {
    it('should return API documentation without authentication', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('message')
      expect(data.message).toBe('Posts API endpoint')
    })

    it('should return endpoint descriptions in documentation', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('endpoints')
      expect(data.endpoints).toHaveProperty('POST /api/posts')
      expect(data.endpoints).toHaveProperty('GET /api/posts')
      expect(data.endpoints['POST /api/posts']).toContain('L402 payment')
      expect(data.endpoints['GET /api/posts']).toContain('free')
    })

    it('should return accurate L402 payment information', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('l402_info')
      expect(data.l402_info).toHaveProperty('api_fee', '10 sats (fixed)')
      expect(data.l402_info).toHaveProperty('job_reward')
      expect(data.l402_info.job_reward).toContain('minimum: 0 sats')
      expect(data.l402_info.job_reward).toContain('default: 1000 sats')
      expect(data.l402_info).toHaveProperty('total_cost')
      expect(data.l402_info.total_cost).toContain('Job reward + 10 sats API fee')
      expect(data.l402_info).toHaveProperty('currency', 'satoshis')
      expect(data.l402_info).toHaveProperty('documentation')
    })

    it('should include L402 documentation link', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(data.l402_info.documentation).toBe('https://docs.lightning.engineering/the-lightning-network/l402')
    })

    it('should include CORS headers in development mode', async () => {
      process.env.NODE_ENV = 'development'
      
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)

      expectCorsHeadersPresent(response)
    })

    it('should not include CORS headers in production mode', async () => {
      process.env.NODE_ENV = 'production'
      
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
    })

    it('should not require any authentication headers', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      // Request without any auth headers
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('message')
      expect(data).toHaveProperty('endpoints')
      expect(data).toHaveProperty('l402_info')
    })

    it('should return consistent response structure across multiple calls', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      const request1 = { method: 'GET', headers: new Headers() } as any
      const request2 = { method: 'GET', headers: new Headers() } as any

      const [response1, response2] = await Promise.all([
        GET(request1),
        GET(request2),
      ])

      const [data1, data2] = await Promise.all([
        response1.json(),
        response2.json(),
      ])

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      expect(data1).toEqual(data2)
    })

    it('should include content-type application/json header', async () => {
      const { GET } = await import('@/app/api/posts/route')
      
      const request = {
        method: 'GET',
        headers: new Headers(),
      } as any

      const response = await GET(request)

      expect(response.headers.get('content-type')).toContain('application/json')
    })
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

describe('GET /api/posts Integration Tests', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
  })

  // Helper to create mock GET request
  function createMockGetRequest(): NextRequest {
    return {
      method: 'GET',
      headers: new Headers(),
    } as any
  }

  describe('API Documentation Response', () => {
    it('should return 200 status with API documentation', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('message', 'Posts API endpoint')
      expect(data).toHaveProperty('endpoints')
      expect(data).toHaveProperty('l402_info')
    })

    it('should list available endpoints', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.endpoints).toEqual({
        'POST /api/posts': 'Create a new post (requires L402 payment)',
        'GET /api/posts': 'List posts (free)'
      })
    })

    it('should include L402 configuration details', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.l402_info).toEqual({
        api_fee: '10 sats (fixed)',
        job_reward: 'Variable (minimum: 0 sats, default: 1000 sats)',
        total_cost: 'Job reward + 10 sats API fee',
        currency: 'satoshis',
        documentation: 'https://docs.lightning.engineering/the-lightning-network/l402'
      })
    })

    it('should return valid JSON structure', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toMatchObject({
        message: expect.any(String),
        endpoints: expect.any(Object),
        l402_info: expect.objectContaining({
          api_fee: expect.any(String),
          job_reward: expect.any(String),
          total_cost: expect.any(String),
          currency: expect.any(String),
          documentation: expect.any(String),
        })
      })
    })
  })

  describe('Authentication Requirements', () => {
    it('should not require Authorization header for GET requests', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('WWW-Authenticate')).toBeNull()
    })

    it('should return documentation even with invalid Authorization header', async () => {
      const headers = new Headers()
      headers.set('Authorization', 'Bearer invalid-token')
      
      const request = {
        method: 'GET',
        headers,
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('message', 'Posts API endpoint')
    })

    it('should return documentation with valid L402 token present', async () => {
      const mockToken = createMockL402Token()
      const headers = new Headers()
      headers.set('Authorization', createL402AuthHeader(mockToken))
      
      const request = {
        method: 'GET',
        headers,
      } as any

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('message', 'Posts API endpoint')
      
      // Verify L402 verification was not called for GET
      expect(l402.verifyL402Token).not.toHaveBeenCalled()
    })
  })

  describe('CORS Headers', () => {
    it('should include CORS headers in development mode', async () => {
      process.env.NODE_ENV = 'development'

      const request = createMockGetRequest()
      const response = await GET(request)

      expectCorsHeadersPresent(response)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
    })

    it('should not include CORS headers in production mode', async () => {
      process.env.NODE_ENV = 'production'

      const request = createMockGetRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
    })

    it('should handle different NODE_ENV values correctly', async () => {
      const testEnvs = ['development', 'test', 'staging', 'production']

      for (const env of testEnvs) {
        process.env.NODE_ENV = env
        const request = createMockGetRequest()
        const response = await GET(request)

        expect(response.status).toBe(200)
        
        if (env === 'development') {
          expectCorsHeadersPresent(response)
        } else {
          expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
        }
      }
    })
  })

  describe('Response Content Type', () => {
    it('should return JSON content type', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)

      const contentType = response.headers.get('Content-Type')
      expect(contentType).toContain('application/json')
    })

    it('should return parseable JSON body', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)

      // Should not throw when parsing
      const data = await response.json()
      expect(data).toBeDefined()
      expect(typeof data).toBe('object')
    })
  })

  describe('Error Handling', () => {
    it('should handle GET request errors gracefully', async () => {
      // Create a request that will cause an error
      const request = {
        method: 'GET',
        headers: null as any, // Invalid headers
      } as any

      const response = await GET(request)

      // Should still return a response (error handling should catch it)
      expect(response).toBeDefined()
    })
  })

  describe('Integration Tests', () => {
    it('should provide consistent API information across multiple GET requests', async () => {
      const request1 = createMockGetRequest()
      const request2 = createMockGetRequest()

      const response1 = await GET(request1)
      const response2 = await GET(request2)

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(data1).toEqual(data2)
      expect(data1.l402_info.api_fee).toBe(data2.l402_info.api_fee)
    })

    it('should not trigger any database operations', async () => {
      const request = createMockGetRequest()
      await GET(request)

      // GET should not call any post-creation actions
      expect(postActions.createFundedAnonymousPostAction).not.toHaveBeenCalled()
    })

    it('should not trigger Lightning Network operations', async () => {
      const request = createMockGetRequest()
      await GET(request)

      // GET should not create invoices or check payments
      expect(lightning.createInvoice).not.toHaveBeenCalled()
      expect(lightning.checkInvoice).not.toHaveBeenCalled()
    })

    it('should not trigger L402 challenge creation', async () => {
      const request = createMockGetRequest()
      await GET(request)

      // GET should not create L402 challenges
      expect(l402.createL402Challenge).not.toHaveBeenCalled()
    })
  })

  describe('Documentation Content Accuracy', () => {
    it('should accurately reflect API_ACCESS_FEE constant', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.l402_info.api_fee).toBe(`${API_ACCESS_FEE} sats (fixed)`)
    })

    it('should accurately reflect MIN_JOB_REWARD constant', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.l402_info.job_reward).toContain(`minimum: ${MIN_JOB_REWARD} sats`)
    })

    it('should accurately reflect DEFAULT_JOB_REWARD constant', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.l402_info.job_reward).toContain(`default: ${DEFAULT_JOB_REWARD} sats`)
    })

    it('should include correct L402 documentation link', async () => {
      const request = createMockGetRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.l402_info.documentation).toBe('https://docs.lightning.engineering/the-lightning-network/l402')
    })
  })
})