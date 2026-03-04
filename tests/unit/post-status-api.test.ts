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
mockEq.mockImplementation(() => ({
  eq: mockEq,
  single: mockSingle,
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  })),
}))

import * as l402 from '@/lib/l402'

const MOCK_PAYMENT_HASH = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'

function createMockRequest(withAuth = true) {
  const headers = new Headers()
  if (withAuth) {
    headers.set('Authorization', 'L402 mock-macaroon:mock-preimage')
  }
  return new NextRequest('http://localhost:3000/api/posts/test-post-id', {
    method: 'GET',
    headers,
  })
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
      title: 'Fix broken streetlight',
      description: 'The streetlight on Main St is broken',
      reward: 1000,
      has_image: false,
      created_at: '2026-03-04T00:00:00Z',
      expires_at: null,
      fixed: false,
      fixed_at: null,
      fixed_by: null,
      under_review: false,
      deleted_at: null,
      submitted_fix_at: null,
      submitted_fix_by_name: null,
      submitted_fix_image_url: null,
      submitted_fix_note: null,
      submitted_fix_proof_text: null,
      submitted_fix_payout_invoice: null,
      fix_proof_text: null,
      fixed_image_url: null,
      fixer_note: null,
      funding_r_hash: MOCK_PAYMENT_HASH,
      ...overrides,
    },
    error: null,
  })
}

describe('GET /api/posts/[id] - Poster Status Polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Authentication', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(false)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 token required')
    })

    it('should return 401 when L402 header is malformed', async () => {
      vi.mocked(l402.parseL402Header).mockReturnValue(null)

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invalid Authorization header format')
    })

    it('should return 401 when L402 token verification fails', async () => {
      mockL402Failure('Invoice not paid')

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invoice not paid')
    })

    it('should call verifyL402Token with skipExpiry: true', async () => {
      mockL402Success()
      mockPostData()

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })

      expect(l402.verifyL402Token).toHaveBeenCalledWith(
        expect.any(Object),
        { skipExpiry: true }
      )
    })
  })

  describe('Authorization', () => {
    it('should return 403 when payment hash does not match post funding_r_hash', async () => {
      mockL402Success('different-payment-hash')
      mockPostData({ funding_r_hash: MOCK_PAYMENT_HASH })

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('does not match this post')
    })
  })

  describe('Post Not Found', () => {
    it('should return 404 when post does not exist', async () => {
      mockL402Success()
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent-id' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Post not found')
    })
  })

  describe('Status: open', () => {
    it('should return status open for a post with no fix submissions', async () => {
      mockL402Success()
      mockPostData()

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('open')
      expect(data.post_id).toBe('test-post-id')
      expect(data.title).toBe('Fix broken streetlight')
      expect(data.reward).toBe(1000)
      expect(data).not.toHaveProperty('fix_submission')
      expect(data).not.toHaveProperty('fix_result')
    })
  })

  describe('Status: under_review', () => {
    it('should return status under_review with fix submission details', async () => {
      mockL402Success()
      mockPostData({
        under_review: true,
        submitted_fix_at: '2026-03-04T12:00:00Z',
        submitted_fix_by_name: 'Agent Fixer',
        submitted_fix_proof_text: 'https://example.com/proof',
        submitted_fix_note: 'Fixed the issue',
        submitted_fix_payout_invoice: 'lnbc1000n1...',
      })

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('under_review')
      expect(data.fix_submission).toBeDefined()
      expect(data.fix_submission.submitted_at).toBe('2026-03-04T12:00:00Z')
      expect(data.fix_submission.fixer_name).toBe('Agent Fixer')
      expect(data.fix_submission.proof_text).toBe('https://example.com/proof')
      expect(data.fix_submission.note).toBe('Fixed the issue')
      expect(data.fix_submission.payout_invoice).toBe('lnbc1000n1...')
    })
  })

  describe('Status: fixed', () => {
    it('should return status fixed with fix result details', async () => {
      mockL402Success()
      mockPostData({
        fixed: true,
        fixed_at: '2026-03-04T14:00:00Z',
        fixed_by: 'fixer-user-id',
        fixed_image_url: 'https://example.com/after.jpg',
        fix_proof_text: 'Completed the task',
        fixer_note: 'All done',
      })

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('fixed')
      expect(data.fix_result).toBeDefined()
      expect(data.fix_result.fixed_at).toBe('2026-03-04T14:00:00Z')
      expect(data.fix_result.fixed_by).toBe('fixer-user-id')
      expect(data.fix_result.fix_proof_text).toBe('Completed the task')
    })
  })

  describe('Status: deleted', () => {
    it('should return status deleted when post has been soft-deleted', async () => {
      mockL402Success()
      mockPostData({
        deleted_at: '2026-03-04T16:00:00Z',
      })

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('deleted')
    })

    it('should prioritize deleted status over fixed', async () => {
      mockL402Success()
      mockPostData({
        deleted_at: '2026-03-04T16:00:00Z',
        fixed: true,
      })

      const { GET } = await import('@/app/api/posts/[id]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ id: 'test-post-id' }) })
      const data = await response.json()

      expect(data.status).toBe('deleted')
    })
  })
})
