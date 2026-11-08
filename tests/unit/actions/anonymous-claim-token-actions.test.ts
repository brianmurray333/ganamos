/**
 * Anonymous fixer actions (app/actions/post-actions.ts) and their claim tokens.
 *
 * When an anonymous fix is recorded (markPostFixedAnonymouslyAction /
 * submitAnonymousFixForReviewAction) the server returns a secret claim token and
 * stores only its SHA-256 on the post. Every later action that decides WHERE the
 * reward goes must present that token:
 *   - submitAnonymousFixLightningAddressAction(postId, address, claimToken)
 *   - payAnonymousRewardAction(postId, invoice, claimToken)
 *   - associateAnonymousFixWithAccountAction(postId, userId, claimToken)  (+ signed in as userId)
 *   - claimAnonymousRewardAction(postId, userId, claimToken)              (+ signed in as userId)
 * payAnonymousFixLightningAddressAction(postId) is the owner's approval: owner / group admin
 * only, pays only the address the fixer stored, once.
 *
 * Runs against the stateful fake DB (tests/unit/helpers/fake-supabase-db.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn() })),
}))
vi.mock('@/lib/lightning', () => ({ createInvoice: vi.fn(), checkInvoice: vi.fn(), payInvoice: vi.fn() }))
// Test invoices: "lnbc_<sats>_<id>" carries an amount, "lnbc_noamount_<id>" doesn't.
vi.mock('@/lib/lightning-validation', () => {
  const extractInvoiceAmount = (inv: string) => {
    const m = /^lnbc_(\d+)_/.exec(inv)
    return m ? Number(m[1]) : null
  }
  return {
    validateLightningInvoice: (inv: string) => typeof inv === 'string' && inv.startsWith('lnbc_'),
    extractInvoiceAmount,
    validateInvoiceAmount: (inv: string, expected: number) => {
      const a = extractInvoiceAmount(inv)
      return a === null || Math.abs(a - expected) <= 1
    },
  }
})
vi.mock('@/lib/verify-fix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/verify-fix')>()),
  verifyFixImages: vi.fn(),
}))
vi.mock('@/lib/transaction-emails', () => ({
  sendIssueFixedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendRewardEarnedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendFixSubmittedForReviewEmail: vi.fn().mockResolvedValue({ success: true }),
  sendGroupAdminClosedIssueEmail: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/lib/safety-caps', () => ({
  checkBalanceCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none' }),
  checkPostRewardCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none' }),
  checkLivePostsCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none' }),
}))
vi.mock('@/lib/sms-alerts', () => ({ alertLargePostBounty: vi.fn() }))
vi.mock('@/lib/security-alerts', () => ({ sendRewardOnHoldAlert: vi.fn().mockResolvedValue(undefined) }))

import {
  submitAnonymousFixLightningAddressAction,
  payAnonymousRewardAction,
  associateAnonymousFixWithAccountAction,
  claimAnonymousRewardAction,
  payAnonymousFixLightningAddressAction,
  markPostFixedAnonymouslyAction,
} from '@/app/actions/post-actions'
import { payInvoice } from '@/lib/lightning'
import { sendRewardOnHoldAlert } from '@/lib/security-alerts'
import { verifyFixImages } from '@/lib/verify-fix'
import { generateClaimToken, hashClaimToken, verifyClaimToken } from '@/lib/payouts'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

const POST_ID = 'anonpost-aaaa-bbbb-cccc-000000000001'
const OTHER_POST_ID = 'otherpst-aaaa-bbbb-cccc-000000000002'
const OWNER_ID = 'owner-1'
const NEW_USER_ID = 'new-user-1'
const ATTACKER_ID = 'attacker-1'
const GROUP_ADMIN_ID = 'group-admin-1'
const GROUP_ID = 'group-1'
const REWARD = 5000

const { token: TOKEN, hash: TOKEN_HASH } = generateClaimToken()
const { token: OTHER_TOKEN, hash: OTHER_TOKEN_HASH } = generateClaimToken()
const WRONG_TOKENS: Array<[string, any]> = [
  ['missing', undefined],
  ['null', null],
  ['empty', ''],
  ['wrong', 'f'.repeat(64)],
  ['the stored hash itself', TOKEN_HASH],
  ["another post's token", OTHER_TOKEN],
  ['a truncated token', TOKEN.slice(0, 63)],
  ['a non-string', 12345],
]

const INVOICE = `lnbc_${REWARD}_payout`

let db: FakeSupabase
const post = () => db.row('posts', POST_ID)!
const balance = (id: string) => db.row('profiles', id)!.balance

function basePost(overrides: Record<string, any> = {}) {
  return {
    id: POST_ID,
    user_id: OWNER_ID,
    group_id: null,
    title: 'Graffiti on wall',
    reward: REWARD,
    deleted_at: null,
    fixed: false,
    fixed_by: null,
    fixed_by_is_anonymous: false,
    under_review: false,
    submitted_fix_by_id: null,
    submitted_fix_lightning_address: null,
    reward_paid_at: null,
    anonymous_reward_paid_at: null,
    anonymous_reward_payment_lock: null,
    anonymous_claim_token_hash: TOKEN_HASH,
    funding_transaction_id: 'funding',
    ...overrides,
  }
}
/** Anonymous fix auto-approved (fixed), reward not yet paid */
const fixedAnonymously = (o: Record<string, any> = {}) => basePost({ fixed: true, fixed_by_is_anonymous: true, ...o })
/** Anonymous fix awaiting the owner's review */
const underReview = (o: Record<string, any> = {}) => basePost({ under_review: true, submitted_fix_image_url: 'https://x/after.jpg', ...o })

