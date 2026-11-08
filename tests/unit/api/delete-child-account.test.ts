/**
 * POST /api/delete-child-account (app/api/delete-child-account/route.ts)
 *
 * The parent's session cannot update the child's profile under RLS (the update silently
 * matches zero rows), so the soft delete must use the admin client, and the route must
 * report failure when no row was actually updated (instead of telling the parent the
 * child was deleted).
 *
 * Uses the stateful fake DB, whose session client models the "update own profile only"
 * RLS policy (tests/unit/helpers/fake-supabase-db.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const routeClient = vi.hoisted(() => ({ current: null as any }))
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(() => routeClient.current),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({})) }))

import { POST } from '@/app/api/delete-child-account/route'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

const PARENT_ID = 'parent-1'
const CHILD_ID = 'child-1'
const STRANGER_ID = 'stranger-1'

let db: FakeSupabase
const child = () => db.row('profiles', CHILD_ID)!

function setup(signedInAs: string | null = PARENT_ID, extra: Record<string, any[]> = {}) {
  db = createFakeSupabase({
    profiles: [
      { id: PARENT_ID, email: 'parent@example.com', status: 'active', balance: 0 },
      { id: CHILD_ID, email: 'kid-123@ganamos.app', status: 'active', balance: 300, deleted_at: null },
      { id: STRANGER_ID, email: 'stranger@example.com', status: 'active' },
    ],
    connected_accounts: [{ id: 'conn-1', primary_user_id: PARENT_ID, connected_user_id: CHILD_ID }],
    ...extra,
  }).install()
  db.user = signedInAs ? { id: signedInAs } : null
  routeClient.current = db.sessionClient
  return db
}

const request = (body: Record<string, unknown>) =>
  new Request('http://localhost:3000/api/delete-child-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.SUPABASE_SECRET_API_KEY = 'test-service-key'
})

describe('POST /api/delete-child-account', () => {
  it('soft-deletes the child profile with the admin client and removes the connection', async () => {
    setup()

    const response = await POST(request({ childAccountId: CHILD_ID }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true })
    expect(child()).toMatchObject({ status: 'deleted', deleted_by: PARENT_ID })
    expect(child().deleted_at).toBeTruthy()
    expect(db.ops(o => o.table === 'profiles' && o.op === 'update')).toEqual([
      expect.objectContaining({ role: 'admin', rowsAffected: 1, filters: [['eq', 'id', CHILD_ID]] }),
    ])
    expect(db.rows('connected_accounts')).toHaveLength(0)
    // Data is preserved (soft delete), balance untouched
    expect(child().balance).toBe(300)
  })

  it('would not work through the parent session: RLS lets a user update only their own profile', async () => {
    // Sanity check of the premise, so the admin-client assertion above means something.
    setup()
    const { data } = await db.sessionClient.from('profiles').update({ status: 'deleted' }).eq('id', CHILD_ID).select('id')
    expect(data).toEqual([])
    expect(child().status).toBe('active')
  })

  it('returns 500 (not success) when no profile row was updated', async () => {
    setup()
    // The child profile disappears between the checks and the update
    db.beforeOp = op => {
      if (op.table === 'profiles' && op.op === 'update') db.tables.profiles = db.tables.profiles.filter(p => p.id !== CHILD_ID)
    }

    const response = await POST(request({ childAccountId: CHILD_ID }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to delete profile' })
    // The connection is kept when the delete did not happen
    expect(db.rows('connected_accounts')).toHaveLength(1)
  })

  it('returns 500 when the soft delete errors', async () => {
    setup()
    db.failOp = op => (op.table === 'profiles' && op.op === 'update' ? { message: 'db down' } : null)

    const response = await POST(request({ childAccountId: CHILD_ID }))

    expect(response.status).toBe(500)
    expect(child().status).toBe('active')
    expect(db.rows('connected_accounts')).toHaveLength(1)
  })

  it('rejects an unauthenticated caller', async () => {
    setup(null)

    const response = await POST(request({ childAccountId: CHILD_ID }))

    expect(response.status).toBe(401)
    expect(child().status).toBe('active')
  })

  it("rejects deleting someone else's child account", async () => {
    setup(STRANGER_ID)

    const response = await POST(request({ childAccountId: CHILD_ID }))

    expect(response.status).toBe(403)
    expect(child().status).toBe('active')
    expect(db.ops(o => o.op === 'update')).toHaveLength(0)
  })

  it('refuses to delete a connected account that is not a child (@ganamos.app) account', async () => {
    setup(PARENT_ID, {
      connected_accounts: [{ id: 'conn-2', primary_user_id: PARENT_ID, connected_user_id: STRANGER_ID }],
    })

    const response = await POST(request({ childAccountId: STRANGER_ID }))

    expect(response.status).toBe(400)
    expect(db.row('profiles', STRANGER_ID)!.status).toBe('active')
  })

  it('requires childAccountId', async () => {
    setup()

    const response = await POST(request({}))

    expect(response.status).toBe(400)
    expect(db.log).toHaveLength(0)
  })
})
