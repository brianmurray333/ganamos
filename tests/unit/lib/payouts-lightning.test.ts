/**
 * payAnonymousRewardViaLightning: the single Lightning payout path for
 * anonymous / agent rewards. Must pay a funded, approved reward at most once,
 * for exactly the reward, and never release its lock after money may have moved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from '@/tests/helpers/fake-supabase'

vi.mock('@/lib/lightning', () => ({ payInvoice: vi.fn() }))
vi.mock('@/lib/lightning-validation', () => ({
  validateLightningInvoice: vi.fn((inv: string) => typeof inv === 'string' && inv.startsWith('lnbc')),
  extractInvoiceAmount: vi.fn(),
  isAmountlessInvoice: vi.fn(() => false),
}))
vi.mock('@/lib/security-alerts', () => ({ sendRewardOnHoldAlert: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/verify-fix', () => ({ AUTO_APPROVE_CONFIDENCE: 8, verifyFixImages: vi.fn() }))

import { payInvoice } from '@/lib/lightning'
import { extractInvoiceAmount } from '@/lib/lightning-validation'
import { sendRewardOnHoldAlert } from '@/lib/security-alerts'
import { payAnonymousRewardViaLightning, isPostFundingInvoiceMemo } from '@/lib/payouts'

const POST_ID = 'post-1'
const INVOICE = 'lnbc10u1testinvoice'

function seed(overrides: Record<string, any> = {}) {
  return new FakeDb({
    posts: [{
      id: POST_ID,
      user_id: null,
      reward: 1000,
      title: 'Agent job',
      fixed: true,
      fixed_by: null,
      fixed_by_is_anonymous: true,
      deleted_at: null,
      reward_paid_at: null,
      anonymous_reward_paid_at: null,
      anonymous_reward_payment_lock: null,
      funding_status: 'paid',
      funding_r_hash: 'a'.repeat(64),
      created_at: '2026-11-08T12:00:00Z',
      ...overrides,
    }],
    transactions: [],
    activities: [],
  })
}

const pay = (db: FakeDb, target = INVOICE, extra: Record<string, any> = {}) =>
  payAnonymousRewardViaLightning(db.client(), { postId: POST_ID, target, source: 'test', ...extra })

describe('payAnonymousRewardViaLightning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LND_REST_URL = 'https://lnd.test'
    process.env.LND_ADMIN_MACAROON = 'abcd'
    vi.mocked(extractInvoiceAmount).mockReturnValue(1000)
    vi.mocked(payInvoice).mockResolvedValue({ success: true, paymentHash: 'hash-1' } as any)
  })

  it('pays the stored reward once and records it', async () => {
    const db = seed()
    const result = await pay(db)
    expect(result).toMatchObject({ success: true, paymentHash: 'hash-1', amount: 1000 })
    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(db.row('posts', POST_ID)!.anonymous_reward_paid_at).toBeTruthy()
    expect(db.table('transactions')).toHaveLength(1)
  })

  it('concurrent requests pay at most once', async () => {
    const db = seed()
    const results = await Promise.all([pay(db), pay(db), pay(db)])
    expect(results.filter((r) => r.success)).toHaveLength(1)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('a second request after a successful payout is refused', async () => {
    const db = seed()
    await pay(db)
    const again = await pay(db, 'lnbc10u1another')
    expect(again.success).toBe(false)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('keeps the lock and alerts the admin when the outcome is uncertain', async () => {
    const db = seed()
    vi.mocked(payInvoice).mockResolvedValueOnce({ success: false, error: 'timeout' } as any)
    const first = await pay(db)
    expect(first).toMatchObject({ success: false, code: 'on_hold' })
    expect(db.row('posts', POST_ID)!.anonymous_reward_payment_lock).toBeTruthy()
    expect(sendRewardOnHoldAlert).toHaveBeenCalledTimes(1)

    const retry = await pay(db, 'lnbc10u1retry')
    expect(retry.success).toBe(false)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('releases the lock after a definitive payment_error so the fixer can retry', async () => {
    const db = seed()
    vi.mocked(payInvoice).mockResolvedValueOnce({ success: false, error: 'no route', details: { payment_error: 'no route' } } as any)
    const first = await pay(db)
    expect(first).toMatchObject({ success: false, code: 'payment_failed' })
    expect(db.row('posts', POST_ID)!.anonymous_reward_payment_lock).toBeNull()

    const retry = await pay(db, 'lnbc10u1retry')
    expect(retry.success).toBe(true)
    expect(payInvoice).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['more than the reward', 100_000],
    ['less than the reward', 500],
    ['no amount', null],
  ])('refuses an invoice for %s without paying', async (_label, amount) => {
    const db = seed()
    vi.mocked(extractInvoiceAmount).mockReturnValue(amount as any)
    const result = await pay(db)
    expect(result).toMatchObject({ success: false, code: 'invalid_invoice' })
    expect(payInvoice).not.toHaveBeenCalled()
    expect(db.row('posts', POST_ID)!.anonymous_reward_payment_lock).toBeNull()
  })

  it.each([
    ['unfunded', { funding_status: null }],
    ['not approved', { fixed: false }],
    ['fixed by a registered user', { fixed_by: 'user-9' }],
    ['already credited internally', { reward_paid_at: '2026-11-08T13:00:00Z' }],
    ['deleted', { deleted_at: '2026-11-08T13:00:00Z' }],
    ['locked by another payout', { anonymous_reward_payment_lock: 'other-lock' }],
  ])('refuses a post that is %s', async (_label, overrides) => {
    const db = seed(overrides)
    const result = await pay(db)
    expect(result.success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
  })

  it('does not lock or pay when the node is not configured', async () => {
    const db = seed()
    delete process.env.LND_REST_URL
    const result = await pay(db)
    expect(result).toMatchObject({ success: false, code: 'not_available' })
    expect(db.row('posts', POST_ID)!.anonymous_reward_payment_lock).toBeNull()
    expect(payInvoice).not.toHaveBeenCalled()
    expect(sendRewardOnHoldAlert).not.toHaveBeenCalled()
  })

  it('requireAnonymousFixer refuses posts not marked as anonymously fixed', async () => {
    const db = seed({ fixed_by_is_anonymous: false })
    const result = await pay(db, INVOICE, { requireAnonymousFixer: true })
    expect(result.success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
  })
})

describe('isPostFundingInvoiceMemo', () => {
  it('accepts post-funding and agent-post invoices', () => {
    expect(isPostFundingInvoiceMemo('Fund anonymous post on Ganamos! (1000 sats)')).toBe(true)
    expect(isPostFundingInvoiceMemo('Pay 1010 sats to post job on Ganamos (1000 reward + 10 API fee)')).toBe(true)
  })

  it('rejects every other node invoice', () => {
    expect(isPostFundingInvoiceMemo('Deposit 1000 sats to Ganamos!')).toBe(false)
    expect(isPostFundingInvoiceMemo('Pay 10 sat to submit a fix on Ganamos')).toBe(false)
    expect(isPostFundingInvoiceMemo('Donation to Somewhere (1000 sats)')).toBe(false)
    expect(isPostFundingInvoiceMemo(null)).toBe(false)
    expect(isPostFundingInvoiceMemo('')).toBe(false)
  })
})

describe('isPostRewardFunded: post_funding_overrides', () => {
  const owned = (extra: Record<string, any> = {}) => new FakeDb({
    // Legacy post: created before funding links, no funding link
    posts: [{ id: POST_ID, user_id: 'owner-1', reward: 1000, created_at: '2026-10-01T12:00:00Z', funding_transaction_id: null, ...extra }],
    transactions: [],
  })

  it('counts a server-side override that covers the reward', async () => {
    const { isPostRewardFunded } = await import('@/lib/payouts')
    const db = owned()
    db.table('post_funding_overrides').push({ post_id: POST_ID, amount: 1000 })
    expect(await isPostRewardFunded(db.client(), { id: POST_ID })).toBe(true)
  })

  it('ignores an override smaller than the reward', async () => {
    const { isPostRewardFunded } = await import('@/lib/payouts')
    const db = owned()
    db.table('post_funding_overrides').push({ post_id: POST_ID, amount: 999 })
    expect(await isPostRewardFunded(db.client(), { id: POST_ID })).toBe(false)
  })

  it('does not let an override fund a post created after funding links existed', async () => {
    const { isPostRewardFunded } = await import('@/lib/payouts')
    const db = owned({ created_at: '2026-11-09T12:00:00Z' })
    db.table('post_funding_overrides').push({ post_id: POST_ID, amount: 1000 })
    expect(await isPostRewardFunded(db.client(), { id: POST_ID })).toBe(false)
  })

  it('is false with no override and no funding record', async () => {
    const { isPostRewardFunded } = await import('@/lib/payouts')
    expect(await isPostRewardFunded(owned().client(), { id: POST_ID })).toBe(false)
  })
})