function setup(postRow: Record<string, any>, signedInAs: string | null = null) {
  db = createFakeSupabase({
    posts: [postRow, basePost({ id: OTHER_POST_ID, funding_transaction_id: null, anonymous_claim_token_hash: OTHER_TOKEN_HASH, fixed: true, fixed_by_is_anonymous: true })],
    profiles: [
      { id: OWNER_ID, name: 'Owner', email: 'owner@example.com', balance: 100, pet_coins: 0 },
      { id: NEW_USER_ID, name: 'New', email: 'new@example.com', balance: 0, pet_coins: 0, fixed_issues_count: 0 },
      { id: ATTACKER_ID, name: 'Mallory', email: 'm@example.com', balance: 0, pet_coins: 0, fixed_issues_count: 0 },
      { id: GROUP_ADMIN_ID, name: 'Admin', email: 'admin@example.com', balance: 0, pet_coins: 0 },
    ],
    transactions: [
      { id: 'funding', user_id: OWNER_ID, type: 'internal', status: 'completed', amount: -REWARD, memo: 'Post reward for: Graffiti on wall' },
    ],
    group_members: [{ group_id: GROUP_ID, user_id: GROUP_ADMIN_ID, role: 'admin', status: 'approved' }],
    activities: [],
  }).install()
  db.user = signedInAs ? { id: signedInAs } : null
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.LND_REST_URL = 'https://lnd.test'
  process.env.LND_ADMIN_MACAROON = 'macaroon'
  vi.mocked(payInvoice).mockResolvedValue({ success: true, paymentHash: 'payhash-1' } as any)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ============================================================================
describe('claim token primitives (lib/payouts)', () => {
  it('stores a 64-hex SHA-256 of a 64-hex random token, and verifies only the right token', () => {
    const { token, hash } = generateClaimToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashClaimToken(token))
    expect(hash).not.toBe(token)
    expect(verifyClaimToken(hash, token)).toBe(true)
    expect(verifyClaimToken(hash, hash)).toBe(false)
    expect(verifyClaimToken(hash, token.toUpperCase())).toBe(false)
    expect(verifyClaimToken(null, token)).toBe(false)
    expect(verifyClaimToken(undefined, token)).toBe(false)
    expect(verifyClaimToken('', '')).toBe(false)
    expect(verifyClaimToken('not-hex', token)).toBe(false)
  })
})

