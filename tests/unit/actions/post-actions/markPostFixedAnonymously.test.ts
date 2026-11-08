/**
 * Unit tests for markPostFixedAnonymouslyAction (app/actions/post-actions.ts).
 *
 * An anonymous fixer's fix is auto-approved only if:
 *  - a fix photo is provided (text-only proofs go to review),
 *  - the post exists, is not deleted, not already fixed/paid, and its reward was funded,
 *  - the SERVER's AI verification (against the post's stored before-image) scores >= 7.
 *    The client-supplied aiConfidence / aiAnalysis are ignored.
 * The post is claimed atomically (.eq('fixed', false)) and a claim token is returned to
 * the fixer; only its SHA-256 is stored on the post.
 *
 * Runs against the stateful fake DB (tests/unit/helpers/fake-supabase-db.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn() })),
}))
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-123') }))
vi.mock('@/lib/verify-fix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/verify-fix')>()),
  verifyFixImages: vi.fn(),
}))
vi.mock('@/lib/transaction-emails', () => ({
  sendIssueFixedEmail: vi.fn(),
  sendRewardEarnedEmail: vi.fn(),
  sendFixSubmittedForReviewEmail: vi.fn(),
  sendGroupAdminClosedIssueEmail: vi.fn(),
}))
vi.mock('@/lib/safety-caps', () => ({
  checkBalanceCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none' }),
  checkPostRewardCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none' }),
  checkLivePostsCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none' }),
}))
vi.mock('@/lib/sms-alerts', () => ({ alertLargePostBounty: vi.fn() }))
vi.mock('@/lib/lightning', () => ({ createInvoice: vi.fn(), checkInvoice: vi.fn(), payInvoice: vi.fn() }))

import { markPostFixedAnonymouslyAction } from '@/app/actions/post-actions'
import { verifyFixImages } from '@/lib/verify-fix'
import { hashClaimToken, verifyClaimToken } from '@/lib/payouts'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

const POST_ID = 'test-post-123'
const FIX_IMAGE = 'https://example.com/fix-image.jpg'
const BEFORE_IMAGE = 'https://example.com/before.jpg'

/** An anonymous web post funded by a verified Lightning invoice */
function testPost(overrides: Record<string, any> = {}) {
  return {
    id: POST_ID,
    user_id: null,
    title: 'Fix pothole on Main St',
    description: 'Big pothole',
    reward: 5000,
    image_url: BEFORE_IMAGE,
    fixed: false,
    fixed_at: null,
    fixed_by: null,
    fixed_by_is_anonymous: false,
    deleted_at: null,
    reward_paid_at: null,
    funding_status: 'paid',
    funding_r_hash: 'a'.repeat(64),
    under_review: false,
    submitted_fix_by_id: null,
    submitted_fix_by_name: null,
    submitted_fix_by_avatar: null,
    submitted_fix_at: null,
    anonymous_claim_token_hash: null,
    ...overrides,
  }
}

let db: FakeSupabase
const post = () => db.row('posts', POST_ID)!
const postUpdates = () => db.ops(o => o.table === 'posts' && o.op === 'update')

function setup(postOverrides: Record<string, any> = {}, extra: Record<string, any[]> = {}) {
  db = createFakeSupabase({ posts: [testPost(postOverrides)], activities: [], transactions: [], ...extra }).install()
  return db
}

const mark = (fixerNote: string | null = 'Fixed the pothole with asphalt', aiConfidence: any = 8.5, aiAnalysis: any = 'client analysis', fixImageUrl: any = FIX_IMAGE, postId: any = POST_ID) =>
  markPostFixedAnonymouslyAction(postId, fixImageUrl, fixerNote, aiConfidence, aiAnalysis)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 9, reasoning: 'Server: pothole filled' })
})

