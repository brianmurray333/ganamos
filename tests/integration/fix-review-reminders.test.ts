/**
 * Integration: fixers reminding reviewers about a fix waiting for review
 * (20261122020000_fix_review_reminders + app/actions/review-reminder-actions.ts),
 * against the real local database.
 *
 * Limits (enforced atomically in record_fix_review_reminder): not until the fix
 * has waited 1 hour, then at most once every 24 hours, max 3 per submission;
 * a new submission starts fresh. Only the submitter (or the parent of a child
 * submitter) may send one, and emails go only to the post's reviewers.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { seedUser, seedConnectedAccount, queryDB, queryOne } from './helpers'
import { getAuthenticatedClient, getServiceClient } from './helpers/db-client'

// The signed-in user for the server action (the admin client stays real)
let sessionUser: { id: string; email?: string } | null = null
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn(), delete: vi.fn() })),
}))
vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>()
  return {
    ...actual,
    createServerSupabaseClient: (opts?: any) =>
      opts?.supabaseKey
        ? actual.createServerSupabaseClient(opts)
        : ({ auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) } } as any),
  }
})
const sentEmails: Array<{ toEmail: string; postId: string }> = []
vi.mock('@/lib/transaction-emails', () => ({
  sendFixReviewReminderEmail: vi.fn(async (p: { toEmail: string; postId: string }) => {
    sentEmails.push({ toEmail: p.toEmail, postId: p.postId })
    return { success: true }
  }),
}))

import { sendReviewReminderAction } from '@/app/actions/review-reminder-actions'

const createdPosts: string[] = []
const createdGroups: string[] = []

beforeEach(() => {
  sentEmails.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  if (createdPosts.length) await queryDB('DELETE FROM posts WHERE id = ANY($1::uuid[])', [createdPosts.splice(0)])
  if (createdGroups.length) {
    const ids = createdGroups.splice(0)
    await queryDB('DELETE FROM group_members WHERE group_id = ANY($1::uuid[])', [ids])
    await queryDB('DELETE FROM groups WHERE id = ANY($1::uuid[])', [ids])
  }
  sessionUser = null
})

/** A post with a fix awaiting review, submitted `hoursAgo` hours ago (UTC, no zone, like production) */
async function seedPending(ownerId: string, fixerId: string, hoursAgo = 2, groupId: string | null = null) {
  const id = crypto.randomUUID()
  await queryDB(
    `INSERT INTO posts (id, title, description, reward, fixed, user_id, group_id, under_review,
       submitted_fix_by_id, submitted_fix_by_name, submitted_fix_at)
     VALUES ($1, 'Take out the recycling', 'Take out the recycling', 500, false, $2, $3, true, $4, 'Mia',
       (now() AT TIME ZONE 'UTC') - make_interval(hours => $5))`,
    [id, ownerId, groupId, fixerId, hoursAgo]
  )
  createdPosts.push(id)
  return id
}

const record = (postId: string, senderId: string) =>
  getServiceClient().rpc('record_fix_review_reminder' as any, { p_post_id: postId, p_sender_id: senderId })

/** Move the last reminder back in time (test-only, as postgres) */
const ageLastReminder = (postId: string, hours: number) =>
  queryDB(`UPDATE posts SET review_reminder_last_at = now() - make_interval(hours => $2) WHERE id = $1`, [postId, hours])

describe('record_fix_review_reminder (database limits)', () => {
  it('refuses before the fix has waited an hour, and says when', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 0)

    const { data } = await record(postId, fixer.id)
    expect(data).toMatchObject({ ok: false, reason: 'too_soon' })
    const nextAt = new Date((data as any).next_allowed_at).getTime()
    expect(nextAt - Date.now()).toBeGreaterThan(55 * 60 * 1000)
    expect(nextAt - Date.now()).toBeLessThan(61 * 60 * 1000)
  })

  it('allows one, then not again for 24 hours, up to 3 per submission', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)

    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 1, remaining: 2 })
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: false, reason: 'too_soon' })

    await ageLastReminder(postId, 23)
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: false, reason: 'too_soon' })

    await ageLastReminder(postId, 25)
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 2, remaining: 1 })
    await ageLastReminder(postId, 25)
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 3, remaining: 0 })
    await ageLastReminder(postId, 48)
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: false, reason: 'limit_reached' })
  })

  it('sends exactly one reminder when many requests race', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)

    const results = await Promise.all(Array.from({ length: 8 }, () => record(postId, fixer.id)))
    expect(results.filter((r) => (r.data as any)?.ok === true)).toHaveLength(1)
    expect((await queryOne<{ review_reminder_count: number }>('SELECT review_reminder_count FROM posts WHERE id = $1', [postId]))?.review_reminder_count).toBe(1)
  })

  it('starts fresh for a new submission of the same post', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    await queryDB(
      `UPDATE posts SET review_reminder_count = 3, review_reminder_for = submitted_fix_at, review_reminder_last_at = now() - interval '48 hours' WHERE id = $1`,
      [postId]
    )
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: false, reason: 'limit_reached' })

    // Rejected and resubmitted: a new submitted_fix_at
    await queryDB(`UPDATE posts SET submitted_fix_at = (now() AT TIME ZONE 'UTC') - interval '3 hours' WHERE id = $1`, [postId])
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 1 })
  })

  it('ignores a negative counter preset by the submitter', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    await queryDB(`UPDATE posts SET review_reminder_count = -100, review_reminder_for = submitted_fix_at WHERE id = $1`, [postId])

    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 1, remaining: 2 })
  })

  it('refuses anyone but the submitter, and posts not under review', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const other = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)

    expect((await record(postId, other.id)).data).toMatchObject({ ok: false, reason: 'not_submitter' })
    await queryDB('UPDATE posts SET under_review = false WHERE id = $1', [postId])
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: false, reason: 'not_pending' })
  })

  it('cannot be called from a user session', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)

    const { error } = await getAuthenticatedClient(fixer.id).rpc('record_fix_review_reminder' as any, {
      p_post_id: postId,
      p_sender_id: fixer.id,
    })
    expect(error).not.toBeNull()
    expect((await queryOne<{ review_reminder_count: number }>('SELECT review_reminder_count FROM posts WHERE id = $1', [postId]))?.review_reminder_count).toBe(0)
  })
})