// ============================================================================
describe('submitAnonymousFixLightningAddressAction', () => {
  const ADDRESS = 'fixer@getalby.com'

  it('saves the payout address with the right claim token', async () => {
    setup(underReview())

    expect(await submitAnonymousFixLightningAddressAction(POST_ID, ADDRESS, TOKEN)).toEqual({ success: true })
    expect(post().submitted_fix_lightning_address).toBe(ADDRESS)
  })

  it.each(WRONG_TOKENS)('rejects a %s claim token and leaves the address unchanged', async (_label, token) => {
    setup(underReview({ submitted_fix_lightning_address: 'real-fixer@wallet.com' }))

    const result = await submitAnonymousFixLightningAddressAction(POST_ID, 'attacker@evil.com', token)

    expect(result).toEqual({ success: false, error: 'Only the person who submitted this fix can set the payout address.' })
    expect(post().submitted_fix_lightning_address).toBe('real-fixer@wallet.com')
    expect(db.ops(o => o.op === 'update')).toHaveLength(0)
  })

  it('rejects any token for a post that has no claim token hash', async () => {
    setup(underReview({ anonymous_claim_token_hash: null }))

    expect((await submitAnonymousFixLightningAddressAction(POST_ID, ADDRESS, TOKEN)).success).toBe(false)
    expect(post().submitted_fix_lightning_address).toBeNull()
  })

  it('still requires the post to be an anonymous submission under review', async () => {
    setup(underReview({ under_review: false }))
    expect(await submitAnonymousFixLightningAddressAction(POST_ID, ADDRESS, TOKEN)).toEqual({ success: false, error: 'This post is not under review.' })

    setup(underReview({ submitted_fix_by_id: NEW_USER_ID }))
    expect(await submitAnonymousFixLightningAddressAction(POST_ID, ADDRESS, TOKEN)).toEqual({ success: false, error: 'This fix submission is not anonymous.' })
  })

  it('rejects an invalid address format', async () => {
    setup(underReview())

    expect((await submitAnonymousFixLightningAddressAction(POST_ID, 'not an address', TOKEN)).success).toBe(false)
    expect(post().submitted_fix_lightning_address).toBeNull()
  })
})

