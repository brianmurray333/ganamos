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

const MOCK_FIX_PAYMENT_HASH = 'f1x2e3r4a5b6789012345678901234567890abcdef1234567890abcdef123456'

function createMockRequest(withAuth = true) {
  const headers = new Headers()
  if (withAuth) {
    headers.set('Authorization', 'L402 mock-macaroon:mock-preimage')
  }
  return new NextRequest('http://localhost:3000/api/fixes/test-post-id', {
    method: 'GET',
    headers,
  })
}

function mockL402Success(paymentHash = MOCK_FIX_PAYMENT_HASH) {
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
      reward: 1000,
      under_review: true,
      fixed: false,
      fixed_at: null,
      deleted_at: null,
      submitted_fix_at: '2026-03-04T12:00:00Z',
      submitted_fix_payment_hash: MOCK_FIX_PAYMENT_HASH,
      submitted_fix_proof_text: 'https://example.com/proof',
      submitted_fix_image_url: null,
      submitted_fix_note: 'Done',
      submitted_fix_payout_invoice: 'lnbc1000n1...',
      fix_proof_text: null,
      fixed_image_url: null,
      fixer_note: null,
      anonymous_reward_paid_at: null,
      anonymous_reward_payment_hash: null,
      ...overrides,
    },
    error: null,
  })
}

describe('GET /api/fixes/[postId] - Fixer Status Polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Authentication', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(false)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 token required')
    })

    it('should return 401 when L402 header is malformed', async () => {
      vi.mocked(l402.parseL402Header).mockReturnValue(null)

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invalid Authorization header format')
    })

    it('should return 401 when L402 token verification fails', async () => {
      mockL402Failure('Invalid macaroon signature')

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Invalid macaroon signature')
    })

    it('should call verifyL402Token with skipExpiry: true', async () => {
      mockL402Success()
      mockPostData()

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(l402.verifyL402Token).toHaveBeenCalledWith(
        expect.any(Object),
        { skipExpiry: true }
      )
    })
  })

  describe('Authorization', () => {
    it('should return 403 when payment hash does not match fix submission', async () => {
      mockL402Success('wrong-payment-hash')
      mockPostData({ submitted_fix_payment_hash: MOCK_FIX_PAYMENT_HASH })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('does not match a fix submission')
    })
  })

  describe('Post Not Found', () => {
    it('should return 404 when post does not exist', async () => {
      mockL402Success()
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'nonexistent-id' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Post not found')
    })
  })

  describe('Status: pending_review', () => {
    it('should return pending_review when fix is under review', async () => {
      mockL402Success()
      mockPostData({ under_review: true, fixed: false })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.fix_status).toBe('pending_review')
      expect(data.post_id).toBe('test-post-id')
      expect(data.reward).toBe(1000)
      expect(data.submitted_at).toBe('2026-03-04T12:00:00Z')
      expect(data.message).toContain('awaiting review')
    })
  })

  describe('Status: approved', () => {
    it('should return approved when fix is marked as fixed', async () => {
      mockL402Success()
      mockPostData({
        under_review: false,
        fixed: true,
        fixed_at: '2026-03-04T14:00:00Z',
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.fix_status).toBe('approved')
      expect(data.fixed_at).toBe('2026-03-04T14:00:00Z')
      expect(data.message).toContain('approved')
    })

    it('should indicate reward paid when anonymous_reward_paid_at is set', async () => {
      mockL402Success()
      mockPostData({
        fixed: true,
        fixed_at: '2026-03-04T14:00:00Z',
        anonymous_reward_paid_at: '2026-03-04T14:05:00Z',
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(data.fix_status).toBe('approved')
      expect(data.reward_paid).toBe(true)
      expect(data.reward_paid_at).toBe('2026-03-04T14:05:00Z')
    })

    it('should indicate reward pending when payout invoice exists but not paid', async () => {
      mockL402Success()
      mockPostData({
        fixed: true,
        fixed_at: '2026-03-04T14:00:00Z',
        anonymous_reward_paid_at: null,
        submitted_fix_payout_invoice: 'lnbc1000n1...',
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(data.fix_status).toBe('approved')
      expect(data.reward_paid).toBe(false)
      expect(data.message).toContain('payout is pending')
    })

    it('should prompt for payout invoice when none provided', async () => {
      mockL402Success()
      mockPostData({
        fixed: true,
        fixed_at: '2026-03-04T14:00:00Z',
        anonymous_reward_paid_at: null,
        submitted_fix_payout_invoice: null,
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(data.fix_status).toBe('approved')
      expect(data.reward_paid).toBe(false)
      expect(data.message).toContain('Provide a payout invoice')
    })
  })

  describe('Status: rejected', () => {
    it('should return rejected when post is not under review and not fixed', async () => {
      mockL402Success()
      mockPostData({
        under_review: false,
        fixed: false,
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.fix_status).toBe('rejected')
      expect(data.message).toContain('not approved')
    })
  })

  describe('Status: post_deleted', () => {
    it('should return post_deleted when post has been soft-deleted', async () => {
      mockL402Success()
      mockPostData({
        deleted_at: '2026-03-04T16:00:00Z',
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.fix_status).toBe('post_deleted')
      expect(data.message).toContain('deleted')
    })

    it('should prioritize post_deleted status over approved', async () => {
      mockL402Success()
      mockPostData({
        deleted_at: '2026-03-04T16:00:00Z',
        fixed: true,
      })

      const { GET } = await import('@/app/api/fixes/[postId]/route')
      const request = createMockRequest(true)
      const response = await GET(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(data.fix_status).toBe('post_deleted')
    })
  })
})
