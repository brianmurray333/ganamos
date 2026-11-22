/**
 * Integration: who may review (approve/send back) a post's pending fix,
 * against the real local database (20261122000000_parent_review_for_child).
 *
 * The same rule is enforced twice and both are tested with one table of cases:
 *  - in SQL by public.ganamos_can_review_post, exercised through the
 *    review_submitted_fix_atomic RPC (what the web "Not done yet" and the iOS
 *    app call) with a real user session;
 *  - in TypeScript by authorizePostReview (lib/post-review-auth.ts), used by the
 *    approve-and-pay / close-issue server actions.
 *
 * Allowed: the owner, an approved group admin, and a parent acting for a
 * connected child who is one of those. Everything else must be denied.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterEach } from 'vitest'
import { seedUser, seedConnectedAccount, queryDB, queryOne } from './helpers'
import { getAuthenticatedClient, getServiceClient } from './helpers/db-client'
import { authorizePostReview, isSelfDealingReview } from '@/lib/post-review-auth'

const createdPosts: string[] = []
const createdGroups: string[] = []

afterEach(async () => {
  if (createdPosts.length) {
    await queryDB('DELETE FROM posts WHERE id = ANY($1::uuid[])', [createdPosts.splice(0)])
  }
  if (createdGroups.length) {
    const ids = createdGroups.splice(0)
    await queryDB('DELETE FROM group_members WHERE group_id = ANY($1::uuid[])', [ids])
    await queryDB('DELETE FROM groups WHERE id = ANY($1::uuid[])', [ids])
  }
})

async function seedGroup(createdBy: string) {
  const id = crypto.randomUUID()
  const code = id.replace(/-/g, '').slice(0, 10)
  await queryDB(
    'INSERT INTO groups (id, name, created_by, invite_code, group_code) VALUES ($1, $2, $3, $4, $5)',
    [id, 'Review test group', createdBy, `inv${code}`, `g${code}`]
  )
  createdGroups.push(id)
  return id
}

async function addMember(groupId: string, userId: string, role: 'admin' | 'member', status = 'approved') {
  await queryDB('INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [
    groupId,
    userId,
    role,
    status,
  ])
}

/** A post with a fix awaiting review */
async function seedPendingPost(ownerId: string, groupId: string | null, fixerId: string, reward = 500) {
  const id = crypto.randomUUID()
  await queryDB(
    `INSERT INTO posts (id, title, description, reward, fixed, user_id, group_id,
       under_review, submitted_fix_by_id, submitted_fix_by_name, submitted_fix_at, submitted_fix_note)
     VALUES ($1, 'Review test', 'Review test', $5, false, $2, $3, true, $4, 'Fixer', now(), 'Submitted via device')`,
    [id, ownerId, groupId, fixerId, reward]
  )
  createdPosts.push(id)
  return id
}

/** Profile status can only be changed by the service role (DB trigger) */
async function suspend(userId: string) {
  const { error } = await getServiceClient().from('profiles').update({ status: 'suspended' } as any).eq('id', userId)
  if (error) throw error
  const row = await queryOne<{ status: string }>('SELECT status FROM profiles WHERE id = $1', [userId])
  if (row?.status !== 'suspended') throw new Error('test setup: could not suspend profile')
}

async function postState(id: string) {
  return queryOne<{ under_review: boolean; submitted_fix_by_id: string | null; fixed: boolean }>(
    'SELECT under_review, submitted_fix_by_id, fixed FROM posts WHERE id = $1',
    [id]
  )
}

type Scenario = {
  name: string
  allowed: boolean
  via?: string
  /** Returns the reviewer and the post they try to review */
  setup: () => Promise<{ reviewerId: string; postId: string; post: { user_id: string | null; group_id: string | null } }>
}