// ============================================================================
describe('payAnonymousRewardAction', () => {
  it('pays the invoice with the right claim token and marks the reward paid', async () => {
    setup(fixedAnonymously())

    const result = await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)

    expect(result).toEqual({ success: true, paymentHash: 'payhash-1' })
    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(payInvoice).toHaveBeenCalledWith(INVOICE)
    expect(post().anonymous_reward_paid_at).toBeTruthy()
    expect(post().anonymous_reward_payment_hash).toBe('payhash-1')
    expect(db.rows('transactions', t => t.memo?.includes('Anonymous fix reward payout'))).toEqual([
      expect.objectContaining({ amount: REWARD, type: 'internal', status: 'completed' }),
    ])
  })

  it.each(WRONG_TOKENS)('rejects a %s claim token without paying or locking', async (_label, token) => {
    setup(fixedAnonymously())

    const result = await payAnonymousRewardAction(POST_ID, INVOICE, token)

    expect(result).toEqual({ success: false, error: 'This reward can only be claimed from the device that submitted the fix.' })
    expect(payInvoice).not.toHaveBeenCalled()
    expect(post().anonymous_reward_payment_lock).toBeNull()
    expect(post().anonymous_reward_paid_at).toBeNull()
  })

  it('pays once: a replay with the same token is refused', async () => {
    setup(fixedAnonymously())

    await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)
    const replay = await payAnonymousRewardAction(POST_ID, `lnbc_${REWARD}_second`, TOKEN)

    expect(replay.success).toBe(false)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('pays once when two requests race', async () => {
    setup(fixedAnonymously())
    db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

    const results = await Promise.all([
      payAnonymousRewardAction(POST_ID, `lnbc_${REWARD}_a`, TOKEN),
      payAnonymousRewardAction(POST_ID, `lnbc_${REWARD}_b`, TOKEN),
    ])

    expect(results.filter(r => r.success)).toHaveLength(1)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('refuses a reward already credited to an account (reward_paid_at)', async () => {
    setup(fixedAnonymously({ reward_paid_at: '2026-01-01T00:00:00Z' }))

    expect((await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)).success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
  })

  it('refuses an invoice for a different amount, and releases the lock', async () => {
    setup(fixedAnonymously())

    const result = await payAnonymousRewardAction(POST_ID, 'lnbc_999999_greedy', TOKEN)

    expect(result.success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
    expect(post().anonymous_reward_payment_lock).toBeNull()
  })

  it('releases the lock when LND definitively fails the payment, so the fixer can retry', async () => {
    setup(fixedAnonymously())
    vi.mocked(payInvoice).mockResolvedValueOnce({
      success: false, error: 'Payment failed: no route', details: { payment_error: 'no route' },
    } as any)

    expect((await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)).success).toBe(false)
    expect(post().anonymous_reward_payment_lock).toBeNull()
    expect(post().anonymous_reward_paid_at).toBeNull()

    expect((await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)).success).toBe(true)
    expect(payInvoice).toHaveBeenCalledTimes(2)
  })

  it('keeps the lock when the payment outcome is uncertain, so a retry cannot pay twice', async () => {
    setup(fixedAnonymously())
    // e.g. HTTP timeout / lost response: LND may have sent the payment
    vi.mocked(payInvoice).mockResolvedValueOnce({ success: false, error: 'Request timed out' } as any)

    const first = await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)
    expect(first.success).toBe(false)
    expect(first.error).toMatch(/on hold/)
    expect(post().anonymous_reward_payment_lock).not.toBeNull()

    expect((await payAnonymousRewardAction(POST_ID, 'lnbc_fresh_invoice', TOKEN)).success).toBe(false)
    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledTimes(1)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledWith(expect.objectContaining({ postId: POST_ID, amount: REWARD, reason: 'payment_uncertain' }))
  })

  it('emails the admin with the payment hash if recording a sent payment throws', async () => {
    setup(fixedAnonymously())
    db.beforeOp = op => {
      if (op.table === 'posts' && op.op === 'update' && op.payload?.anonymous_reward_paid_at) throw new Error('connection reset')
    }

    expect((await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)).success).toBe(false)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledTimes(1)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledWith(expect.objectContaining({ postId: POST_ID, reason: 'paid_but_not_recorded', paymentHash: 'payhash-1' }))
  })

  it('does not alert on a normal payout', async () => {
    setup(fixedAnonymously())
    expect((await payAnonymousRewardAction(POST_ID, INVOICE, TOKEN)).success).toBe(true)
    expect(sendRewardOnHoldAlert).not.toHaveBeenCalled()
  })
})

// ============================================================================
describe('associateAnonymousFixWithAccountAction', () => {
  it('links the fix to the signed-in account with the right claim token', async () => {
    setup(underReview(), NEW_USER_ID)

    expect(await associateAnonymousFixWithAccountAction(POST_ID, NEW_USER_ID, TOKEN)).toEqual({ success: true })
    expect(post().submitted_fix_by_id).toBe(NEW_USER_ID)
  })

  it.each(WRONG_TOKENS)('rejects a %s claim token', async (_label, token) => {
    setup(underReview(), ATTACKER_ID)

    const result = await associateAnonymousFixWithAccountAction(POST_ID, ATTACKER_ID, token)

    expect(result.success).toBe(false)
    expect(post().submitted_fix_by_id).toBeNull()
  })

  it('rejects when not signed in, even with the right token', async () => {
    setup(underReview(), null)

    expect(await associateAnonymousFixWithAccountAction(POST_ID, NEW_USER_ID, TOKEN)).toEqual({ success: false, error: 'Not authenticated' })
    expect(post().submitted_fix_by_id).toBeNull()
  })

  it('rejects linking to an account other than the signed-in one, even with the right token', async () => {
    setup(underReview(), ATTACKER_ID)

    expect(await associateAnonymousFixWithAccountAction(POST_ID, NEW_USER_ID, TOKEN)).toEqual({ success: false, error: 'Not authenticated' })
    expect(post().submitted_fix_by_id).toBeNull()
  })

  it('cannot re-link a fix that is already associated', async () => {
    setup(underReview({ submitted_fix_by_id: NEW_USER_ID }), ATTACKER_ID)

    expect((await associateAnonymousFixWithAccountAction(POST_ID, ATTACKER_ID, TOKEN)).success).toBe(false)
    expect(post().submitted_fix_by_id).toBe(NEW_USER_ID)
  })
})

