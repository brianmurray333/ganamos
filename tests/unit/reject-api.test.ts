import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/l402', () => ({
  verifyL402Token: vi.fn(),
  parseL402Header: vi.fn(),
}))

vi.mock('@/lib/lightning', () => ({
  createInvoice: vi.fn(),
  checkInvoice: vi.fn(),
}))

const mockSingle = vi.fn()
const mockEq = vi.fn().mockReturnThis()
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
mockEq.mockImplementation(() => ({
  eq: mockEq,
  single: mockSingle,
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
  })),
}))

import * as l402 from '@/lib/l402'

const MOCK_PAYMENT_HASH = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'

function createMockRequest(withAuth = true, body?: Record<string, unknown>) {
  const headers = new Headers()
  if (withAuth) {
    headers.set('Authorization', 'L402 mock-macaroon:mock-preimage')
  }
  const init: RequestInit = { method: 'POST', headers }
  if (body) {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(body)
  }
  return new NextRequest('http://localhost:3000/api/posts/test-post-id/reject', init)
}

function mockL402Success(paymentHash = MOCK_PAYMENT_HASH) {
  vi.mocked(l402.parseL402Header).mockReturnValue({
    macaroon: 'mock-macaroon',
    preimage: 'mock-preimage',
  })
  vi.mocked(l402.verifyL402Token).mockResolvedValue({
    success: true,
    paymentHash,
  })
}

function mockL402Failure(error: string) {
  vi.mocked(l402.parseL402Header).mockReturnValue({
    macaroon: 'mock-macaroon',
    preimage: 'mock-preimage',
  })
  vi.mocked(l402.verifyL402Token).mockResolvedValue({
    success: false,
    error,
  })
}

function mockPostData(overrides: Record<string, unknown> = {}) {
  mockSingle.mockResolvedValue({
    data: {
      id: 'test-post-id',
      fixed: false,
      under_review: true,
      deleted_at: null,
      funding_r_hash: MOCK_PAYMENT_HASH,
      submitted_fix_payment_hash: 'fixer-payment-hash',
      ...overrides,
    },
    error: null,
  })
}

describe('POST /api/posts/[id]/reject - Poster Rejects Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Authentication', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(false)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 token required')
    })

    it('should return 401 when L402 header is malformed', async () => {
      vi.mocked(l402.parseL402Header).mockReturnValue(null)

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invalid Authorization header format')
    })

    it('should return 401 when L402 token verification fails', async () => {
      mockL402Failure('Invoice not paid')

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invoice not paid')
    })

    it('should call verifyL402Token with skipExpiry: true', async () => {
      mockL402Success()
      mockPostData()

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })

      expect(l402.verifyL402Token).toHaveBeenCalledWith(
        expect.any(Object),
        { skipExpiry: true }
      )
    })
  })

  describe('Authorization', () => {
    it('should return 403 when payment hash does not match', async () => {
      mockL402Success('different-payment-hash')
      mockPostData()

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('does not match this post')
    })
  })

  describe('Post Not Found', () => {
    it('should return 404 when post does not exist', async () => {
      mockL402Success()
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent-id' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Post not found')
    })
  })

  describe('State Validation', () => {
    it('should return 409 when post is deleted', async () => {
      mockL402Success()
      mockPostData({ deleted_at: '2026-03-04T16:00:00Z' })

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('deleted')
    })

    it('should return 409 when fix is already approved', async () => {
      mockL402Success()
      mockPostData({ fixed: true })

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('already been approved')
    })

    it('should return 409 when no fix is under review', async () => {
      mockL402Success()
      mockPostData({ under_review: false })

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('No fix is currently submitted')
    })
  })

  describe('Successful Rejection', () => {
    it('should reject fix and reopen post', async () => {
      mockL402Success()
      mockPostData()

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.post_id).toBe('test-post-id')
      expect(data.message).toContain('open for new submissions')
    })

    it('should include rejection reason when provided', async () => {
      mockL402Success()
      mockPostData()

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true, { reason: 'The fix does not address the issue' })
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reason).toBe('The fix does not address the issue')
    })

    it('should work without a request body (reason is optional)', async () => {
      mockL402Success()
      mockPostData()

      const { POST } = await import('@/app/api/posts/[id]/reject/route')
      const request = createMockRequest(true)
      const response = await POST(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reason).toBeNull()
    })
  })
})
