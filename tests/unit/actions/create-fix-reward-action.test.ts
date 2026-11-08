/**
 * Unit tests for createFixRewardAction (app/actions/post-actions.ts).
 *
 * The action is exported from a "use server" module, so every parameter is
 * attacker-controlled. The server must:
 *  - pay the post's STORED reward (never the client `reward`), exactly once, via
 *    the atomic pay_fix_reward RPC;
 *  - for fixer auto-approval, run its own AI verification against the post's stored
 *    "before" image (never trust the client `aiConfidence`), and atomically claim the post;
 *  - for owner/group-admin approval, pay only the user who actually submitted the fix;
 *  - refuse deleted, already-paid, or unfunded posts.
 *
 * Runs against the stateful fake DB (tests/unit/helpers/fake-supabase-db.ts), whose
 * pay_fix_reward has the same semantics as the SQL function, so assertions are on
 * resulting balances / transactions / paid markers.
 */
import { vi, beforeEach, describe, it, expect } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}))

// Server-side AI verification: controlled per test. Keep the real threshold.
vi.mock('@/lib/verify-fix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/verify-fix')>()),
  verifyFixImages: vi.fn(),
}))

// Side effects of a payout. Mocked so a slow email provider can't turn an
// assertion into a timeout.
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
vi.mock('@/lib/sms-alerts', () => ({ alertLargePostBounty: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/lightning', () => ({ createInvoice: vi.fn(), checkInvoice: vi.fn(), payInvoice: vi.fn() }))

import { createFixRewardAction } from '@/app/actions/post-actions'
import { verifyFixImages } from '@/lib/verify-fix'
import { sendIssueFixedEmail, sendRewardEarnedEmail } from '@/lib/transaction-emails'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

const FIXER_ID = 'fixer-user-1'
const OWNER_ID = 'owner-user-1'
const OTHER_ID = 'other-user-1'
const GROUP_ADMIN_ID = 'group-admin-1'
const CHILD_ID = 'child-account-1'
const POST_ID = 'post4567-aaaa-bbbb-cccc-000000000001'
const GROUP_ID = 'group-1'
const POST_REWARD = 1000
const POST_TITLE = 'Broken streetlight'
const FIX_IMAGE = 'https://example.com/after.jpg'
const BEFORE_IMAGE = 'https://example.com/before.jpg'

const FIXER_START = { balance: 5000, pet_coins: 3000, fixed_issues_count: 5 }

function world(post: Record<string, any> = {}, extra: Record<string, any[]> = {}) {
  return {
    profiles: [
      { id: FIXER_ID, name: 'Fixer', email: 'fixer@example.com', ...FIXER_START },
      { id: OWNER_ID, name: 'Owner', email: 'owner@example.com', balance: 9000, pet_coins: 0, fixed_issues_count: 0 },
      { id: OTHER_ID, name: 'Other', email: 'other@example.com', balance: 0, pet_coins: 0, fixed_issues_count: 0 },
      { id: GROUP_ADMIN_ID, name: 'Admin', email: 'admin@example.com', balance: 0, pet_coins: 0, fixed_issues_count: 0 },
      { id: CHILD_ID, name: 'Child', email: 'child@ganamos.app', balance: 0, pet_coins: 0, fixed_issues_count: 0 },
    ],
    posts: [
      {
        id: POST_ID,
        user_id: OWNER_ID,
        group_id: null,
        title: POST_TITLE,
        description: 'Light is out',
        reward: POST_REWARD,
        image_url: BEFORE_IMAGE,
        fixed: false,
        fixed_by: null,
        under_review: false,
        deleted_at: null,
        reward_paid_at: null,
        anonymous_reward_paid_at: null,
        submitted_fix_by_id: null,
        ...post,
      },
    ],
    // The owner's balance deduction that funded the reward (memo mentions the post)
    transactions: [
      { id: 'funding-tx', user_id: OWNER_ID, type: 'internal', status: 'completed', amount: -POST_REWARD, memo: `Posted issue ${POST_ID.substring(0, 8)}` },
    ],
    connected_accounts: [{ id: 'conn-1', primary_user_id: FIXER_ID, connected_user_id: CHILD_ID }],
    group_members: [{ group_id: GROUP_ID, user_id: GROUP_ADMIN_ID, role: 'admin', status: 'approved' }],
    activities: [],
    ...extra,
  }
}

let db: FakeSupabase
const post = () => db.row('posts', POST_ID)!
const profile = (id: string) => db.row('profiles', id)!
const rewardTxs = () => db.rows('transactions', t => t.type === 'internal' && t.amount > 0)
const payoutRpcs = () => db.ops(o => o.op === 'rpc' && o.table === 'pay_fix_reward')

function setup(postOverrides: Record<string, any> = {}, extra: Record<string, any[]> = {}, signedInAs: string | null = FIXER_ID) {
  db = createFakeSupabase(world(postOverrides, extra)).install()
  db.user = signedInAs ? { id: signedInAs, email: `${signedInAs}@example.com` } : null
  return db
}

const fixDetails = (over: Record<string, any> = {}) => ({ fixImageUrl: FIX_IMAGE, fixerNote: 'Replaced the bulb', ...over })

/** Fixer self-approval call (auto-approval after AI verification) */
const fixerClaims = (over: Record<string, any> = {}) =>
  createFixRewardAction({ postId: POST_ID, userId: FIXER_ID, postTitle: POST_TITLE, fixDetails: fixDetails(), ...over })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 9, reasoning: 'Light now works' })
})

