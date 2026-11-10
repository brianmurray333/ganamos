import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeDb } from '@/tests/helpers/fake-supabase'

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
  extractInvoiceAmount: vi.fn().mockReturnValue(null),
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
import * as lightning from '@/lib/lightning'
import * as validation from '@/lib/lightning-validation'

const MOCK_PAYMENT_HASH = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
const POST_ID = 'test-post-id'

function createMockRequest(withAuth = true) {
  const headers = new Headers()
  if (withAuth) {
    headers.set('Authorization', 'L402 mock-macaroon:mock-preimage')
  }
  return new NextRequest(`http://localhost:3000/api/posts/${POST_ID}/approve`, {
    method: 'POST',
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

/** An ownerless agent post (funded via its L402 invoice) with a fix under review. */
function mockPostData(overrides: Record<string, unknown> = {}) {
  state.db = new FakeDb({
    posts: [{
      id: POST_ID,
      user_id: null,
      reward: 1000,
      title: 'Agent job',
      fixed: false,
      fixed_by: null,
      fixed_by_is_anonymous: false,
      under_review: true,
      deleted_at: null,
      reward_paid_at: null,
      anonymous_reward_paid_at: null,
      anonymous_reward_payment_lock: null,
      submitted_fix_by_id: null,
      submitted_fix_at: '2026-03-04T12:00:00Z',
      submitted_fix_by_name: 'Agent Fixer',
      submitted_fix_proof_text: 'https://example.com/proof',
      submitted_fix_image_url: null,
      submitted_fix_note: 'Fixed the issue',
      submitted_fix_payout_invoice: null,
      submitted_fix_lightning_address: null,
      funding_status: 'paid',
      funding_r_hash: MOCK_PAYMENT_HASH,
      created_at: '2026-11-08T12:00:00Z',
      ...overrides,
    }],
    transactions: [],
    activities: [],
    profiles: [],
  })
}

const params = { params: Promise.resolve({ id: POST_ID }) }

async function approve() {
  const { POST } = await import('@/app/api/posts/[id]/approve/route')
  const response = await POST(createMockRequest(true), params)
  return { response, data: await response.json() }
}

describe('POST /api/posts/[id]/approve - Poster Approves Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LND_REST_URL = 'https://lnd.test'
    process.env.LND_ADMIN_MACAROON = 'abcd'
    vi.mocked(validation.extractInvoiceAmount).mockReturnValue(null)
    mockPostData()
  })

  describe('Authentication', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const { POST } = await import('@/app/api/posts/[id]/approve/route')
      const response = await POST(createMockRequest(false), params)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('L402 token required')
    })

    it('should return 401 when L402 header is malformed', async () => {
      vi.mocked(l402.parseL402Header).mockReturnValue(null)
      const { response, data } = await approve()
      expect(response.status).toBe(401)
      expect(data.error).toContain('Invalid Authorization header format')
    })

    it('should return 401 when L402 token verification fails', async () => {
      mockL402Failure('Invoice not paid')
      const { response, data } = await approve()
      expect(response.status).toBe(401)
      expect(data.error).toContain('Invoice not paid')
    })

    it('should call verifyL402Token with skipExpiry: true', async () => {
      mockL402Success()
      await approve()
      expect(l402.verifyL402Token).toHaveBeenCalledWith(expect.any(Object), { skipExpiry: true })
    })
  })

  describe('Authorization', () => {
    it('should return 403 when payment hash does not match', async () => {
      mockL402Success('different-payment-hash')
      const { response, data } = await approve()
      expect(response.status).toBe(403)
      expect(data.error).toContain('does not match this post')
    })

    it('should return 403 for a post with no funding hash', async () => {
      mockPostData({ funding_r_hash: null })
      mockL402Success()
      const { response } = await approve()
      expect(response.status).toBe(403)
      expect(state.db.row('posts', POST_ID).fixed).toBe(false)
    })
  })

  describe('Post Not Found', () => {
    it('should return 404 when post does not exist', async () => {
      mockL402Success()
      state.db = new FakeDb({ posts: [] })
      const { response, data } = await approve()
      expect(response.status).toBe(404)
      expect(data.error).toBe('Post not found')
    })
  })

  describe('State Validation', () => {
    it('should return 409 when post is deleted', async () => {
      mockL402Success()
      mockPostData({ deleted_at: '2026-03-04T16:00:00Z' })
      const { response, data } = await approve()
      expect(response.status).toBe(409)
      expect(data.error).toContain('deleted')
    })

    it('should return 409 when fix is already approved', async () => {
      mockL402Success()
      mockPostData({ fixed: true })
      const { response, data } = await approve()
      expect(response.status).toBe(409)
      expect(data.error).toContain('already been approved')
    })

    it('should return 409 when no fix is under review', async () => {
      mockL402Success()
      mockPostData({ under_review: false })
      const { response, data } = await approve()
      expect(response.status).toBe(409)
      expect(data.error).toContain('No fix is currently submitted')
    })

    it('should refuse to approve an unfunded post', async () => {
      mockL402Success()
      mockPostData({ funding_status: null })
      const { response } = await approve()
      expect(response.status).toBe(409)
      expect(state.db.row('posts', POST_ID).fixed).toBe(false)
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })
  })

  describe('Successful Approval', () => {
    it('should approve fix and return success (no payout invoice)', async () => {
      mockL402Success()
      const { response, data } = await approve()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.post_id).toBe(POST_ID)
      expect(data.approved_at).toBeDefined()
      expect(data.reward_paid).toBe(false)
      expect(data.message).toContain('No payout invoice')
      expect(state.db.row('posts', POST_ID)).toMatchObject({ fixed: true, under_review: false, fixed_by_is_anonymous: true })
    })

    it('should approve fix and pay out when the payout invoice is for exactly the reward', async () => {
      mockL402Success()
      mockPostData({ submitted_fix_payout_invoice: 'lnbc10u1exact', reward: 1000 })
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(1000)
      vi.mocked(lightning.payInvoice).mockResolvedValue({ success: true, paymentHash: 'exact-match-hash' } as any)

      const { response, data } = await approve()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reward_paid).toBe(true)
      expect(data.reward_payment_hash).toBe('exact-match-hash')
      expect(data.message).toContain('reward paid')
      expect(state.db.row('posts', POST_ID).anonymous_reward_paid_at).toBeTruthy()
    })

    it('should approve fix but report payout failure gracefully', async () => {
      mockL402Success()
      mockPostData({ submitted_fix_payout_invoice: 'lnbc10u1test' })
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(1000)
      vi.mocked(lightning.payInvoice).mockResolvedValue({
        success: false,
        error: 'Payment failed: no route',
        details: { payment_error: 'no route' },
      } as any)

      const { response, data } = await approve()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reward_paid).toBe(false)
      expect(data.message).toContain('payout failed')
      // Definitive failure: the fixer can claim later with a new invoice
      expect(state.db.row('posts', POST_ID).anonymous_reward_payment_lock).toBeNull()
    })

    it.each([
      ['exceeds', 100_000],
      ['is less than', 500],
    ])('should refuse payout when invoice amount %s the post reward', async (_label, amount) => {
      mockL402Success()
      mockPostData({ submitted_fix_payout_invoice: 'lnbc1m1other', reward: 1000 })
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(amount)

      const { response, data } = await approve()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.reward_paid).toBe(false)
      expect(data.reward_error).toContain('exactly 1000 sats')
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })

    it('should refuse an amountless payout invoice', async () => {
      mockL402Success()
      mockPostData({ submitted_fix_payout_invoice: 'lnbc1noamount' })
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(null)
      const { data } = await approve()
      expect(data.reward_paid).toBe(false)
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })

    it('credits a signed-in submitter to their balance instead of paying over Lightning', async () => {
      mockL402Success()
      mockPostData({ submitted_fix_by_id: 'user-7', submitted_fix_payout_invoice: 'lnbc10u1x' })
      state.db.rpcHandlers.pay_fix_reward = (args: any, db: FakeDb) => {
        db.row('posts', args.p_post_id)!.reward_paid_at = 'now'
        return { data: [{ transaction_id: 'tx-1', amount: 1000, new_balance: 1000 }] }
      }

      const { data } = await approve()

      expect(data.reward_paid).toBe(true)
      expect(state.db.rpcCalls).toEqual([expect.objectContaining({ name: 'pay_fix_reward', args: expect.objectContaining({ p_fixer_id: 'user-7' }) })])
      expect(state.db.row('posts', POST_ID)).toMatchObject({ fixed: true, fixed_by: 'user-7', fixed_by_is_anonymous: false })
      expect(lightning.payInvoice).not.toHaveBeenCalled()
    })
  })

  describe('Double payment protection', () => {
    it('concurrent approvals approve and pay once', async () => {
      mockL402Success()
      mockPostData({ submitted_fix_lightning_address: 'fixer@example.com' })
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(1000)
      vi.mocked(lightning.payInvoice).mockResolvedValue({ success: true, paymentHash: 'h' } as any)
      const fetchMock = vi.fn()
        .mockImplementation(async (url: string) => ({
          ok: true,
          json: async () => (url.includes('.well-known') ? { callback: 'https://example.com/cb' } : { pr: 'lnbc10u1fresh' }),
        }))
      vi.stubGlobal('fetch', fetchMock)

      const { POST } = await import('@/app/api/posts/[id]/approve/route')
      const responses = await Promise.all([1, 2, 3].map(() => POST(createMockRequest(true), { params: Promise.resolve({ id: POST_ID }) })))
      const bodies = await Promise.all(responses.map((r) => r.json()))

      // Exactly one request approves; the others see it already approved
      expect(responses.filter((r) => r.status === 200)).toHaveLength(1)
      expect(responses.filter((r) => r.status === 409)).toHaveLength(2)
      expect(bodies.filter((b) => b.reward_paid === true)).toHaveLength(1)
      expect(lightning.payInvoice).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })

    it('does not pay again when the outcome of the first payout was uncertain', async () => {
      mockL402Success()
      mockPostData({ submitted_fix_payout_invoice: 'lnbc10u1x' })
      vi.mocked(validation.extractInvoiceAmount).mockReturnValue(1000)
      vi.mocked(lightning.payInvoice).mockResolvedValue({ success: false, error: 'timeout' } as any)

      const { data } = await approve()
      expect(data.reward_paid).toBe(false)
      expect(state.db.row('posts', POST_ID).anonymous_reward_payment_lock).toBeTruthy()

      // A later claim / approval can't pay while the lock is held
      const second = await approve()
      expect(second.response.status).toBe(409)
      expect(lightning.payInvoice).toHaveBeenCalledTimes(1)
    })
  })
})