const scenarios: Scenario[] = [
  {
    name: 'the post owner',
    allowed: true,
    via: 'owner',
    setup: async () => {
      const owner = await seedUser()
      const fixer = await seedUser()
      const postId = await seedPendingPost(owner.id, null, fixer.id)
      return { reviewerId: owner.id, postId, post: { user_id: owner.id, group_id: null } }
    },
  },
  {
    name: 'an approved admin of the post group',
    allowed: true,
    via: 'group_admin',
    setup: async () => {
      const owner = await seedUser()
      const admin = await seedUser()
      const fixer = await seedUser()
      const g = await seedGroup(admin.id)
      await addMember(g, admin.id, 'admin')
      await addMember(g, owner.id, 'member')
      const postId = await seedPendingPost(owner.id, g, fixer.id)
      return { reviewerId: admin.id, postId, post: { user_id: owner.id, group_id: g } }
    },
  },
  {
    name: "a parent acting for the child who owns the post",
    allowed: true,
    via: 'parent_of_owner',
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const postId = await seedPendingPost(child.id, null, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: child.id, group_id: null } }
    },
  },
  {
    name: 'a parent acting for a child who admins the post group (parent not in the group)',
    allowed: true,
    via: 'parent_of_group_admin',
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const owner = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const g = await seedGroup(child.id)
      await addMember(g, child.id, 'admin')
      await addMember(g, owner.id, 'member')
      const postId = await seedPendingPost(owner.id, g, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: owner.id, group_id: g } }
    },
  },
  {
    name: 'a parent whose child is only a member (not admin) of the group',
    allowed: false,
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const owner = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const g = await seedGroup(owner.id)
      await addMember(g, child.id, 'member')
      await addMember(g, owner.id, 'admin')
      const postId = await seedPendingPost(owner.id, g, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: owner.id, group_id: g } }
    },
  },
  {
    name: "a parent whose child's admin membership is still pending",
    allowed: false,
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const owner = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const g = await seedGroup(owner.id)
      await addMember(g, child.id, 'admin', 'pending')
      const postId = await seedPendingPost(owner.id, g, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: owner.id, group_id: g } }
    },
  },
  {
    name: 'a parent whose admin child is suspended',
    allowed: false,
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const owner = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      await suspend(child.id)
      const g = await seedGroup(child.id)
      await addMember(g, child.id, 'admin')
      const postId = await seedPendingPost(owner.id, g, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: owner.id, group_id: g } }
    },
  },
  {
    name: 'a parent whose child-owner is suspended',
    allowed: false,
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      await suspend(child.id)
      const postId = await seedPendingPost(child.id, null, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: child.id, group_id: null } }
    },
  },
  {
    name: 'a parent whose child admins a different group',
    allowed: false,
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const owner = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const childGroup = await seedGroup(child.id)
      await addMember(childGroup, child.id, 'admin')
      const otherGroup = await seedGroup(owner.id)
      await addMember(otherGroup, owner.id, 'admin')
      const postId = await seedPendingPost(owner.id, otherGroup, fixer.id)
      return { reviewerId: parent.id, postId, post: { user_id: owner.id, group_id: otherGroup } }
    },
  },
  {
    name: 'a grandparent (only direct children count)',
    allowed: false,
    setup: async () => {
      const grandparent = await seedUser()
      const parent = await seedUser()
      const child = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(grandparent.id, parent.id)
      await seedConnectedAccount(parent.id, child.id)
      const postId = await seedPendingPost(child.id, null, fixer.id)
      return { reviewerId: grandparent.id, postId, post: { user_id: child.id, group_id: null } }
    },
  },
  {
    name: "a child acting for their parent's post (links only go parent → child)",
    allowed: false,
    setup: async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const fixer = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const postId = await seedPendingPost(parent.id, null, fixer.id)
      return { reviewerId: child.id, postId, post: { user_id: parent.id, group_id: null } }
    },
  },
  {
    name: 'an unrelated signed-in user',
    allowed: false,
    setup: async () => {
      const owner = await seedUser()
      const stranger = await seedUser()
      const fixer = await seedUser()
      const postId = await seedPendingPost(owner.id, null, fixer.id)
      return { reviewerId: stranger.id, postId, post: { user_id: owner.id, group_id: null } }
    },
  },
  {
    name: 'the fixer reviewing their own submission',
    allowed: false,
    setup: async () => {
      const owner = await seedUser()
      const fixer = await seedUser()
      const postId = await seedPendingPost(owner.id, null, fixer.id)
      return { reviewerId: fixer.id, postId, post: { user_id: owner.id, group_id: null } }
    },
  },
]