describe('markPostFixedAnonymouslyAction', () => {
  describe('core functionality', () => {
    it('marks the post fixed anonymously with the server verification result', async () => {
      setup()

      const result = await mark()

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(post()).toMatchObject({
        fixed: true,
        fixed_by: null,
        fixed_by_is_anonymous: true,
        fixed_image_url: FIX_IMAGE,
        fixer_note: 'Fixed the pothole with asphalt',
        ai_confidence_score: 9,
        ai_analysis: 'Server: pothole filled',
        under_review: false,
      })
      // Uses the admin client, atomically conditional on the post still being unfixed and live
      expect(postUpdates()).toEqual([
        expect.objectContaining({
          role: 'admin',
          filters: expect.arrayContaining([['eq', 'id', POST_ID], ['eq', 'fixed', false], ['is', 'deleted_at', null]]),
        }),
      ])
    })

    it('verifies against the stored before-image, title and description', async () => {
      setup()

      await mark()

      expect(verifyFixImages).toHaveBeenCalledWith({
        beforeImage: BEFORE_IMAGE,
        afterImage: FIX_IMAGE,
        title: 'Fix pothole on Main St',
        description: 'Big pothole',
      })
    })

    it('does not pay anything itself (the anonymous reward is claimed later)', async () => {
      setup()

      await mark()

      expect(db.ops(o => o.op === 'rpc')).toHaveLength(0)
      expect(post().reward_paid_at).toBeFalsy()
    })

    it('stores fixed_at as the current time', async () => {
      setup()
      const before = Date.now()

      await mark()

      const fixedAt = new Date(post().fixed_at).getTime()
      expect(fixedAt).toBeGreaterThanOrEqual(before)
      expect(fixedAt).toBeLessThanOrEqual(Date.now())
    })

    it('clears previous review submission fields', async () => {
      setup({
        under_review: true,
        submitted_fix_by_id: 'user-456',
        submitted_fix_by_name: 'Previous User',
        submitted_fix_by_avatar: 'https://example.com/old-avatar.jpg',
        submitted_fix_at: '2024-01-01T00:00:00Z',
      })

      expect((await mark()).success).toBe(true)

      expect(post()).toMatchObject({
        under_review: false,
        submitted_fix_by_id: null,
        submitted_fix_by_name: null,
        submitted_fix_by_avatar: null,
        submitted_fix_at: null,
      })
    })

    it('creates a fix activity with the post title, reward and server verification', async () => {
      setup()

      await mark('Fixed the pothole')

      expect(db.rows('activities')).toEqual([
        expect.objectContaining({
          id: 'test-uuid-123',
          user_id: null,
          type: 'fix',
          related_id: POST_ID,
          related_table: 'posts',
          metadata: expect.objectContaining({
            title: 'Fix pothole on Main St',
            reward: 5000,
            fixed: true,
            fixImageUrl: FIX_IMAGE,
            fixerNote: 'Fixed the pothole',
            aiConfidence: 9,
            aiAnalysis: 'Server: pothole filled',
          }),
        }),
      ])
    })

    it('still succeeds when activity logging fails', async () => {
      setup()
      db.failOp = op => (op.table === 'activities' ? { message: 'Activity insert failed' } : null)

      expect((await mark()).success).toBe(true)
      expect(post().fixed).toBe(true)
    })

    it.each([
      ['a very long note', 'A'.repeat(10000)],
      ['special characters', 'Fixed! @#$%^&*()_+-={}[]|\\:";\'<>?,./~`'],
      ['unicode', '修复了坑洞 🚧 مُصلَح'],
      ['whitespace only', '   '],
      ['an empty string', ''],
      ['null', null],
    ])('stores the fixer note verbatim: %s', async (_label, note) => {
      setup()

      expect((await mark(note)).success).toBe(true)
      expect(post().fixer_note).toBe(note)
    })
  })

  describe('claim token', () => {
    it('returns a fresh claim token and stores only its SHA-256 hash', async () => {
      setup()

      const result = await mark()

      expect(result.claimToken).toMatch(/^[0-9a-f]{64}$/)
      expect(post().anonymous_claim_token_hash).toBe(hashClaimToken(result.claimToken!))
      expect(post().anonymous_claim_token_hash).not.toBe(result.claimToken)
      expect(verifyClaimToken(post().anonymous_claim_token_hash, result.claimToken)).toBe(true)
    })

    it('issues different tokens for different fixes', async () => {
      setup()
      const a = await mark()
      setup()
      const b = await mark()

      expect(a.claimToken).not.toBe(b.claimToken)
    })

    it('returns no token on failure', async () => {
      setup()
      vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 2, reasoning: 'no' })

      const result = await mark()

      expect(result.claimToken).toBeUndefined()
      expect(post().anonymous_claim_token_hash).toBeNull()
    })
  })

  describe('server verification decides (client confidence is ignored)', () => {
    it.each([10, 9.9, 1000])('rejects a low server score even when the client claims %s', async (clientConfidence) => {
      setup()
      vi.mocked(verifyFixImages).mockResolvedValue({ confidence: 3, reasoning: 'Pothole still there' })

      const result = await mark('Fixed', clientConfidence, 'Perfect fix')

      expect(result).toEqual({ success: false, error: 'AI confidence too low for auto-approval.' })
      expect(post().fixed).toBe(false)
      expect(postUpdates()).toHaveLength(0)
    })

    it.each([0, -5, null, undefined])('approves on a high server score whatever the client sends (%s)', async (clientConfidence) => {
      setup()

      const result = await mark('Fixed', clientConfidence, '')

      expect(result.success).toBe(true)
      expect(post().ai_confidence_score).toBe(9)
    })

    it('uses the threshold 7: 6 is rejected, 7 approved', async () => {
      setup()
      vi.mocked(verifyFixImages).mockResolvedValueOnce({ confidence: 6, reasoning: '' })
      expect((await mark()).success).toBe(false)
      expect(post().fixed).toBe(false)

      vi.mocked(verifyFixImages).mockResolvedValueOnce({ confidence: 7, reasoning: '' })
      expect((await mark()).success).toBe(true)
    })

    it('rejects (asks for review) when the model call fails', async () => {
      setup()
      vi.mocked(verifyFixImages).mockRejectedValue(new Error('model unavailable'))

      const result = await mark()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/submit it for review/)
      expect(post().fixed).toBe(false)
    })

    it('rejects when the post has no before-image to compare', async () => {
      setup({ image_url: null })

      const result = await mark()

      expect(result.success).toBe(false)
      expect(verifyFixImages).not.toHaveBeenCalled()
      expect(post().fixed).toBe(false)
    })
  })

  describe('post state checks', () => {
    it('rejects a post that does not exist', async () => {
      setup()

      expect(await mark('Fixed', 8, 'x', FIX_IMAGE, 'non-existent-post')).toEqual({ success: false, error: 'Post not found.' })
      expect(verifyFixImages).not.toHaveBeenCalled()
    })

    it('rejects a deleted post', async () => {
      setup({ deleted_at: '2026-01-01T00:00:00Z' })

      expect(await mark()).toEqual({ success: false, error: 'Post has been deleted.' })
      expect(postUpdates()).toHaveLength(0)
    })

    it('rejects a post that is already fixed (cannot overwrite the fixer)', async () => {
      setup({ fixed: true, fixed_by: 'real-fixer' })

      expect(await mark()).toEqual({ success: false, error: 'This issue has already been fixed.' })
      expect(post().fixed_by).toBe('real-fixer')
      expect(verifyFixImages).not.toHaveBeenCalled()
    })

    it('rejects a post whose reward was already paid', async () => {
      setup({ reward_paid_at: '2026-01-01T00:00:00Z' })

      expect((await mark()).success).toBe(false)
      expect(postUpdates()).toHaveLength(0)
    })

    it('rejects an anonymous post that was never funded', async () => {
      setup({ funding_status: 'pending', funding_r_hash: null })

      const result = await mark()

      expect(result).toEqual({ success: false, error: "This post's reward was never funded." })
      expect(verifyFixImages).not.toHaveBeenCalled()
      expect(post().fixed).toBe(false)
    })

    it('accepts an owner post funded by the owner\'s balance deduction', async () => {
      setup({ user_id: 'owner-1', funding_status: null, funding_r_hash: null, funding_transaction_id: 'f' }, {
        transactions: [{ id: 'f', user_id: 'owner-1', type: 'internal', status: 'completed', amount: -5000, memo: 'Post reward for: Fix pothole' }],
      })

      expect((await mark()).success).toBe(true)
    })

    it('two concurrent anonymous fixes: only one is recorded and gets a token', async () => {
      setup()
      db.latency = db.barrier(op => op.table === 'posts' && op.op === 'update')

      const results = await Promise.all([mark('first'), mark('second')])

      const winners = results.filter(r => r.success)
      expect(winners).toHaveLength(1)
      expect(results.find(r => !r.success)!.error).toBe('This issue has already been fixed.')
      expect(post().anonymous_claim_token_hash).toBe(hashClaimToken(winners[0].claimToken!))
      expect(db.rows('activities')).toHaveLength(1)
    })
  })

  describe('input validation and errors', () => {
    it.each([
      ['missing postId', ''],
      ['null postId', null],
      ['undefined postId', undefined],
    ])('rejects %s without touching the database', async (_label, postId) => {
      setup()

      const result = await markPostFixedAnonymouslyAction(postId as any, FIX_IMAGE, 'Fixed', 8, 'x')

      expect(result).toEqual({ success: false, error: 'Post ID and a fix photo are required.' })
      expect(db.log).toHaveLength(0)
    })

    it.each([['empty', ''], ['null', null], ['undefined', undefined]])(
      'rejects a %s fix image (text-only proofs must go to review)',
      async (_label, image) => {
        setup()

        const result = await markPostFixedAnonymouslyAction(POST_ID, image as any, 'Fixed', 10, 'x')

        expect(result).toEqual({ success: false, error: 'Post ID and a fix photo are required.' })
        expect(db.log).toHaveLength(0)
        expect(verifyFixImages).not.toHaveBeenCalled()
      }
    )

    it('passes any non-empty image string to verification (validation is the model\'s job)', async () => {
      setup()

      for (const url of ['not-a-url', 'https://example.com/fix?query=test&param=value#fragment']) {
        setup()
        expect((await mark('Fixed', 8, 'x', url)).success).toBe(true)
        expect(post().fixed_image_url).toBe(url)
      }
    })

    it('reports a database update error', async () => {
      setup()
      db.failOp = op => (op.table === 'posts' && op.op === 'update' ? { message: 'Database connection failed', code: 'CONNECTION_ERROR' } : null)

      expect(await mark()).toEqual({ success: false, error: 'Database connection failed' })
    })

    it('catches a client creation failure', async () => {
      setup()
      vi.mocked(createServerSupabaseClient).mockReturnValue(null as any)

      const result = await mark()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot read properties of null')
    })
  })
})
