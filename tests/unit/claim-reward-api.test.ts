import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/l402', () => ({
  verifyL402Token: vi.fn(),
  parseL402Header: vi.fn(),
}))

vi.mock('@/lib/lightning', () => ({
  createInvoice: vi.fn(),
  checkInvoice: vi.fn(),
  payInvoice: vi.fn(),
}))

vi.mock('@/lib/lightning-validation', () => ({
  extractInvoiceAmount: vi.fn().mockReturnValue(100),
  validateLightningInvoice: vi.fn((inv: string) => typeof inv === 'string' && inv.startsWith('lnbc')),
  isAmountlessInvoice: vi.fn(() => false),
}))

vi.mock('@/lib/security-alerts', () => ({ sendRewardOnHoldAlert: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/verify-fix', () => ({ AUTO_APPROVE_CONFIDENCE: 8, verifyFixImages: vi.fn() }))

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => state.db.client()),
}))

import * as l402 from '@/lib/l402'
import { FakeDb } from '@/tests/helpers/fake-supabase'

const MOCK_FIXER_HASH = 'fixer-payment-hash-abc123def456'

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
  return new NextRequest('http://localhost:3000/api/fixes/test-post-id/claim', init)
}

function mockL402Success(paymentHash = MOCK_FIXER_HASH) {
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

/** An approved, funded ownerless (agent) post awaiting payout to its L402 fixer. */
function mockPostData(overrides: Record<string, unknown> = {}) {
  state.db = new FakeDb({
    posts: [{
      id: 'test-post-id',
      user_id: null,
      reward: 100,
      title: 'Agent job',
      fixed: true,
      fixed_by: null,
      fixed_by_is_anonymous: true,
      deleted_at: null,
      reward_paid_at: null,
      submitted_fix_payment_hash: MOCK_FIXER_HASH,
      anonymous_reward_paid_at: null,
      anonymous_reward_payment_hash: null,
      anonymous_reward_payment_lock: null,
      funding_status: 'paid',
      funding_r_hash: 'f'.repeat(64),
      created_at: '2026-11-08T12:00:00Z',
      ...overrides,
    }],
    transactions: [],
    activities: [],
  })
}

describe('POST /api/fixes/[postId]/claim - Fixer Claims Reward', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.LND_REST_URL = 'https://lnd.test'
    process.env.LND_ADMIN_MACAROON = 'abcd'
    vi.resetModules()
    mockPostData()
    const validation = await import('@/lib/lightning-validation')
    vi.mocked(validation.extractInvoiceAmount).mockReturnValue(100)
  })

  describe('Authentication', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(false, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 token required')
    })

    it('should return 401 when L402 header is malformed', async () => {
      vi.mocked(l402.parseL402Header).mockReturnValue(null)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(response.status).toBe(401)
    })

    it('should return 401 when L402 verification fails', async () => {
      mockL402Failure('Invalid preimage')

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(response.status).toBe(401)
    })

    it('should call verifyL402Token with skipExpiry: true', async () => {
      mockL402Success()
      mockPostData()

      const lightning = await import('@/lib/lightning')
      vi.mocked(lightning.payInvoice).mockResolvedValue({ success: true, paymentHash: 'h' } as any)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(l402.verifyL402Token).toHaveBeenCalledWith(expect.any(Object), { skipExpiry: true })
    })
  })

  describe('Validation', () => {
    it('should return 400 when no payout_invoice is provided', async () => {
      mockL402Success()

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, {})
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('payout_invoice is required')
    })

    it('should return 400 when request body is not valid JSON', async () => {
      mockL402Success()

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const headers = new Headers()
      headers.set('Authorization', 'L402 mock-macaroon:mock-preimage')
      const request = new NextRequest('http://localhost:3000/api/fixes/test-post-id/claim', {
        method: 'POST',
        headers,
      })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(response.status).toBe(400)
    })
  })

  describe('Authorization', () => {
    it('should return 403 when payment hash does not match fixer', async () => {
      mockL402Success('wrong-fixer-hash')
      mockPostData()

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('does not match')
    })
  })

  describe('State Validation', () => {
    it('should return 404 when post does not exist', async () => {
      mockL402Success()
      state.db = new FakeDb({ posts: [] })

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'nonexistent' }) })

      expect(response.status).toBe(404)
    })

    it('should return 409 when post is deleted', async () => {
      mockL402Success()
      mockPostData({ deleted_at: '2026-03-04T00:00:00Z' })

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(response.status).toBe(409)
    })

    it('should return 409 when fix has not been approved yet', async () => {
      mockL402Success()
      mockPostData({ fixed: false })

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('not been approved yet')
    })

    it('should return 409 when reward has already been paid', async () => {
      mockL402Success()
      mockPostData({
        anonymous_reward_paid_at: '2026-03-04T12:00:00Z',
        anonymous_reward_payment_hash: 'already-paid-hash',
      })

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('already been paid')
      expect(data.paid_at).toBe('2026-03-04T12:00:00Z')
    })

    it('should return 409 when post has no reward', async () => {
      mockL402Success()
      mockPostData({ reward: 0 })

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })

      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain('no reward')
    })
  })

  describe('Successful Claim', () => {
    it('should pay reward and return success', async () => {
      mockL402Success()
      mockPostData()

      const lightning = await import('@/lib/lightning')
      vi.mocked(lightning.payInvoice).mockResolvedValue({
        success: true,
        paymentHash: 'reward-paid-hash',
      } as any)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reward_paid).toBe(true)
      expect(data.reward_amount).toBe(100)
      expect(data.payment_hash).toBe('reward-paid-hash')
    })

    it('should return 502 when payment fails (retryable)', async () => {
      mockL402Success()
      mockPostData()

      const lightning = await import('@/lib/lightning')
      vi.mocked(lightning.payInvoice).mockResolvedValue({
        success: false,
        error: 'Payment failed: no route',
        details: { payment_error: 'no route' },
      } as any)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc100n1test' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(502)
      expect(data.success).toBe(false)
      expect(data.reward_paid).toBe(false)
      expect(data.message).toContain('retry')
    })

    it('should refuse invoice exceeding reward amount', async () => {
      mockL402Success()
      mockPostData({ reward: 100 })

      const validation = await import('@/lib/lightning-validation')
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(50000)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const request = createMockRequest(true, { payout_invoice: 'lnbc500000n1malicious' })
      const response = await POST(request, { params: Promise.resolve({ postId: 'test-post-id' }) })
      const data = await response.json()

      expect(response.status).toBe(502)
      expect(data.error).toContain('exactly 100 sats')
      const lightning = await import('@/lib/lightning')
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })

    it('should refuse an invoice for less than the reward', async () => {
      mockL402Success()
      const validation = await import('@/lib/lightning-validation')
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(1)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const response = await POST(createMockRequest(true, { payout_invoice: 'lnbc10n1small' }), { params: Promise.resolve({ postId: 'test-post-id' }) })
      expect(response.status).toBe(502)
      const lightning = await import('@/lib/lightning')
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })
  })

  describe('Double payment protection', () => {
    it('concurrent claims pay once', async () => {
      mockL402Success()
      const lightning = await import('@/lib/lightning')
      vi.mocked(lightning.payInvoice).mockResolvedValue({ success: true, paymentHash: 'h' } as any)

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const responses = await Promise.all(['lnbc1a', 'lnbc1b', 'lnbc1c'].map((inv) =>
        POST(createMockRequest(true, { payout_invoice: inv }), { params: Promise.resolve({ postId: 'test-post-id' }) })
      ))
      expect(responses.filter((r) => r.status === 200)).toHaveLength(1)
      expect(lightning.payInvoice).toHaveBeenCalledTimes(1)
    })

    it('refuses to pay while an earlier payout is locked (uncertain outcome)', async () => {
      mockL402Success()
      mockPostData({ anonymous_reward_payment_lock: 'earlier-attempt' })
      const lightning = await import('@/lib/lightning')

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const response = await POST(createMockRequest(true, { payout_invoice: 'lnbc1x' }), { params: Promise.resolve({ postId: 'test-post-id' }) })
      expect(response.status).toBe(409)
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })

    it('refuses when the reward was already credited to an account', async () => {
      mockL402Success()
      mockPostData({ reward_paid_at: '2026-11-08T13:00:00Z' })
      const lightning = await import('@/lib/lightning')

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const response = await POST(createMockRequest(true, { payout_invoice: 'lnbc1x' }), { params: Promise.resolve({ postId: 'test-post-id' }) })
      expect(response.status).toBe(409)
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })

    it('refuses an unfunded post', async () => {
      mockL402Success()
      mockPostData({ funding_status: null })
      const lightning = await import('@/lib/lightning')

      const { POST } = await import('@/app/api/fixes/[postId]/claim/route')
      const response = await POST(createMockRequest(true, { payout_invoice: 'lnbc1x' }), { params: Promise.resolve({ postId: 'test-post-id' }) })
      expect(response.status).toBe(409)
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })
  })
})