describe('sendReviewReminderAction', () => {
  it('lets the submitter remind, and emails the post owner', async () => {
    const owner = await seedUser({ email: `owner-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    sessionUser = { id: fixer.id, email: fixer.email }

    const result = await sendReviewReminderAction(postId)

    expect(result).toMatchObject({ success: true, remaining: 2, emailed: 1 })
    expect(sentEmails).toEqual([{ toEmail: owner.email.toLowerCase(), postId }])
  })

  it('emails group admins too, and the parent of a child owner (child accounts have no inbox)', async () => {
    const parent = await seedUser({ email: `parent-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const child = await seedUser({ email: `child-${crypto.randomUUID().slice(0, 8)}@ganamos.app` })
    await seedConnectedAccount(parent.id, child.id)
    const admin = await seedUser({ email: `admin-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const fixer = await seedUser()
    const g = crypto.randomUUID()
    const code = g.replace(/-/g, '').slice(0, 10)
    await queryDB('INSERT INTO groups (id, name, created_by, invite_code, group_code) VALUES ($1, $2, $3, $4, $5)', [g, 'Family', admin.id, `inv${code}`, `g${code}`])
    createdGroups.push(g)
    await queryDB("INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'admin', 'approved')", [g, admin.id])
    const postId = await seedPending(child.id, fixer.id, 2, g)
    sessionUser = { id: fixer.id, email: fixer.email }

    const result = await sendReviewReminderAction(postId)

    expect(result.success).toBe(true)
    expect(sentEmails.map((e) => e.toEmail).sort()).toEqual([admin.email.toLowerCase(), parent.email.toLowerCase()].sort())
  })

  it('lets a parent remind for a child who submitted the fix', async () => {
    const owner = await seedUser({ email: `owner-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const parent = await seedUser()
    const kid = await seedUser()
    await seedConnectedAccount(parent.id, kid.id)
    const postId = await seedPending(owner.id, kid.id, 2)
    sessionUser = { id: parent.id, email: parent.email }

    expect((await sendReviewReminderAction(postId)).success).toBe(true)
    expect(sentEmails).toHaveLength(1)
  })

  it('refuses someone who did not submit the fix, and sends nothing', async () => {
    const owner = await seedUser({ email: `owner-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const fixer = await seedUser()
    const stranger = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    sessionUser = { id: stranger.id, email: stranger.email }

    const result = await sendReviewReminderAction(postId)

    expect(result.success).toBe(false)
    expect(sentEmails).toHaveLength(0)
    expect((await queryOne<{ review_reminder_count: number }>('SELECT review_reminder_count FROM posts WHERE id = $1', [postId]))?.review_reminder_count).toBe(0)
  })

  it('refuses when signed out', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    sessionUser = null

    expect(await sendReviewReminderAction(postId)).toEqual({ success: false, error: 'Not authenticated' })
    expect(sentEmails).toHaveLength(0)
  })

  it('reports the wait and sends nothing when rate-limited', async () => {
    const owner = await seedUser({ email: `owner-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    sessionUser = { id: fixer.id, email: fixer.email }

    expect((await sendReviewReminderAction(postId)).success).toBe(true)
    sentEmails.length = 0
    const second = await sendReviewReminderAction(postId)

    expect(second.success).toBe(false)
    expect(second.success === false && second.nextAllowedAt).toBeTruthy()
    expect(sentEmails).toHaveLength(0)
  })

  it('never emails the sender themselves', async () => {
    const parentOwner = await seedUser({ email: `po-${crypto.randomUUID().slice(0, 8)}@example.com` })
    const kid = await seedUser()
    await seedConnectedAccount(parentOwner.id, kid.id)
    // The parent owns the post and reminds on behalf of their kid, the fixer
    const postId = await seedPending(parentOwner.id, kid.id, 2)
    sessionUser = { id: parentOwner.id, email: parentOwner.email }

    expect((await sendReviewReminderAction(postId)).success).toBe(true)
    expect(sentEmails).toHaveLength(0)
  })
})