describe('who may review a pending fix', () => {
  describe('authorizePostReview (server actions)', () => {
    for (const s of scenarios) {
      it(`${s.allowed ? 'allows' : 'denies'} ${s.name}`, async () => {
        const { reviewerId, post } = await s.setup()
        const access = await authorizePostReview(getServiceClient() as any, reviewerId, post)
        expect(access.allowed).toBe(s.allowed)
        if (s.allowed && access.allowed) expect(access.via).toBe(s.via)
      })
    }

    it('denies when no session user id is given', async () => {
      const owner = await seedUser()
      const access = await authorizePostReview(getServiceClient() as any, null, { user_id: owner.id, group_id: null })
      expect(access.allowed).toBe(false)
    })
  })

  describe('review_submitted_fix_atomic (database rule, real user session)', () => {
    for (const s of scenarios) {
      it(`${s.allowed ? 'lets' : 'blocks'} ${s.name} send back the fix`, async () => {
        const { reviewerId, postId } = await s.setup()
        const { error } = await getAuthenticatedClient(reviewerId).rpc('review_submitted_fix_atomic' as any, {
          p_post_id: postId,
          p_approve: false,
          p_rejection_reason: null,
        })
        const state = await postState(postId)
        if (s.allowed) {
          expect(error).toBeNull()
          // Reopened for everyone: no longer under review, submission cleared
          expect(state?.under_review).toBe(false)
          expect(state?.submitted_fix_by_id).toBeNull()
        } else {
          expect(error).not.toBeNull()
          // Untouched
          expect(state?.under_review).toBe(true)
          expect(state?.submitted_fix_by_id).not.toBeNull()
        }
        expect(state?.fixed).toBe(false)
      })
    }

    it('cannot be called with no session', async () => {
      const owner = await seedUser()
      const fixer = await seedUser()
      const postId = await seedPendingPost(owner.id, null, fixer.id)
      const { getAnonClient } = await import('./helpers/db-client')
      const { error } = await getAnonClient().rpc('review_submitted_fix_atomic' as any, {
        p_post_id: postId,
        p_approve: false,
        p_rejection_reason: null,
      })
      expect(error).not.toBeNull()
      expect((await postState(postId))?.under_review).toBe(true)
    })

    it('keeps ganamos_can_review_post off-limits to user sessions', async () => {
      const owner = await seedUser()
      const { error } = await getAuthenticatedClient(owner.id).rpc('ganamos_can_review_post' as any, {
        p_user_id: owner.id,
        p_group_id: null,
      })
      expect(error).not.toBeNull()
    })
  })

  describe('group_members visibility for parents', () => {
    it("shows a parent their child's own membership rows, but not other members", async () => {
      const parent = await seedUser()
      const child = await seedUser()
      const other = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const g = await seedGroup(child.id)
      await addMember(g, child.id, 'admin')
      await addMember(g, other.id, 'member')

      const { data, error } = await getAuthenticatedClient(parent.id)
        .from('group_members')
        .select('user_id, role, status')
        .eq('group_id', g)
      expect(error).toBeNull()
      expect(data).toEqual([{ user_id: child.id, role: 'admin', status: 'approved' }])
    })

    it("does not show an unrelated user anyone's membership in a group they aren't in", async () => {
      const stranger = await seedUser()
      const member = await seedUser()
      const g = await seedGroup(member.id)
      await addMember(g, member.id, 'admin')

      const { data, error } = await getAuthenticatedClient(stranger.id)
        .from('group_members')
        .select('user_id')
        .eq('group_id', g)
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it("does not show a child their parent's memberships", async () => {
      const parent = await seedUser()
      const child = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const g = await seedGroup(parent.id)
      await addMember(g, parent.id, 'admin')

      const { data } = await getAuthenticatedClient(child.id)
        .from('group_members')
        .select('user_id')
        .eq('group_id', g)
      expect(data).toEqual([])
    })

    it('still lets group members see each other', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const g = await seedGroup(a.id)
      await addMember(g, a.id, 'admin')
      await addMember(g, b.id, 'member')

      const { data } = await getAuthenticatedClient(b.id).from('group_members').select('user_id').eq('group_id', g)
      expect((data || []).map((r: { user_id: string }) => r.user_id).sort()).toEqual([a.id, b.id].sort())
    })
  })
})

/**
 * Self-dealing: a reviewer whose authority comes from administering the group
 * (directly or via an admin child) must not pay someone else's reward to
 * themselves or their own child. Owners (or a parent acting for the owning
 * child) may pay anyone. Zero-reward posts keep these tests independent of the
 * funding check, which runs after this guard.
 */
describe('self-dealing approvals are blocked', () => {
  type Case = {
    name: string
    blocked: boolean
    setup: () => Promise<{ reviewerId: string; ownerId: string; groupId: string | null; fixerId: string; fixerUsername: string }>
  }

  async function seedZeroRewardPendingPost(ownerId: string, groupId: string | null, fixerId: string) {
    // (reward is pinned by a trigger once inserted, so set it at insert)
    return seedPendingPost(ownerId, groupId, fixerId, 0)
  }

  const cases: Case[] = [
    {
      name: 'a group admin approving their own fix on a member\'s post',
      blocked: true,
      setup: async () => {
        const owner = await seedUser()
        const admin = await seedUser()
        const g = await seedGroup(admin.id)
        await addMember(g, admin.id, 'admin')
        return { reviewerId: admin.id, ownerId: owner.id, groupId: g, fixerId: admin.id, fixerUsername: admin.username }
      },
    },
    {
      name: "a group admin approving their child's fix on a member's post",
      blocked: true,
      setup: async () => {
        const owner = await seedUser()
        const admin = await seedUser()
        const kid = await seedUser()
        await seedConnectedAccount(admin.id, kid.id)
        const g = await seedGroup(admin.id)
        await addMember(g, admin.id, 'admin')
        return { reviewerId: admin.id, ownerId: owner.id, groupId: g, fixerId: kid.id, fixerUsername: kid.username }
      },
    },
    {
      name: 'a parent (via an admin child) approving their own fix',
      blocked: true,
      setup: async () => {
        const owner = await seedUser()
        const parent = await seedUser()
        const child = await seedUser()
        await seedConnectedAccount(parent.id, child.id)
        const g = await seedGroup(child.id)
        await addMember(g, child.id, 'admin')
        return { reviewerId: parent.id, ownerId: owner.id, groupId: g, fixerId: parent.id, fixerUsername: parent.username }
      },
    },
    {
      name: 'a parent (via an admin child) approving that same child\'s fix',
      blocked: true,
      setup: async () => {
        const owner = await seedUser()
        const parent = await seedUser()
        const child = await seedUser()
        await seedConnectedAccount(parent.id, child.id)
        const g = await seedGroup(child.id)
        await addMember(g, child.id, 'admin')
        return { reviewerId: parent.id, ownerId: owner.id, groupId: g, fixerId: child.id, fixerUsername: child.username }
      },
    },
    {
      name: 'a parent (via an admin child) approving an unrelated fixer',
      blocked: false,
      setup: async () => {
        const owner = await seedUser()
        const parent = await seedUser()
        const child = await seedUser()
        const fixer = await seedUser()
        await seedConnectedAccount(parent.id, child.id)
        const g = await seedGroup(child.id)
        await addMember(g, child.id, 'admin')
        return { reviewerId: parent.id, ownerId: owner.id, groupId: g, fixerId: fixer.id, fixerUsername: fixer.username }
      },
    },
    {
      name: "the owner approving their own child's fix",
      blocked: false,
      setup: async () => {
        const owner = await seedUser()
        const kid = await seedUser()
        await seedConnectedAccount(owner.id, kid.id)
        return { reviewerId: owner.id, ownerId: owner.id, groupId: null, fixerId: kid.id, fixerUsername: kid.username }
      },
    },
    {
      name: "a parent approving their own fix on their child's post",
      blocked: false,
      setup: async () => {
        const parent = await seedUser()
        const child = await seedUser()
        await seedConnectedAccount(parent.id, child.id)
        return { reviewerId: parent.id, ownerId: child.id, groupId: null, fixerId: parent.id, fixerUsername: parent.username }
      },
    },
  ]

  for (const c of cases) {
    it(`${c.blocked ? 'blocks' : 'allows'} ${c.name} (approve RPC)`, async () => {
      const { reviewerId, ownerId, groupId, fixerId } = await c.setup()
      const postId = await seedZeroRewardPendingPost(ownerId, groupId, fixerId)
      const { error } = await getAuthenticatedClient(reviewerId).rpc('review_submitted_fix_atomic' as any, {
        p_post_id: postId,
        p_approve: true,
        p_rejection_reason: null,
      })
      const state = await queryOne<{ fixed: boolean; fixed_by: string | null }>('SELECT fixed, fixed_by FROM posts WHERE id = $1', [postId])
      if (c.blocked) {
        expect(error).not.toBeNull()
        expect(state).toMatchObject({ fixed: false, fixed_by: null })
      } else {
        expect(error).toBeNull()
        expect(state).toMatchObject({ fixed: true, fixed_by: fixerId })
      }
    })

    it(`${c.blocked ? 'blocks' : 'allows'} ${c.name} (close-issue RPC naming the fixer)`, async () => {
      const { reviewerId, ownerId, groupId, fixerId, fixerUsername } = await c.setup()
      const postId = await seedZeroRewardPendingPost(ownerId, groupId, fixerId)
      const { error } = await getAuthenticatedClient(reviewerId).rpc('close_issue_atomic' as any, {
        p_post_id: postId,
        p_fixer_username: fixerUsername,
      })
      const state = await queryOne<{ fixed: boolean }>('SELECT fixed FROM posts WHERE id = $1', [postId])
      if (c.blocked) {
        expect(error).not.toBeNull()
        expect(state?.fixed).toBe(false)
      } else {
        expect(error).toBeNull()
        expect(state?.fixed).toBe(true)
      }
    })

    it(`${c.blocked ? 'flags' : 'does not flag'} ${c.name} (isSelfDealingReview)`, async () => {
      const { reviewerId, ownerId, groupId, fixerId } = await c.setup()
      const service = getServiceClient() as any
      const access = await authorizePostReview(service, reviewerId, { user_id: ownerId, group_id: groupId })
      expect(access.allowed).toBe(true)
      expect(await isSelfDealingReview(service, reviewerId, access, fixerId)).toBe(c.blocked)
    })
  }

  it('blocks a group admin paying themselves on an owner-less group post (NULL-safe)', async () => {
    const admin = await seedUser()
    const g = await seedGroup(admin.id)
    await addMember(g, admin.id, 'admin')
    const postId = crypto.randomUUID()
    await queryDB(
      `INSERT INTO posts (id, title, description, reward, fixed, user_id, group_id, under_review, submitted_fix_by_id, submitted_fix_at)
       VALUES ($1, 'Ownerless', 'Ownerless', 0, false, NULL, $2, true, $3, now())`,
      [postId, g, admin.id]
    )
    createdPosts.push(postId)

    const client = getAuthenticatedClient(admin.id)
    const approve = await client.rpc('review_submitted_fix_atomic' as any, { p_post_id: postId, p_approve: true, p_rejection_reason: null })
    expect(approve.error).not.toBeNull()
    const close = await client.rpc('close_issue_atomic' as any, { p_post_id: postId, p_fixer_username: admin.username })
    expect(close.error).not.toBeNull()
    expect((await postState(postId))?.fixed).toBe(false)

    const service = getServiceClient() as any
    const access = await authorizePostReview(service, admin.id, { user_id: null, group_id: g })
    expect(access).toMatchObject({ allowed: true, via: 'group_admin' })
    expect(await isSelfDealingReview(service, admin.id, access, admin.id)).toBe(true)
  })

  describe('anonymous fixes (the reviewer could have submitted it logged out)', () => {
    async function seedAnonymousPendingPost(ownerId: string, groupId: string | null) {
      const id = crypto.randomUUID()
      await queryDB(
        `INSERT INTO posts (id, title, description, reward, fixed, user_id, group_id, under_review,
           submitted_fix_by_id, submitted_fix_at, anonymous_claim_token_hash)
         VALUES ($1, 'Anon fix', 'Anon fix', 0, false, $2, $3, true, NULL, now(), 'test-claim-hash')`,
        [id, ownerId, groupId]
      )
      createdPosts.push(id)
      return id
    }

    it("blocks a group admin approving an anonymous fix on someone else's post", async () => {
      const owner = await seedUser()
      const admin = await seedUser()
      const g = await seedGroup(admin.id)
      await addMember(g, admin.id, 'admin')
      const postId = await seedAnonymousPendingPost(owner.id, g)

      const { error } = await getAuthenticatedClient(admin.id).rpc('review_submitted_fix_atomic' as any, {
        p_post_id: postId, p_approve: true, p_rejection_reason: null,
      })
      expect(error).not.toBeNull()
      expect((await postState(postId))?.fixed).toBe(false)

      const service = getServiceClient() as any
      const access = await authorizePostReview(service, admin.id, { user_id: owner.id, group_id: g })
      expect(await isSelfDealingReview(service, admin.id, access, null)).toBe(true)
    })

    it('blocks a parent (via an admin child) approving an anonymous fix', async () => {
      const owner = await seedUser()
      const parent = await seedUser()
      const child = await seedUser()
      await seedConnectedAccount(parent.id, child.id)
      const g = await seedGroup(child.id)
      await addMember(g, child.id, 'admin')
      const postId = await seedAnonymousPendingPost(owner.id, g)

      const { error } = await getAuthenticatedClient(parent.id).rpc('review_submitted_fix_atomic' as any, {
        p_post_id: postId, p_approve: true, p_rejection_reason: null,
      })
      expect(error).not.toBeNull()
      expect((await postState(postId))?.fixed).toBe(false)
    })

    it('still lets the owner approve an anonymous fix', async () => {
      const owner = await seedUser()
      const postId = await seedAnonymousPendingPost(owner.id, null)

      const { error } = await getAuthenticatedClient(owner.id).rpc('review_submitted_fix_atomic' as any, {
        p_post_id: postId, p_approve: true, p_rejection_reason: null,
      })
      expect(error).toBeNull()
      expect((await postState(postId))?.fixed).toBe(true)
    })

    it('still lets a group admin send an anonymous fix back', async () => {
      const owner = await seedUser()
      const admin = await seedUser()
      const g = await seedGroup(admin.id)
      await addMember(g, admin.id, 'admin')
      const postId = await seedAnonymousPendingPost(owner.id, g)

      const { error } = await getAuthenticatedClient(admin.id).rpc('review_submitted_fix_atomic' as any, {
        p_post_id: postId, p_approve: false, p_rejection_reason: null,
      })
      expect(error).toBeNull()
      expect((await postState(postId))?.under_review).toBe(false)
    })
  })

  it("lets a reviewer who is both a group admin and the owner's parent pay their other child (owner rights win)", async () => {
    const parent = await seedUser()
    const ownerKid = await seedUser()
    const fixerKid = await seedUser()
    await seedConnectedAccount(parent.id, ownerKid.id)
    await seedConnectedAccount(parent.id, fixerKid.id)
    const g = await seedGroup(parent.id)
    await addMember(g, parent.id, 'admin')
    const postId = await seedPendingPost(ownerKid.id, g, fixerKid.id, 0)

    const service = getServiceClient() as any
    const access = await authorizePostReview(service, parent.id, { user_id: ownerKid.id, group_id: g })
    expect(access).toMatchObject({ allowed: true, via: 'parent_of_owner' })
    expect(await isSelfDealingReview(service, parent.id, access, fixerKid.id)).toBe(false)

    const { error } = await getAuthenticatedClient(parent.id).rpc('review_submitted_fix_atomic' as any, {
      p_post_id: postId, p_approve: true, p_rejection_reason: null,
    })
    expect(error).toBeNull()
    expect((await postState(postId))?.fixed).toBe(true)
  })

  it('keeps ganamos_review_is_self_dealing off-limits to user sessions', async () => {
    const u = await seedUser()
    const { error } = await getAuthenticatedClient(u.id).rpc('ganamos_review_is_self_dealing' as any, {
      p_owner_id: u.id,
      p_fixer_id: u.id,
    })
    expect(error).not.toBeNull()
  })
})