// ============================================================================
describe('claimAnonymousRewardAction', () => {
  it('credits the stored reward to the signed-in account once, via pay_fix_reward', async () => {
    setup(fixedAnonymously(), NEW_USER_ID)

    const result = await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)

    expect(result).toEqual({ success: true, amount: REWARD })
    expect(balance(NEW_USER_ID)).toBe(REWARD)
    expect(post()).toMatchObject({ fixed_by: NEW_USER_ID, fixed_by_is_anonymous: false, reward_paid_to: NEW_USER_ID })
    expect(db.ops(o => o.op === 'rpc' && o.table === 'pay_fix_reward')).toEqual([
      expect.objectContaining({ role: 'admin', payload: expect.objectContaining({ p_post_id: POST_ID, p_fixer_id: NEW_USER_ID }) }),
    ])
  })

  it.each(WRONG_TOKENS)('rejects a %s claim token and credits nothing', async (_label, token) => {
    setup(fixedAnonymously(), ATTACKER_ID)

    const result = await claimAnonymousRewardAction(POST_ID, ATTACKER_ID, token)

    expect(result.success).toBe(false)
    expect(balance(ATTACKER_ID)).toBe(0)
    expect(post()).toMatchObject({ fixed_by: null, fixed_by_is_anonymous: true })
    expect(db.ops(o => o.op === 'rpc')).toHaveLength(0)
  })

  it('rejects when not signed in, or signed in as someone else, even with the right token', async () => {
    setup(fixedAnonymously(), null)
    expect(await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)).toEqual({ success: false, error: 'Not authenticated' })

    setup(fixedAnonymously(), ATTACKER_ID)
    expect(await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)).toEqual({ success: false, error: 'Not authenticated' })
    expect(balance(NEW_USER_ID)).toBe(0)
    expect(db.ops(o => o.op === 'rpc')).toHaveLength(0)
  })

  it("does not accept a token issued for another post", async () => {
    setup(fixedAnonymously(), NEW_USER_ID)

    expect((await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, OTHER_TOKEN)).success).toBe(false)
    expect(balance(NEW_USER_ID)).toBe(0)
  })

  it('pays once: a replay is refused', async () => {
    setup(fixedAnonymously(), NEW_USER_ID)

    await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)
    const replay = await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)

    expect(replay.success).toBe(false)
    expect(balance(NEW_USER_ID)).toBe(REWARD)
  })

  it('pays once when two claims race', async () => {
    setup(fixedAnonymously(), NEW_USER_ID)
    db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

    const results = await Promise.all([
      claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN),
      claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN),
    ])

    expect(results.filter(r => r.success)).toHaveLength(1)
    expect(balance(NEW_USER_ID)).toBe(REWARD)
    expect(db.rows('transactions', t => t.amount > 0)).toHaveLength(1)
  })

  it('refuses after the reward was already paid out over Lightning', async () => {
    setup(fixedAnonymously({ anonymous_reward_paid_at: '2026-01-01T00:00:00Z' }), NEW_USER_ID)

    expect((await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)).success).toBe(false)
    expect(balance(NEW_USER_ID)).toBe(0)
  })

  it('refuses while a Lightning payout holds the lock', async () => {
    setup(fixedAnonymously({ anonymous_reward_payment_lock: 'lock-1' }), NEW_USER_ID)

    expect((await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)).success).toBe(false)
    expect(balance(NEW_USER_ID)).toBe(0)
  })

  it('restores the anonymous state if the payout fails', async () => {
    setup(fixedAnonymously(), NEW_USER_ID)
    db.failOp = op => (op.op === 'rpc' ? { message: 'db down' } : null)

    expect(await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)).toEqual({ success: false, error: 'Failed to credit reward' })
    expect(post()).toMatchObject({ fixed_by: null, fixed_by_is_anonymous: true })
    expect(balance(NEW_USER_ID)).toBe(0)
  })
})

