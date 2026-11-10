/**
 * isPostRewardFunded (lib/payouts.ts): decides whether a post's reward was actually paid in,
 * which gates every payout and refund. It re-reads the post from the DB and checks:
 *  - reward <= 0: nothing to fund;
 *  - ownerless posts: funding_status 'paid' with a funding invoice hash;
 *  - posts.funding_transaction_id (set by create_post_atomic): the owner's completed internal
 *    deduction;
 *  - legacy posts (created before 2026-11-08, no link): an unlinked deduction of exactly the
 *    reward (or original_reward) by the owner within 2 minutes of creation;
 *  - legacy posts an admin vouched for: a post_funding_overrides row covering the reward.
 */
import { describe, it, expect } from 'vitest'
import { isPostRewardFunded } from '@/lib/payouts'
import { createFakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

const OWNER = 'owner-1'
const POST_ID = 'post-1'
const REWARD = 1000

const deduction = (over: Record<string, any> = {}) => ({
  id: 'tx-1', user_id: OWNER, type: 'internal', status: 'completed', amount: -REWARD,
  memo: 'Post reward for: something', created_at: '2026-11-08T12:00:00.000Z', ...over,
})

function funded(post: Record<string, any>, transactions: any[] = [], otherPosts: any[] = [], overrides: any[] = []) {
  const db = createFakeSupabase({
    posts: [{ id: POST_ID, user_id: OWNER, reward: REWARD, original_reward: null, created_at: '2026-11-08T12:00:00.000Z', funding_transaction_id: null, ...post }, ...otherPosts],
    transactions,
    post_funding_overrides: overrides,
  })
  return isPostRewardFunded(db.adminClient as any, { id: POST_ID })
}

describe('isPostRewardFunded', () => {
  it('treats a zero-reward post as funded', async () => {
    expect(await funded({ reward: 0 })).toBe(true)
  })

  it('returns false for a post that does not exist', async () => {
    const db = createFakeSupabase({ posts: [], transactions: [] })
    expect(await isPostRewardFunded(db.adminClient as any, { id: 'nope' })).toBe(false)
  })

  describe('funding_transaction_id', () => {
    it("accepts the owner's completed internal deduction", async () => {
      expect(await funded({ funding_transaction_id: 'tx-1' }, [deduction()])).toBe(true)
    })

    it.each([
      ['missing', []],
      ["another user's", [deduction({ user_id: 'someone-else' })]],
      ['a credit', [deduction({ amount: REWARD })]],
      ['pending', [deduction({ status: 'pending' })]],
      ['a deposit', [deduction({ type: 'deposit' })]],
    ])('rejects a linked transaction that is %s', async (_label, txs) => {
      expect(await funded({ funding_transaction_id: 'tx-1' }, txs as any[])).toBe(false)
    })

    it('rejects a post with neither a link nor a legacy match (e.g. inserted from the browser)', async () => {
      expect(await funded({}, [deduction()])).toBe(false)
    })
  })

  describe('ownerless (anonymous / API) posts', () => {
    it('accepts funding_status paid with a funding invoice hash', async () => {
      expect(await funded({ user_id: null, funding_status: 'paid', funding_r_hash: 'a'.repeat(64) })).toBe(true)
    })

    it.each([
      ['paid without a hash', { funding_status: 'paid', funding_r_hash: null }],
      ['a hash but not paid', { funding_status: 'pending', funding_r_hash: 'a'.repeat(64) }],
      ['nothing', {}],
    ])('rejects %s', async (_label, over) => {
      expect(await funded({ user_id: null, ...over })).toBe(false)
    })

    it('does not accept a funding transaction for an ownerless post', async () => {
      expect(await funded({ user_id: null, funding_transaction_id: 'tx-1' }, [deduction({ user_id: null })])).toBe(false)
    })
  })

  describe('legacy posts (no funding link)', () => {
    const legacyPost = { created_at: '2026-10-01T12:00:00.000Z' }

    it('accepts an unlinked deduction of the reward within 2 minutes of creation', async () => {
      expect(await funded(legacyPost, [deduction({ created_at: '2026-10-01T12:01:30.000Z' })])).toBe(true)
      expect(await funded(legacyPost, [deduction({ created_at: '2026-10-01T11:58:30.000Z' })])).toBe(true)
    })

    it('accepts a deduction of the original reward (post was boosted later)', async () => {
      expect(await funded({ ...legacyPost, reward: 1500, original_reward: REWARD }, [deduction({ created_at: '2026-10-01T12:00:10.000Z' })])).toBe(true)
    })

    it('rejects a deduction already linked to another post', async () => {
      expect(
        await funded(legacyPost, [deduction({ created_at: '2026-10-01T12:00:10.000Z' })], [
          { id: 'other-post', user_id: OWNER, reward: REWARD, funding_transaction_id: 'tx-1' },
        ])
      ).toBe(false)
    })

    it('rejects posts created on or after the cutoff', async () => {
      for (const created_at of ['2026-11-08T00:00:00.000Z', '2026-11-09T12:00:00.000Z']) {
        expect(await funded({ created_at }, [deduction({ created_at })])).toBe(false)
      }
    })

    it.each([
      ['outside the 2-minute window', { created_at: '2026-10-01T12:03:00.000Z' }],
      ['for a different amount', { amount: -999, created_at: '2026-10-01T12:00:10.000Z' }],
      ['by another user', { user_id: 'someone-else', created_at: '2026-10-01T12:00:10.000Z' }],
      ['not completed', { status: 'pending', created_at: '2026-10-01T12:00:10.000Z' }],
    ])('rejects a deduction %s', async (_label, over) => {
      expect(await funded(legacyPost, [deduction(over)])).toBe(false)
    })
  })

  describe('admin funding overrides (legacy posts)', () => {
    const legacyPost = { created_at: '2026-10-01T12:00:00.000Z' }
    const override = (over: Record<string, any> = {}) => ({ post_id: POST_ID, amount: REWARD, ...over })

    it('accepts a legacy post with an override covering the reward', async () => {
      expect(await funded(legacyPost, [], [], [override()])).toBe(true)
    })

    it('rejects an override smaller than the current reward', async () => {
      expect(await funded({ ...legacyPost, reward: REWARD + 1 }, [], [], [override()])).toBe(false)
    })

    it("ignores another post's override", async () => {
      expect(await funded(legacyPost, [], [], [override({ post_id: 'other-post' })])).toBe(false)
    })

    it('ignores overrides for posts created on or after the cutoff', async () => {
      expect(await funded({ created_at: '2026-11-08T12:00:00.000Z' }, [], [], [override()])).toBe(false)
    })
  })

  describe('ignores caller-supplied fields', () => {
    it('re-reads the post: a caller claiming "ownerless and paid" does not make an unfunded post funded', async () => {
      const db = createFakeSupabase({
        posts: [{ id: POST_ID, user_id: OWNER, reward: REWARD, created_at: '2026-11-08T12:00:00.000Z', funding_transaction_id: null }],
        transactions: [],
      })
      const forged: any = { id: POST_ID, user_id: null, reward: 0, funding_status: 'paid', funding_r_hash: 'x', funding_transaction_id: 'tx-1', created_at: '2020-01-01T00:00:00Z' }

      expect(await isPostRewardFunded(db.adminClient as any, forged)).toBe(false)
      expect(db.ops(o => o.table === 'posts' && o.op === 'select')).toHaveLength(1)
    })

    it('re-reads the post: a caller passing reward 0 does not skip the check', async () => {
      const db = createFakeSupabase({
        posts: [{ id: POST_ID, user_id: OWNER, reward: REWARD, created_at: '2026-11-08T12:00:00.000Z', funding_transaction_id: null }],
      })
      expect(await isPostRewardFunded(db.adminClient as any, { id: POST_ID, reward: 0 } as any)).toBe(false)
    })
  })
})