describe('createFixRewardAction', () => {
  // --------------------------------------------------------------------------
  describe('fixer auto-approval: successful payout', () => {
    it('pays the stored reward once, marks the post fixed and returns the new balance', async () => {
      setup()

      const result = await fixerClaims()

      expect(result.success).toBe(true)
      expect(result.newBalance).toBe(FIXER_START.balance + POST_REWARD)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
      expect(rewardTxs()).toHaveLength(1)
      expect(result.transactionId).toBe(rewardTxs()[0].id)
      expect(post()).toMatchObject({ fixed: true, fixed_by: FIXER_ID, reward_paid_to: FIXER_ID, fixed_image_url: FIX_IMAGE })
      expect(post().reward_paid_at).toBeTruthy()
    })

    it('credits pet_coins 1:1 and increments fixed_issues_count', async () => {
      setup()

      await fixerClaims()

      expect(profile(FIXER_ID).pet_coins).toBe(FIXER_START.pet_coins + POST_REWARD)
      expect(profile(FIXER_ID).fixed_issues_count).toBe(FIXER_START.fixed_issues_count + 1)
    })

    it('records a completed internal transaction whose memo names the post title', async () => {
      setup()

      await fixerClaims({ postTitle: undefined })

      expect(rewardTxs()[0]).toMatchObject({
        user_id: FIXER_ID,
        type: 'internal',
        status: 'completed',
        amount: POST_REWARD,
        memo: `Fix reward earned: ${POST_TITLE}`,
      })
    })

    it('uses a fallback memo when the post has no title', async () => {
      setup({ title: null })

      await fixerClaims({ postTitle: undefined })

      expect(rewardTxs()[0].memo).toBe('Fix reward earned: Issue fixed')
    })

    it('pays through the atomic pay_fix_reward RPC with the admin client, and never writes balances directly', async () => {
      setup()

      await fixerClaims()

      expect(payoutRpcs()).toHaveLength(1)
      expect(payoutRpcs()[0]).toMatchObject({ role: 'admin', payload: { p_post_id: POST_ID, p_fixer_id: FIXER_ID } })
      expect(db.ops(o => o.table === 'profiles' && o.op === 'update')).toHaveLength(0)
      expect(db.ops(o => o.table === 'transactions' && o.op === 'insert')).toHaveLength(0)
    })

    it('creates a fix activity for the fixer and a fix_completed activity for the owner', async () => {
      setup()

      const result = await fixerClaims()

      expect(db.rows('activities', a => a.type === 'fix')).toEqual([
        expect.objectContaining({ user_id: FIXER_ID, related_id: POST_ID, metadata: expect.objectContaining({ reward: POST_REWARD, transaction_id: result.transactionId }) }),
      ])
      expect(db.rows('activities', a => a.type === 'fix_completed')).toEqual([
        expect.objectContaining({ user_id: OWNER_ID, related_id: POST_ID }),
      ])
      expect(sendRewardEarnedEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'fixer@example.com', rewardAmount: POST_REWARD }))
      expect(sendIssueFixedEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'owner@example.com', rewardAmount: POST_REWARD }))
    })

    it('still succeeds (payout already done) when activity logging fails', async () => {
      setup()
      db.failOp = op => (op.table === 'activities' ? { message: 'activities down' } : null)

      const result = await fixerClaims()

      expect(result.success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('succeeds without paying anything for a post with no reward', async () => {
      setup({ reward: 0 })

      const result = await fixerClaims({ reward: 500 })

      expect(result).toEqual({ success: true })
      expect(post().fixed).toBe(true)
      expect(payoutRpcs()).toHaveLength(0)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance)
    })
  })

  // --------------------------------------------------------------------------
  describe('payout integrity (client-supplied values are ignored)', () => {
    // Fixed (was REAL BUG): the client-supplied `reward` used to be credited as-is.
    it("does not credit a reward larger than the post's stored reward", async () => {
      setup({ reward: 100 })

      const result = await fixerClaims({ reward: 1_000_000 })

      expect(result.success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + 100)
      expect(rewardTxs().map(t => t.amount)).toEqual([100])
    })

    it.each([0, -500, 1, 99_999_999])('pays the stored reward regardless of client reward %s', async (clientReward) => {
      setup()

      await fixerClaims({ reward: clientReward })

      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('ignores a client aiConfidence of 10 when the server verification scores low', async () => {
      setup()
      vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 3, reasoning: 'Light still out' })

      const result = await fixerClaims({ fixDetails: fixDetails({ aiConfidence: 10, aiAnalysis: 'trust me' }) })

      expect(result).toEqual({ success: false, error: 'AI confidence too low for auto-approval' })
      expect(post().fixed).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance)
    })

    it('approves on server verification even when the client sends a low aiConfidence', async () => {
      setup()
      vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 8, reasoning: 'Fixed' })

      const result = await fixerClaims({ fixDetails: fixDetails({ aiConfidence: 1 }) })

      expect(result.success).toBe(true)
      expect(post()).toMatchObject({ ai_confidence_score: 8, ai_analysis: 'Fixed' })
    })

    it("verifies the fix against the post's stored before-image, not anything from the client", async () => {
      setup()

      await fixerClaims()

      expect(verifyFixImages).toHaveBeenCalledTimes(1)
      expect(verifyFixImages).toHaveBeenCalledWith(expect.objectContaining({ beforeImage: BEFORE_IMAGE, afterImage: FIX_IMAGE }))
    })

    it('accepts confidence exactly at the threshold (7) and rejects 6', async () => {
      setup()
      vi.mocked(verifyFixImages).mockResolvedValueOnce({ confidence: 6, reasoning: '' })
      expect((await fixerClaims()).success).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)

      vi.mocked(verifyFixImages).mockResolvedValueOnce({ confidence: 7, reasoning: '' })
      expect((await fixerClaims()).success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('rejects when the server cannot verify (model error)', async () => {
      setup()
      vi.mocked(verifyFixImages).mockRejectedValue(new Error('groq down'))

      const result = await fixerClaims()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Could not verify/)
      expect(post().fixed).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('rejects when the post has no before-image to verify against', async () => {
      setup({ image_url: null })

      const result = await fixerClaims()

      expect(result.success).toBe(false)
      expect(verifyFixImages).not.toHaveBeenCalled()
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('requires a fix photo for auto-approval', async () => {
      setup()

      const result = await createFixRewardAction({ postId: POST_ID, userId: FIXER_ID, reward: POST_REWARD })

      expect(result).toEqual({ success: false, error: 'A photo of the fix is required for automatic approval' })
      expect(payoutRpcs()).toHaveLength(0)
    })

    // Fixed (was REAL BUG): no check that the post was still unpaid (replay / double payout).
    it('does not pay a reward for a post that is already fixed', async () => {
      setup({ fixed: true, fixed_by: 'someone-else' })

      const result = await fixerClaims()

      expect(result.success).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
      expect(rewardTxs()).toHaveLength(0)
    })

    it('does not pay a reward that was already paid', async () => {
      setup({ reward_paid_at: '2026-01-01T00:00:00Z', reward_paid_to: OTHER_ID })

      const result = await fixerClaims()

      expect(result).toEqual({ success: false, error: 'This reward has already been paid' })
      expect(rewardTxs()).toHaveLength(0)
    })

    it('replaying a successful call pays only once', async () => {
      setup()

      const first = await fixerClaims()
      const second = await fixerClaims()

      expect(first.success).toBe(true)
      expect(second.success).toBe(false)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
      expect(rewardTxs()).toHaveLength(1)
    })

    it('two concurrent fixers on the same post: exactly one is paid', async () => {
      setup()
      // Both requests read the unfixed post before either claims it
      db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

      const [a, b] = await Promise.all([
        fixerClaims(),
        createFixRewardAction({ postId: POST_ID, userId: CHILD_ID, fixDetails: fixDetails() }), // fixer's connected account
      ])

      expect([a.success, b.success].filter(Boolean)).toHaveLength(1)
      expect(rewardTxs()).toHaveLength(1)
      expect(profile(FIXER_ID).balance + profile(CHILD_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('rejects a deleted post', async () => {
      setup({ deleted_at: '2026-01-01T00:00:00Z' })

      const result = await fixerClaims()

      expect(result).toEqual({ success: false, error: 'Post has been deleted' })
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('rejects an unfunded post (no matching funding transaction)', async () => {
      setup({}, { transactions: [] })

      const result = await fixerClaims()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/never funded/)
      expect(post().fixed).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('accepts an ownerless post funded by a verified Lightning invoice', async () => {
      setup({ user_id: null, funding_status: 'paid', funding_r_hash: 'a'.repeat(64) }, { transactions: [] })

      const result = await fixerClaims()

      expect(result.success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('rejects an ownerless post marked paid without a funding invoice hash', async () => {
      setup({ user_id: null, funding_status: 'paid', funding_r_hash: null }, { transactions: [] })

      const result = await fixerClaims()

      expect(result.success).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('reverts its fixed claim when the payout fails (e.g. fixer profile missing)', async () => {
      setup()
      db.tables.profiles = db.tables.profiles.filter(p => p.id !== FIXER_ID)

      const result = await fixerClaims()

      expect(result.success).toBe(false)
      expect(post()).toMatchObject({ fixed: false, fixed_by: null })
      expect(post().reward_paid_at).toBeFalsy()
      expect(rewardTxs()).toHaveLength(0)
    })

    it('reports failure, credits nothing and reverts the claim when the RPC errors', async () => {
      setup()
      db.failOp = op => (op.op === 'rpc' ? { message: 'connection reset' } : null)

      const result = await fixerClaims()

      expect(result).toEqual({ success: false, error: 'Failed to pay reward.' })
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance)
      expect(post().fixed).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  describe('authentication & authorization (fixer path)', () => {
    it('rejects unauthenticated requests', async () => {
      setup({}, {}, null)

      const result = await fixerClaims()

      expect(result).toEqual({ success: false, error: 'Not authenticated' })
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('allows crediting a connected (child) account', async () => {
      setup()

      const result = await createFixRewardAction({ postId: POST_ID, userId: CHILD_ID, fixDetails: fixDetails() })

      expect(result.success).toBe(true)
      expect(profile(CHILD_ID).balance).toBe(POST_REWARD)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance)
    })

    it('rejects crediting another user without a connection', async () => {
      setup()

      const result = await createFixRewardAction({ postId: POST_ID, userId: OTHER_ID, fixDetails: fixDetails() })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SECURITY ALERT'), expect.any(Object))
      expect(profile(OTHER_ID).balance).toBe(0)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it.each([
      ['empty postId', { postId: '' }],
      ['empty userId', { userId: '' }],
    ])('rejects %s', async (_label, over) => {
      setup()

      const result = await fixerClaims(over)

      expect(result).toEqual({ success: false, error: 'Invalid parameters' })
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('rejects an unknown post', async () => {
      setup()

      const result = await fixerClaims({ postId: 'no-such-post' })

      expect(result).toEqual({ success: false, error: 'Post not found' })
    })

    it('returns a string error (not a throw) on unexpected failures', async () => {
      setup()
      vi.mocked(db.sessionClient.auth.getUser).mockRejectedValueOnce(new Error('Unexpected database error'))

      const result = await fixerClaims()

      expect(result).toEqual({ success: false, error: 'Unexpected database error' })
    })
  })

  // --------------------------------------------------------------------------
  describe('owner / group admin approval (isPostOwnerClosing)', () => {
    const ownerApproves = (userId: string, over: Record<string, any> = {}) =>
      createFixRewardAction({ postId: POST_ID, userId, isPostOwnerClosing: true, postTitle: POST_TITLE, ...over })

    const submittedByFixer = {
      under_review: true,
      submitted_fix_by_id: FIXER_ID,
      submitted_fix_image_url: FIX_IMAGE,
      submitted_fix_note: 'Done',
    }

    it('pays the user who submitted the fix and marks the post fixed server-side', async () => {
      setup(submittedByFixer, {}, OWNER_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
      expect(post()).toMatchObject({ fixed: true, fixed_by: FIXER_ID, under_review: false, fixed_image_url: FIX_IMAGE, reward_paid_to: FIXER_ID })
      // The owner decides; no AI verification on this path
      expect(verifyFixImages).not.toHaveBeenCalled()
    })

    // Previously asserted "post owner can transfer reward to any user"; that was the bug.
    it('rejects paying a user who did not submit the fix', async () => {
      setup(submittedByFixer, {}, OWNER_ID)

      const result = await ownerApproves(OTHER_ID)

      expect(result).toEqual({ success: false, error: 'This user did not submit the fix for this post' })
      expect(profile(OTHER_ID).balance).toBe(0)
      expect(post().fixed).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('rejects paying anyone (e.g. the owner themselves) when no fix was submitted', async () => {
      setup({}, {}, OWNER_ID)

      const result = await ownerApproves(OWNER_ID)

      expect(result.success).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
      expect(profile(OWNER_ID).balance).toBe(9000)
    })

    // Fixed (was REAL BUG): the owner path only checked ownership and paid any `reward`.
    it("does not let a post owner pay out more than the post's stored reward", async () => {
      setup(submittedByFixer, {}, OWNER_ID)

      await ownerApproves(FIXER_ID, { reward: 1_000_000 })

      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
      expect(rewardTxs().map(t => t.amount)).toEqual([POST_REWARD])
    })

    it('rejects a non-owner, non-admin caller', async () => {
      setup(submittedByFixer, {}, OTHER_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Unauthorized/)
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SECURITY ALERT'), expect.any(Object))
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('rejects the fixer approving their own submission', async () => {
      setup(submittedByFixer, {}, FIXER_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('allows an approved admin of the post group', async () => {
      setup({ ...submittedByFixer, group_id: GROUP_ID }, {}, GROUP_ADMIN_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('rejects a group admin whose membership is not approved', async () => {
      setup({ ...submittedByFixer, group_id: GROUP_ID }, {
        group_members: [{ group_id: GROUP_ID, user_id: GROUP_ADMIN_ID, role: 'admin', status: 'pending' }],
      }, GROUP_ADMIN_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('rejects an unfunded post', async () => {
      setup(submittedByFixer, { transactions: [] }, OWNER_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/never funded/)
      expect(post().fixed).toBe(false)
      expect(payoutRpcs()).toHaveLength(0)
    })

    it('approving twice pays once', async () => {
      setup(submittedByFixer, {}, OWNER_ID)

      const first = await ownerApproves(FIXER_ID)
      const second = await ownerApproves(FIXER_ID)

      expect(first.success).toBe(true)
      expect(second.success).toBe(false)
      expect(rewardTxs()).toHaveLength(1)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('two overlapping approvals (owner and group admin) pay once', async () => {
      setup({ ...submittedByFixer, group_id: GROUP_ID }, {}, OWNER_ID)
      db.latency = db.barrier(op => op.op === 'rpc')

      const results = await Promise.all([ownerApproves(FIXER_ID), ownerApproves(FIXER_ID)])

      expect(results.filter(r => r.success)).toHaveLength(1)
      expect(rewardTxs()).toHaveLength(1)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('pays the designated fixer of a post that is already marked fixed but unpaid', async () => {
      setup({ fixed: true, fixed_by: FIXER_ID }, {}, OWNER_ID)

      const result = await ownerApproves(FIXER_ID)

      expect(result.success).toBe(true)
      expect(profile(FIXER_ID).balance).toBe(FIXER_START.balance + POST_REWARD)
    })

    it('handles a missing post', async () => {
      setup(submittedByFixer, {}, OWNER_ID)

      const result = await ownerApproves(FIXER_ID, { postId: 'nonexistent-post' })

      expect(result).toEqual({ success: false, error: 'Post not found' })
    })
  })
})
