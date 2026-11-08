/**
 * Unit tests for closeIssueAction and deletePostAction (app/actions/post-actions.ts).
 *
 * - closeIssueAction: the post owner (or an approved group admin) closes an issue and
 *   assigns a fixer by username. The post is marked fixed atomically with the admin client
 *   and the post's STORED reward is paid once via the pay_fix_reward RPC.
 * - deletePostAction: soft-deletes a post (admin client, atomic) and refunds the reward to
 *   the poster, only if this request actually deleted the row.
 *
 * Runs against the stateful fake DB (tests/unit/helpers/fake-supabase-db.ts), so
 * assertions are on resulting balances, transactions and post state.
 */
import { vi, beforeEach, describe, it, expect } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
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
vi.mock('@/lib/sms-alerts', () => ({ alertLargePostBounty: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/lightning', () => ({ createInvoice: vi.fn(), checkInvoice: vi.fn(), payInvoice: vi.fn() }))
vi.mock('@/lib/verify-fix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/verify-fix')>()),
  verifyFixImages: vi.fn(() => {
    throw new Error('closeIssueAction must not need AI verification')
  }),
}))

import { closeIssueAction, deletePostAction } from '@/app/actions/post-actions'
import { sendGroupAdminClosedIssueEmail, sendRewardEarnedEmail } from '@/lib/transaction-emails'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

const OWNER_ID = 'owner-user-1'
const FIXER_ID = 'fixer-user-1'
const FIXER_USERNAME = 'fixeruser'
const OTHER_ID = 'other-user-1'
const CHILD_ID = 'child-user-1'
const GROUP_ADMIN_ID = 'group-admin-1'
const GROUP_ID = 'group-1'
const POST_ID = 'post4567-aaaa-bbbb-cccc-000000000001'
const REWARD = 1000
const TITLE = 'Test Issue'
const OWNER_START = 5000
const FIXER_START = 2000

function world(post: Record<string, any> = {}, extra: Record<string, any[]> = {}) {
  return {
    profiles: [
      { id: OWNER_ID, username: 'posteruser', name: 'Poster', email: 'poster@example.com', balance: OWNER_START, pet_coins: 0, fixed_issues_count: 0 },
      { id: FIXER_ID, username: FIXER_USERNAME, name: 'Fixer', email: 'fixer@example.com', balance: FIXER_START, pet_coins: 0, fixed_issues_count: 0 },
      { id: OTHER_ID, username: 'other', name: 'Other', email: 'other@example.com', balance: 0, pet_coins: 0 },
      { id: CHILD_ID, username: 'child', name: 'Child', email: 'child@ganamos.app', balance: 100, pet_coins: 0 },
      { id: GROUP_ADMIN_ID, username: 'admin', name: 'Group Admin', email: 'admin@example.com', balance: 0, pet_coins: 0 },
    ],
    posts: [
      {
        id: POST_ID,
        user_id: OWNER_ID,
        group_id: null,
        title: TITLE,
        reward: REWARD,
        fixed: false,
        fixed_by: null,
        under_review: false,
        deleted_at: null,
        reward_paid_at: null,
        anonymous_reward_paid_at: null,
        created_at: '2026-11-08T12:00:00.000Z',
        // Set by create_post_atomic: the owner's deduction that reserved the reward
        funding_transaction_id: 'funding-tx',
        ...post,
      },
    ],
    transactions: [
      { id: 'funding-tx', user_id: post.user_id ?? OWNER_ID, type: 'internal', status: 'completed', amount: -REWARD, memo: `Post reward for: ${TITLE}`, created_at: '2026-11-08T12:00:00.000Z' },
    ],
    connected_accounts: [{ id: 'conn-1', primary_user_id: OWNER_ID, connected_user_id: CHILD_ID }],
    group_members: [{ group_id: GROUP_ID, user_id: GROUP_ADMIN_ID, role: 'admin', status: 'approved' }],
    groups: [{ id: GROUP_ID, name: 'Neighborhood' }],
    activities: [],
    ...extra,
  }
}

let db: FakeSupabase
const post = () => db.row('posts', POST_ID)!
const balance = (id: string) => db.row('profiles', id)!.balance
const positiveTxs = () => db.rows('transactions', t => t.amount > 0)
const payoutRpcs = () => db.ops(o => o.op === 'rpc' && o.table === 'pay_fix_reward')
const writes = () => db.ops(o => o.op !== 'select')

