/**
 * Integration: fixers reminding reviewers about a fix waiting for review
 * (20261122020000_fix_review_reminders + app/actions/review-reminder-actions.ts),
 * against the real local database.
 *
 * Limits (enforced atomically in record_fix_review_reminder, counted from the
 * server-only fix_review_reminders log): not until the fix has waited 1 hour,
 * then at most once every 24 hours, max 3 in any 30 days. Nothing a user can
 * edit on the post resets them. Only the submitter (or the parent of a child
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

/** Move this post's logged reminders back in time (test-only, as postgres) */
const ageLastReminder = (postId: string, hours: number) =>
  queryDB(`UPDATE fix_review_reminders SET created_at = created_at - make_interval(hours => $2) WHERE post_id = $1`, [postId, hours])

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

  it("can't be reset by a group admin fixer editing the post (submitted_fix_at, display counters)", async () => {
    const owner = await seedUser()
    const adminFixer = await seedUser()
    const g = crypto.randomUUID()
    const code = g.replace(/-/g, '').slice(0, 10)
    await queryDB('INSERT INTO groups (id, name, created_by, invite_code, group_code) VALUES ($1, $2, $3, $4, $5)', [g, 'G', adminFixer.id, `inv${code}`, `g${code}`])
    createdGroups.push(g)
    await queryDB("INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'admin', 'approved')", [g, adminFixer.id])
    const postId = await seedPending(owner.id, adminFixer.id, 2, g)

    expect((await record(postId, adminFixer.id)).data).toMatchObject({ ok: true, count: 1 })

    // As an admin they CAN rewrite the post's columns (RLS lets admins edit group posts)...
    const { error: editError } = await getAuthenticatedClient(adminFixer.id)
      .from('posts')
      .update({ submitted_fix_at: '2020-01-01 00:00:00', review_reminder_count: 0, review_reminder_last_at: '2020-01-01T00:00:00Z' } as any)
      .eq('id', postId)
    expect(editError).toBeNull()

    // ...but the limit comes from the log, so it still holds
    expect((await record(postId, adminFixer.id)).data).toMatchObject({ ok: false, reason: 'too_soon' })
  })

  it('ignores the display counters on the post', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    await queryDB(`UPDATE posts SET review_reminder_count = 99 WHERE id = $1`, [postId])

    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 1, remaining: 2 })
  })

  it('counts the 3-reminder cap over 30 days', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 24 * 40)
    for (let i = 0; i < 3; i++) {
      expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true })
      await ageLastReminder(postId, 25)
    }
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: false, reason: 'limit_reached' })
    // Once they're older than 30 days they no longer count
    await ageLastReminder(postId, 24 * 30)
    expect((await record(postId, fixer.id)).data).toMatchObject({ ok: true, count: 1 })
  })

  it('keeps the reminder log unreadable and unwritable from user sessions', async () => {
    const owner = await seedUser()
    const fixer = await seedUser()
    const postId = await seedPending(owner.id, fixer.id, 2)
    await record(postId, fixer.id)
    const client = getAuthenticatedClient(fixer.id)

    const read = await client.from('fix_review_reminders' as any).select('id').eq('post_id', postId)
    expect(read.data ?? []).toHaveLength(0)
    await client.from('fix_review_reminders' as any).delete().eq('post_id', postId)
    await client.from('fix_review_reminders' as any).insert({ post_id: postId, submitter_id: fixer.id } as any)
    const rows = await queryDB('SELECT id FROM fix_review_reminders WHERE post_id = $1', [postId])
    expect(rows).toHaveLength(1)
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