// ============================================================================
describe('end-to-end: token from markPostFixedAnonymouslyAction', () => {
  it('only the token returned to the fixer can claim the reward', async () => {
    setup(basePost({ anonymous_claim_token_hash: null, image_url: 'https://x/before.jpg' }), NEW_USER_ID)
    vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 9, reasoning: 'fixed' })

    const marked = await markPostFixedAnonymouslyAction(POST_ID, 'https://x/after.jpg', null)
    expect(marked.success).toBe(true)

    expect((await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, TOKEN)).success).toBe(false)
    expect((await claimAnonymousRewardAction(POST_ID, NEW_USER_ID, marked.claimToken)).success).toBe(true)
    expect(balance(NEW_USER_ID)).toBe(REWARD)
  })
})

// ============================================================================
describe('payAnonymousFixLightningAddressAction (owner approves an anonymous fix)', () => {
  const STORED = `lnbc_${REWARD}_fixer_stored`
  const withAddress = (o: Record<string, any> = {}) => underReview({ submitted_fix_lightning_address: STORED, ...o })

  it('pays the stored address once and marks the post fixed and paid', async () => {
    setup(withAddress(), OWNER_ID)

    const result = await payAnonymousFixLightningAddressAction(POST_ID)

    expect(result).toEqual({ success: true, paymentHash: 'payhash-1' })
    expect(payInvoice).toHaveBeenCalledWith(STORED)
    expect(post()).toMatchObject({ fixed: true, fixed_by: null, fixed_by_is_anonymous: true, under_review: false, anonymous_reward_payment_hash: 'payhash-1' })
    expect(post().anonymous_reward_paid_at).toBeTruthy()
  })

  it('ignores a caller-supplied address and pays only the one the fixer stored', async () => {
    setup(withAddress(), OWNER_ID)

    await payAnonymousFixLightningAddressAction(POST_ID, `lnbc_${REWARD}_attacker`)

    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(payInvoice).toHaveBeenCalledWith(STORED)
  })

  it.each([
    ['signed out', null],
    ['a stranger', ATTACKER_ID],
    ['the anonymous fixer account itself', NEW_USER_ID],
  ])('rejects %s', async (_label, who) => {
    setup(withAddress(), who)

    const result = await payAnonymousFixLightningAddressAction(POST_ID)

    expect(result.success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
    expect(post().fixed).toBe(false)
  })

  it('allows an approved group admin', async () => {
    setup(withAddress({ group_id: GROUP_ID }), GROUP_ADMIN_ID)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(true)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('refuses an unfunded post', async () => {
    setup(withAddress(), OWNER_ID)
    db.tables.transactions = []

    const result = await payAnonymousFixLightningAddressAction(POST_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/never funded/)
    expect(payInvoice).not.toHaveBeenCalled()
  })

  it.each([
    ['already paid over Lightning', { anonymous_reward_paid_at: '2026-01-01T00:00:00Z' }],
    ['already credited to an account', { reward_paid_at: '2026-01-01T00:00:00Z' }],
    ['currently being paid', { anonymous_reward_payment_lock: 'other-lock' }],
  ])('refuses a reward %s', async (_label, o) => {
    setup(withAddress(o), OWNER_ID)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
  })

  it('refuses a deleted post, a non-anonymous fix, or a missing address', async () => {
    for (const o of [{ deleted_at: '2026-01-01T00:00:00Z' }, { submitted_fix_by_id: NEW_USER_ID }, { submitted_fix_lightning_address: null }]) {
      setup(withAddress(o), OWNER_ID)
      expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    }
    expect(payInvoice).not.toHaveBeenCalled()
  })

  it('rejects an amountless stored invoice (could be paid for any amount) and releases the lock', async () => {
    setup(withAddress({ submitted_fix_lightning_address: 'lnbc_noamount_x' }), OWNER_ID)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
    expect(post().anonymous_reward_payment_lock).toBeNull()
  })

  it('rejects a stored invoice larger than the reward and releases the lock', async () => {
    setup(withAddress({ submitted_fix_lightning_address: `lnbc_${REWARD + 1}_greedy` }), OWNER_ID)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
    expect(post().anonymous_reward_payment_lock).toBeNull()
  })

  it('releases the lock when LND definitively fails the payment, so approval can be retried', async () => {
    setup(withAddress(), OWNER_ID)
    vi.mocked(payInvoice).mockResolvedValueOnce({
      success: false, error: 'Payment failed: no route', details: { payment_error: 'no route' },
    } as any)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(post().anonymous_reward_payment_lock).toBeNull()
    expect(post().fixed).toBe(false)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(true)
  })

  it('keeps the lock when the payment outcome is uncertain, so approval cannot pay twice', async () => {
    setup(withAddress(), OWNER_ID)
    vi.mocked(payInvoice).mockResolvedValueOnce({ success: false, error: 'Request timed out' } as any)

    const first = await payAnonymousFixLightningAddressAction(POST_ID)
    expect(first.success).toBe(false)
    expect(first.error).toMatch(/on hold/)
    expect(post().anonymous_reward_payment_lock).not.toBeNull()

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('pays once when the owner double-clicks approve', async () => {
    setup(withAddress(), OWNER_ID)
    db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

    const results = await Promise.all([payAnonymousFixLightningAddressAction(POST_ID), payAnonymousFixLightningAddressAction(POST_ID)])

    expect(results.filter(r => r.success)).toHaveLength(1)
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('resolves a Lightning address to an invoice for exactly the reward', async () => {
    setup(withAddress({ submitted_fix_lightning_address: 'fixer@wallet.example' }), OWNER_ID)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ callback: 'https://wallet.example/cb' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pr: `lnbc_${REWARD}_from_lnurl` }) })
    vi.stubGlobal('fetch', fetchMock)

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://wallet.example/.well-known/lnurlp/fixer')
    expect(String(fetchMock.mock.calls[1][0])).toContain(`amount=${REWARD * 1000}`)
    expect(payInvoice).toHaveBeenCalledWith(`lnbc_${REWARD}_from_lnurl`)
  })

  // Fixed (was REAL BUG): the lock used to stay set forever when the Lightning-address
  // lookup threw, so the reward could never be paid or claimed.
  it('releases the lock when the Lightning address lookup throws', async () => {
    setup(withAddress({ submitted_fix_lightning_address: 'fixer@wallet.example' }), OWNER_ID)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(payInvoice).not.toHaveBeenCalled()
    expect(post().anonymous_reward_payment_lock).toBeNull()
  })

  it('keeps the lock if the payment call itself throws (the payment may have gone out)', async () => {
    setup(withAddress(), OWNER_ID)
    vi.mocked(payInvoice).mockRejectedValueOnce(new Error('socket hang up'))

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(post().anonymous_reward_payment_lock).toBeTruthy()

    // A retry can't pay a second time
    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledWith(expect.objectContaining({ postId: POST_ID, reason: 'payment_uncertain', paymentHash: null }))
  })

  it('emails the admin with the payment hash if recording a sent payment throws', async () => {
    setup(withAddress(), OWNER_ID)
    db.beforeOp = op => {
      if (op.table === 'posts' && op.op === 'update' && op.payload?.anonymous_reward_paid_at) throw new Error('connection reset')
    }

    expect((await payAnonymousFixLightningAddressAction(POST_ID)).success).toBe(false)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledTimes(1)
    expect(sendRewardOnHoldAlert).toHaveBeenCalledWith(expect.objectContaining({ postId: POST_ID, reason: 'paid_but_not_recorded', paymentHash: 'payhash-1' }))
  })
})