function setup(postOverrides: Record<string, any> = {}, extra: Record<string, any[]> = {}, signedInAs: string | null = OWNER_ID) {
  db = createFakeSupabase(world(postOverrides, extra)).install()
  db.user = signedInAs ? { id: signedInAs } : null
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ============================================================================
describe('closeIssueAction', () => {
  const close = (username = FIXER_USERNAME) => closeIssueAction(POST_ID, OWNER_ID, username)

  describe('successful closure', () => {
    it('marks the post fixed by the fixer and pays exactly the stored reward, once', async () => {
      setup()

      const result = await close()

      expect(result).toEqual({ success: true })
      expect(post()).toMatchObject({ fixed: true, fixed_by: FIXER_ID, fixed_by_is_anonymous: false, under_review: false, reward_paid_to: FIXER_ID })
      expect(balance(FIXER_ID)).toBe(FIXER_START + REWARD)
      expect(db.row('profiles', FIXER_ID)).toMatchObject({ pet_coins: REWARD, fixed_issues_count: 1 })
      expect(positiveTxs()).toEqual([
        expect.objectContaining({ user_id: FIXER_ID, type: 'internal', amount: REWARD, status: 'completed', memo: `Fix reward earned: ${TITLE}` }),
      ])
      expect(balance(OWNER_ID)).toBe(OWNER_START) // the owner already paid when posting
    })

    it('pays via the pay_fix_reward RPC (admin client) exactly once, with no direct balance writes', async () => {
      setup()

      await close()

      expect(payoutRpcs()).toHaveLength(1)
      expect(payoutRpcs()[0]).toMatchObject({ role: 'admin', payload: { p_post_id: POST_ID, p_fixer_id: FIXER_ID } })
      expect(db.ops(o => o.table === 'profiles' && o.op === 'update')).toHaveLength(0)
      expect(db.ops(o => o.table === 'posts' && o.op === 'update')).toEqual([
        expect.objectContaining({ role: 'admin', rowsAffected: 1 }),
      ])
    })

    it('notifies the fixer and records a fix activity', async () => {
      setup()

      await close()

      expect(sendRewardEarnedEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'fixer@example.com', rewardAmount: REWARD }))
      expect(db.rows('activities', a => a.type === 'fix' && a.user_id === FIXER_ID)).toHaveLength(1)
    })

    it('closing twice pays once', async () => {
      setup()

      const first = await close()
      const second = await close()

      expect(first.success).toBe(true)
      expect(second).toEqual({ success: false, error: 'Post is already marked as fixed' })
      expect(payoutRpcs()).toHaveLength(1)
      expect(balance(FIXER_ID)).toBe(FIXER_START + REWARD)
    })

    it('two overlapping closes (to different fixers) pay exactly one of them', async () => {
      setup()
      db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

      const results = await Promise.all([close(FIXER_USERNAME), close('other')])

      expect(results.filter(r => r.success)).toHaveLength(1)
      expect(payoutRpcs()).toHaveLength(1)
      expect(positiveTxs()).toHaveLength(1)
      expect(balance(FIXER_ID) - FIXER_START + balance(OTHER_ID)).toBe(REWARD)
    })

    it('allows closing a post that is under review (owners/admins can always approve)', async () => {
      setup({ under_review: true, submitted_fix_by_id: OTHER_ID })

      const result = await close()

      expect(result.success).toBe(true)
      expect(post()).toMatchObject({ fixed: true, fixed_by: FIXER_ID, under_review: false })
      expect(balance(FIXER_ID)).toBe(FIXER_START + REWARD)
    })

    it('lets an approved group admin close the issue, and emails the owner', async () => {
      setup({ group_id: GROUP_ID }, {}, GROUP_ADMIN_ID)

      const result = await close()

      expect(result.success).toBe(true)
      expect(balance(FIXER_ID)).toBe(FIXER_START + REWARD)
      expect(sendGroupAdminClosedIssueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: 'poster@example.com', adminName: 'Group Admin', rewardAmount: REWARD, groupName: 'Neighborhood' })
      )
    })

    it('closes a zero-reward post without any payout', async () => {
      setup({ reward: 0 })

      const result = await close()

      expect(result).toEqual({ success: true })
      expect(post().fixed).toBe(true)
      expect(payoutRpcs()).toHaveLength(0)
      expect(balance(FIXER_ID)).toBe(FIXER_START)
    })
  })

  describe('rejections change nothing', () => {
    it('refuses a reward post that was never funded', async () => {
      setup({}, { transactions: [] })

      const result = await close()

      expect(result).toEqual({ success: false, error: "This post's reward was never funded. Cannot issue reward." })
      expect(writes()).toHaveLength(0)
    })

    it('rejects when not authenticated', async () => {
      setup({}, {}, null)

      expect(await close()).toEqual({ success: false, error: 'Not authenticated' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects a caller who is neither the owner nor a group admin', async () => {
      setup({}, {}, OTHER_ID)

      expect(await close()).toEqual({ success: false, error: 'Only the original poster or a group admin can close this issue' })
      expect(writes()).toHaveLength(0)
    })

    it('ignores the deprecated effectiveUserId: a connected account cannot close for its parent', async () => {
      setup({}, {}, CHILD_ID)

      const result = await closeIssueAction(POST_ID, OWNER_ID, FIXER_USERNAME)

      expect(result.success).toBe(false)
      expect(writes()).toHaveLength(0)
    })

    it('rejects a group member who is not an approved admin', async () => {
      setup({ group_id: GROUP_ID }, { group_members: [{ group_id: GROUP_ID, user_id: GROUP_ADMIN_ID, role: 'member', status: 'approved' }] }, GROUP_ADMIN_ID)

      expect((await close()).success).toBe(false)
      expect(writes()).toHaveLength(0)
    })

    it('rejects an unknown post', async () => {
      setup()

      expect(await closeIssueAction('missing-post', OWNER_ID, FIXER_USERNAME)).toEqual({ success: false, error: 'Post not found' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects a post already marked fixed', async () => {
      setup({ fixed: true, fixed_by: OTHER_ID })

      expect(await close()).toEqual({ success: false, error: 'Post is already marked as fixed' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects a deleted post', async () => {
      setup({ deleted_at: '2026-01-01T00:00:00Z' })

      expect(await close()).toEqual({ success: false, error: 'Post has been deleted' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects an unknown fixer username', async () => {
      setup()

      expect(await close('nonexistent-user')).toEqual({ success: false, error: 'User "nonexistent-user" not found' })
      expect(writes()).toHaveLength(0)
    })
  })

  describe('error handling', () => {
    it('reports a post update error and pays nothing', async () => {
      setup()
      db.failOp = op => (op.table === 'posts' && op.op === 'update' ? { message: 'Database error' } : null)

      expect(await close()).toEqual({ success: false, error: 'Failed to update post' })
      expect(payoutRpcs()).toHaveLength(0)
      expect(balance(FIXER_ID)).toBe(FIXER_START)
    })

    it('reports a payout failure, credits nothing and reverts the fixed mark', async () => {
      setup()
      db.failOp = op => (op.op === 'rpc' ? { message: 'connection reset' } : null)

      const result = await close()

      expect(result).toEqual({ success: false, error: 'Failed to pay reward.' })
      expect(balance(FIXER_ID)).toBe(FIXER_START)
      expect(positiveTxs()).toHaveLength(0)
      expect(post()).toMatchObject({ fixed: false, fixed_by: null })
    })

    it('does not pay again if the reward was already paid (e.g. by another path)', async () => {
      setup({ reward_paid_at: '2026-01-01T00:00:00Z', reward_paid_to: OTHER_ID })

      const result = await close()

      expect(result).toEqual({ success: false, error: 'This reward has already been paid.' })
      expect(balance(FIXER_ID)).toBe(FIXER_START)
      expect(positiveTxs()).toHaveLength(0)
    })

    it('returns the error message on unexpected exceptions', async () => {
      setup()
      db.sessionClient.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      expect(await close()).toEqual({ success: false, error: 'Unexpected database error' })
    })
  })
})

// ============================================================================
describe('deletePostAction', () => {
  const del = (effectiveUserId = OWNER_ID) => deletePostAction(POST_ID, effectiveUserId)
  const refundTxs = () => db.rows('transactions', t => t.amount > 0 && /Refund/.test(t.memo))

  describe('successful deletion', () => {
    it('soft-deletes the post (admin client), refunds the reward once and logs an activity', async () => {
      setup()

      const result = await del()

      expect(result).toEqual({ success: true })
      expect(post().deleted_at).toBeTruthy()
      expect(balance(OWNER_ID)).toBe(OWNER_START + REWARD)
      expect(refundTxs()).toEqual([
        expect.objectContaining({ user_id: OWNER_ID, type: 'internal', amount: REWARD, status: 'completed', memo: `Refund for deleted post: ${TITLE}` }),
      ])
      expect(db.rows('activities', a => a.type === 'post_deleted')).toEqual([
        expect.objectContaining({ user_id: OWNER_ID, related_id: POST_ID, metadata: { title: TITLE, reward: REWARD } }),
      ])
    })

    it('performs the soft delete, refund and records with the admin client', async () => {
      setup()

      await del()

      const sensitive = db.ops(o => o.op !== 'select' && ['posts', 'profiles', 'transactions', 'activities'].includes(o.table))
      expect(sensitive.length).toBeGreaterThanOrEqual(4)
      sensitive.forEach(o => expect(o.role).toBe('admin'))
      // The soft delete is conditional (atomic) on the post still being live and unfixed
      const softDelete = db.ops(o => o.table === 'posts' && o.op === 'update')[0]
      expect(softDelete.filters).toEqual(expect.arrayContaining([['is', 'deleted_at', null], ['eq', 'fixed', false]]))
    })

    it('deletes a zero-reward post without refunding', async () => {
      setup({ reward: 0 })

      expect(await del()).toEqual({ success: true })
      expect(post().deleted_at).toBeTruthy()
      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
    })

    it('deletes a null-reward post without refunding', async () => {
      setup({ reward: null })

      expect(await del()).toEqual({ success: true })
      expect(balance(OWNER_ID)).toBe(OWNER_START)
    })

    it('lets a parent delete their connected account\'s post (refund goes to the poster)', async () => {
      setup({ user_id: CHILD_ID }, {}, OWNER_ID)

      expect(await del(CHILD_ID)).toEqual({ success: true })
      expect(post().deleted_at).toBeTruthy()
      expect(balance(CHILD_ID)).toBe(100 + REWARD)
      expect(balance(OWNER_ID)).toBe(OWNER_START)
    })

    it('uses a fallback title when the post has none', async () => {
      setup({ title: null })

      expect(await del()).toEqual({ success: true })
      expect(refundTxs()[0].memo).toBe('Refund for deleted post: Issue')
    })
  })

  describe('refund happens only if this request actually deleted the post', () => {
    it('does not refund when the post was deleted concurrently (no row updated)', async () => {
      setup()
      // Another request deletes the post between our read and our update
      db.beforeOp = op => {
        if (op.table === 'posts' && op.op === 'update') post().deleted_at = '2026-01-01T00:00:00Z'
      }

      const result = await del()

      expect(result).toEqual({ success: false, error: 'Post has already been deleted or fixed' })
      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
      expect(db.rows('activities')).toHaveLength(0)
    })

    it('does not refund when the post was fixed concurrently (no row updated)', async () => {
      setup()
      db.beforeOp = op => {
        if (op.table === 'posts' && op.op === 'update') Object.assign(post(), { fixed: true, fixed_by: FIXER_ID })
      }

      const result = await del()

      expect(result.success).toBe(false)
      expect(post().deleted_at).toBeFalsy()
      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
    })

    it('two overlapping deletes refund exactly once', async () => {
      setup()
      db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

      const results = await Promise.all([del(), del()])

      expect(results.filter(r => r.success)).toHaveLength(1)
      expect(balance(OWNER_ID)).toBe(OWNER_START + REWARD)
      expect(refundTxs()).toHaveLength(1)
    })

    it('deleting twice refunds once', async () => {
      setup()

      await del()
      const second = await del()

      expect(second).toEqual({ success: false, error: 'Post has already been deleted' })
      expect(balance(OWNER_ID)).toBe(OWNER_START + REWARD)
      expect(refundTxs()).toHaveLength(1)
    })
  })

  // Fixed (was REAL BUG): deletePostAction refunded post.reward without checking it was ever
  // funded, and a signed-in user could INSERT their own post with any reward from the browser,
  // so "insert, then delete" minted sats. Refunds now require isPostRewardFunded.
  describe('refund only for funded rewards', () => {
    it('soft-deletes but does not refund a post with no funding link (e.g. inserted from the browser)', async () => {
      setup({ funding_transaction_id: null, reward: 100_000 })

      expect(await del()).toEqual({ success: true })
      expect(post().deleted_at).toBeTruthy()
      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
    })

    it('does not refund when the linked funding transaction is missing', async () => {
      setup({}, { transactions: [] })

      await del()

      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
    })

    it.each([
      ['belongs to another user', { user_id: OTHER_ID }],
      ['is a credit, not a deduction', { amount: REWARD }],
      ['is still pending', { status: 'pending' }],
      ['is a deposit', { type: 'deposit' }],
    ])('does not refund when the linked transaction %s', async (_label, txOverrides) => {
      setup({}, {
        transactions: [{ id: 'funding-tx', user_id: OWNER_ID, type: 'internal', status: 'completed', amount: -REWARD, ...txOverrides }],
      })

      await del()

      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
    })

    it('does not refund a post created after the cutoff via the legacy (unlinked) fallback', async () => {
      setup({ funding_transaction_id: null, created_at: '2026-11-09T00:00:00.000Z' }, {
        transactions: [{ id: 'legacy-tx', user_id: OWNER_ID, type: 'internal', status: 'completed', amount: -REWARD, created_at: '2026-11-09T00:00:30.000Z' }],
      })

      await del()

      expect(balance(OWNER_ID)).toBe(OWNER_START)
    })

    it('refunds a legacy post funded by an unlinked deduction made when it was created', async () => {
      setup({ funding_transaction_id: null, created_at: '2026-10-01T12:00:00.000Z' }, {
        transactions: [{ id: 'legacy-tx', user_id: OWNER_ID, type: 'internal', status: 'completed', amount: -REWARD, created_at: '2026-10-01T12:00:05.000Z' }],
      })

      expect(await del()).toEqual({ success: true })
      expect(balance(OWNER_ID)).toBe(OWNER_START + REWARD)
    })
  })

  describe('authorization', () => {
    it('rejects when not authenticated', async () => {
      setup({}, {}, null)

      expect(await del()).toEqual({ success: false, error: 'Not authenticated' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects an effectiveUserId that is neither the session user nor a connected account', async () => {
      setup({}, {}, OTHER_ID)

      expect(await del()).toEqual({ success: false, error: 'Unauthorized' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects when effectiveUserId is not the post owner', async () => {
      setup({ user_id: OTHER_ID })

      expect(await del()).toEqual({ success: false, error: 'Only the original poster can delete this post' })
      expect(writes()).toHaveLength(0)
    })
  })

  describe('validation', () => {
    it.each([
      ['an unknown post', {}, 'missing-post', 'Post not found'],
      ['a fixed post', { fixed: true }, POST_ID, 'Cannot delete a post that has been marked as fixed'],
      ['a post under review', { under_review: true }, POST_ID, 'Cannot delete a post that is under review'],
      ['an already deleted post', { deleted_at: '2026-01-01T00:00:00Z' }, POST_ID, 'Post has already been deleted'],
    ])('rejects %s and refunds nothing', async (_label, overrides, postId, error) => {
      setup(overrides)

      expect(await deletePostAction(postId, OWNER_ID)).toEqual({ success: false, error })
      expect(writes()).toHaveLength(0)
      expect(balance(OWNER_ID)).toBe(OWNER_START)
    })
  })

  describe('error handling', () => {
    it('reports a soft-delete error and refunds nothing', async () => {
      setup()
      db.failOp = op => (op.table === 'posts' && op.op === 'update' ? { message: 'Database error' } : null)

      expect(await del()).toEqual({ success: false, error: 'Failed to delete post' })
      expect(balance(OWNER_ID)).toBe(OWNER_START)
      expect(refundTxs()).toHaveLength(0)
    })

    it('still reports the deletion when the refund profile read fails', async () => {
      setup()
      db.failOp = op => (op.table === 'profiles' && op.op === 'select' ? { message: 'Profile not found' } : null)

      expect(await del()).toEqual({ success: true })
      expect(post().deleted_at).toBeTruthy()
    })

    it('still reports the deletion when the balance update fails', async () => {
      setup()
      db.failOp = op => (op.table === 'profiles' && op.op === 'update' ? { message: 'Update failed' } : null)

      expect(await del()).toEqual({ success: true })
      expect(post().deleted_at).toBeTruthy()
      expect(balance(OWNER_ID)).toBe(OWNER_START)
    })

    it('still reports the deletion when the refund transaction record fails', async () => {
      setup()
      db.failOp = op => (op.table === 'transactions' && op.op === 'insert' ? { message: 'Transaction insert failed' } : null)

      expect(await del()).toEqual({ success: true })
      expect(balance(OWNER_ID)).toBe(OWNER_START + REWARD)
    })

    it('returns the error message on unexpected exceptions', async () => {
      setup()
      db.sessionClient.from.mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      expect(await del()).toEqual({ success: false, error: 'Unexpected error' })
    })
  })
})
