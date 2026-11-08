/**
 * Pickleball wagers: a settled game can't be re-armed with players' old
 * consent, changing the wager needs fresh consent, and a game settles once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeDb } from '@/tests/helpers/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase', () => ({ createServerSupabaseClient: vi.fn(() => state.db.client()) }))
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }))

import { POST as statePOST } from '@/app/api/game/pickleball/state/route'
import { POST as completePOST } from '@/app/api/game/pickleball/complete/route'

const GAME = 'game-1'
const HOST_DEVICE = 'dev-host'
const GUEST_DEVICE = 'dev-guest'

function seed(game: Record<string, any> = {}) {
  state.db = new FakeDb({
    pickleball_games: [{
      id: GAME,
      host_device_id: HOST_DEVICE,
      host_user_id: 'host-user',
      status: 'playing',
      wager_amount: 100,
      wager_status: 'active',
      players: [
        { deviceId: HOST_DEVICE, userId: 'host-user', side: 'left', petName: 'H', wagerAccepted: true },
        { deviceId: GUEST_DEVICE, userId: 'guest-user', side: 'right', petName: 'G', wagerAccepted: true },
      ],
      ...game,
    }],
    profiles: [
      { id: 'host-user', balance: 5000 },
      { id: 'guest-user', balance: 5000 },
    ],
    transactions: [],
    activities: [],
  })
  state.db.rpcHandlers.atomic_transfer = () => ({ data: { success: true } })
}

const req = (url: string, body: any) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const setWager = (amount: number) =>
  statePOST(req('http://localhost/api/game/pickleball/state', { gameId: GAME, deviceId: HOST_DEVICE, action: 'set_wager', wagerAmount: amount }))
const complete = () =>
  completePOST(req('http://localhost/api/game/pickleball/complete', { gameId: GAME, deviceId: HOST_DEVICE, scoreLeft: 11, scoreRight: 3, winnerSide: 'left' }))
const transfers = () => state.db.rpcCalls.filter((c: any) => c.name === 'atomic_transfer')

describe('pickleball wagers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('settles a played game once', async () => {
    seed()
    await complete()
    expect(transfers()).toHaveLength(1)
    expect(transfers()[0].args).toMatchObject({ p_sender_id: 'guest-user', p_receiver_id: 'host-user', p_amount: 100 })
  })

  it('concurrent completions settle once', async () => {
    seed()
    await Promise.all([complete(), complete(), complete()])
    expect(transfers()).toHaveLength(1)
  })

  it('a completed (settled) game cannot be re-armed with a new wager', async () => {
    seed()
    await complete()

    const res = await setWager(1000)
    expect(res.status).toBe(409)
    expect(state.db.row('pickleball_games', GAME)).toMatchObject({ status: 'completed', wager_amount: 100 })

    await complete()
    expect(transfers()).toHaveLength(1)
  })

  it("changing the wager in the lobby clears the other players' consent", async () => {
    seed({ status: 'lobby' })

    const res = await setWager(1000)
    expect(res.status).toBe(200)
    const players = state.db.row('pickleball_games', GAME).players
    expect(players[0].wagerAccepted).toBe(true)
    expect(players[1].wagerAccepted).toBeUndefined()
  })

  it('does not settle a wager for a game that was never played', async () => {
    seed({ status: 'lobby' })
    await complete()
    expect(transfers()).toHaveLength(0)
  })
})
