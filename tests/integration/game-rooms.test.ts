/**
 * Game rooms with bets, against a real database: NextRequest -> route -> SQL.
 * Every test checks where the sats are, not just the response.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { GET as listGET, POST as createPOST } from '@/app/api/game/rooms/route'
import { GET as stateGET, POST as roomPOST } from '@/app/api/game/rooms/[roomId]/route'
import { GET as configGET } from '@/app/api/device/config/route'
import { hashGameSecret } from '@/lib/game-rooms'
import { seedUser, seedDevice, seedConnectedAccount, queryDB, queryOne } from './helpers/test-isolation'

type Player = { userId: string; deviceId: string; secret: string; petName: string }

const MAC = (n: number) => `AA:BB:CC:DD:EE:${n.toString(16).padStart(2, '0').toUpperCase()}`

async function seedPlayer(opts: { balance?: number; petName?: string } = {}): Promise<Player> {
  const user = await seedUser({ balance: opts.balance ?? 1000 })
  const petName = opts.petName ?? `Pet${user.id.slice(0, 4)}`
  const device = await seedDevice(user.id, { petName })
  const secret = randomBytes(32).toString('hex')
  await queryDB(`UPDATE devices SET game_secret_hash = $1 WHERE id = $2`, [hashGameSecret(secret), device.id])
  return { userId: user.id, deviceId: device.id, secret, petName }
}

/** Two users who can see each other's rooms: parent and child. */
async function family(n: number, balance = 1000): Promise<Player[]> {
  const players: Player[] = []
  for (let i = 0; i < n; i++) players.push(await seedPlayer({ balance, petName: `Pet${i}` }))
  for (let i = 1; i < n; i++) await seedConnectedAccount(players[0].userId, players[i].userId)
  return players
}

function headers(p: Player, secret = p.secret) {
  return { 'Content-Type': 'application/json', 'X-Device-Id': p.deviceId, 'X-Device-Secret': secret }
}

async function create(p: Player, game: string, bet: number, extra: Record<string, unknown> = {}) {
  const res = await createPOST(new NextRequest('http://localhost/api/game/rooms', {
    method: 'POST', headers: headers(p), body: JSON.stringify({ game, bet, mac: MAC(1), ...extra }),
  }))
  return { status: res.status, body: await res.json() }
}

async function act(p: Player, roomId: string, action: string, extra: Record<string, unknown> = {}) {
  const res = await roomPOST(
    new NextRequest(`http://localhost/api/game/rooms/${roomId}`, {
      method: 'POST', headers: headers(p), body: JSON.stringify({ action, mac: MAC(2), ...extra }),
    }),
    { params: Promise.resolve({ roomId }) }
  )
  return { status: res.status, body: await res.json() }
}

async function state(p: Player, roomId: string) {
  const res = await stateGET(new NextRequest(`http://localhost/api/game/rooms/${roomId}`, { headers: headers(p) }), {
    params: Promise.resolve({ roomId }),
  })
  return { status: res.status, body: await res.json() }
}

async function list(p: Player, game?: string) {
  const res = await listGET(new NextRequest(`http://localhost/api/game/rooms${game ? `?game=${game}` : ''}`, { headers: headers(p) }))
  return { status: res.status, body: await res.json() }
}

async function balance(userId: string): Promise<number> {
  const row = await queryOne<{ balance: number }>(`SELECT balance FROM profiles WHERE id = $1`, [userId])
  return row.balance
}

async function totalBalance(players: Player[]): Promise<number> {
  let t = 0
  for (const p of players) t += await balance(p.userId)
  return t
}

/** Pretend time has passed for a room. */
async function age(roomId: string, column: string, interval: string) {
  await queryDB(`UPDATE game_rooms SET ${column} = now() - interval '${interval}' WHERE id = $1`, [roomId])
}

describe('game rooms: authentication', () => {
  it('refuses a missing or wrong secret, and the device id alone', async () => {
    const [a] = await family(1)
    const noSecret = await createPOST(new NextRequest('http://localhost/api/game/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': a.deviceId }, body: JSON.stringify({ game: 'flappy', bet: 10 }),
    }))
    expect(noSecret.status).toBe(401)
    const wrong = await createPOST(new NextRequest('http://localhost/api/game/rooms', {
      method: 'POST', headers: headers(a, randomBytes(32).toString('hex')), body: JSON.stringify({ game: 'flappy', bet: 10 }),
    }))
    expect(wrong.status).toBe(401)
    expect(await balance(a.userId)).toBe(1000)
  })

  it('a pet claims its secret through device config; the first claim sticks until it pairs again', async () => {
    const user = await seedUser()
    const device = await seedDevice(user.id)
    const fetchConfig = async (h: Record<string, string>) => {
      const res = await configGET(new NextRequest('http://localhost/api/device/config', { headers: h }))
      return (await res.json()).config
    }
    const mine = randomBytes(32).toString('hex')
    const thief = randomBytes(32).toString('hex')

    // Old firmware doesn't claim: nothing stored
    expect((await fetchConfig({ 'X-Device-Id': device.id })).gameSecretAccepted).toBeUndefined()

    expect((await fetchConfig({ 'X-Device-Id': device.id, 'X-Game-Secret-Claim': mine })).gameSecretAccepted).toBe(true)
    // Retrying the same claim (a lost response) is fine
    expect((await fetchConfig({ 'X-Device-Id': device.id, 'X-Game-Secret-Claim': mine })).gameSecretAccepted).toBe(true)
    // Someone else holding the device id can't replace it
    expect((await fetchConfig({ 'X-Device-Id': device.id, 'X-Game-Secret-Claim': thief })).gameSecretAccepted).toBe(false)
    const stored = await queryOne<{ game_secret_hash: string }>(`SELECT game_secret_hash FROM devices WHERE id = $1`, [device.id])
    expect(stored.game_secret_hash).toBe(hashGameSecret(mine))
    // The config response never carries a secret
    expect(JSON.stringify(await fetchConfig({ 'X-Device-Id': device.id }))).not.toContain(mine)

    // Pairing again (one-shot pairing code) replaces it
    const fresh = randomBytes(32).toString('hex')
    await queryDB(`UPDATE devices SET pairing_code = 'PAIR42' WHERE id = $1`, [device.id])
    expect((await fetchConfig({ 'X-Pairing-Code': 'PAIR42', 'X-Game-Secret-Claim': fresh })).gameSecretAccepted).toBe(true)
    const rotated = await queryOne<{ game_secret_hash: string }>(`SELECT game_secret_hash FROM devices WHERE id = $1`, [device.id])
    expect(rotated.game_secret_hash).toBe(hashGameSecret(fresh))
  })
})

describe('game rooms: who can join', () => {
  it('family and shared groups see a room; strangers do not, and cannot join by id', async () => {
    const [host, kid] = await family(2)
    const stranger = await seedPlayer()
    const groupie = await seedPlayer()
    const groupId = crypto.randomUUID()
    await queryDB(`INSERT INTO groups (id, name, created_by, group_code, invite_code) VALUES ($1, 'G', $2, $3, $4)`, [groupId, host.userId, groupId.slice(0, 8), groupId.slice(-8)])
    await queryDB(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'admin', 'approved'), ($1, $3, 'member', 'approved')`,
      [groupId, host.userId, groupie.userId]
    )

    const room = (await create(host, 'flappy', 10)).body.room
    expect((await list(kid, 'flappy')).body.rooms.map((r: any) => r.roomId)).toContain(room.roomId)
    expect((await list(groupie)).body.rooms.map((r: any) => r.roomId)).toContain(room.roomId)
    expect((await list(stranger)).body.rooms.map((r: any) => r.roomId)).not.toContain(room.roomId)

    const sneak = await act(stranger, room.roomId, 'join')
    expect(sneak.status).toBe(404)
    expect(await balance(stranger.userId)).toBe(1000)
    expect((await state(stranger, room.roomId)).status).toBe(404)
  })

  it('room state never exposes device or account ids', async () => {
    const [host, kid] = await family(2)
    const room = (await create(host, 'pickleball', 10)).body.room
    const joined = await act(kid, room.roomId, 'join')
    const text = JSON.stringify(joined.body) + JSON.stringify((await state(host, room.roomId)).body)
    for (const id of [host.deviceId, kid.deviceId, host.userId, kid.userId]) expect(text).not.toContain(id)
    // Pickleball members do get MAC addresses for the radio link
    expect(joined.body.room.players.every((p: any) => typeof p.mac === 'string')).toBe(true)
  })
})

describe('game rooms: holding and returning bets', () => {
  it('holds the bet on create and join, returns it on leave', async () => {
    const [host, kid] = await family(2)
    const { status, body } = await create(host, 'flappy', 100)
    expect(status).toBe(200)
    expect(await balance(host.userId)).toBe(900)
    const roomId = body.room.roomId

    const joined = await act(kid, roomId, 'join')
    expect(joined.body.room.pot).toBe(200)
    expect(await balance(kid.userId)).toBe(900)

    const left = await act(kid, roomId, 'leave')
    expect(left.body.room.returned).toBe(100)
    expect(await balance(kid.userId)).toBe(1000)

    // Ledger: held then returned, both completed
    const rows = await queryDB<{ amount: number; status: string }>(
      `SELECT amount, status FROM transactions WHERE user_id = $1 ORDER BY created_at`, [kid.userId])
    expect(rows.map((r) => r.amount)).toEqual([-100, 100])
    expect(rows.every((r) => r.status === 'completed')).toBe(true)
  })

  it('refuses a bet the player cannot cover, including sats held by a pending withdrawal', async () => {
    const [host, kid] = await family(2, 120)
    await queryDB(
      `INSERT INTO transactions (user_id, type, amount, status, memo) VALUES ($1, 'withdrawal', 50, 'pending', 'test')`, [kid.userId])
    const room = (await create(host, 'flappy', 100)).body.room
    const res = await act(kid, room.roomId, 'join')
    expect(res.status).toBe(402)
    expect(await balance(kid.userId)).toBe(120)
    expect((await state(host, room.roomId)).body.room.players).toHaveLength(1)

    const poor = await create(kid, 'satcatcher', 500)
    expect(poor.status).toBe(402)
    expect((await queryDB(`SELECT 1 FROM game_rooms WHERE host_device_id = $1`, [kid.deviceId])).length).toBe(0)
  })

  it('host leaving closes the room and returns every bet', async () => {
    const players = await family(3)
    const room = (await create(players[0], 'satcatcher', 50)).body.room
    await act(players[1], room.roomId, 'join')
    await act(players[2], room.roomId, 'join')
    expect(await totalBalance(players)).toBe(2850)
    await act(players[0], room.roomId, 'leave')
    expect(await totalBalance(players)).toBe(3000)
    const r = await queryOne<{ status: string; void_reason: string }>(`SELECT status, void_reason FROM game_rooms WHERE id = $1`, [room.roomId])
    expect(r).toEqual({ status: 'void', void_reason: 'host_left' })
  })

  it('an open room that nobody starts expires and returns every bet', async () => {
    const [host, kid] = await family(2)
    const room = (await create(host, 'flappy', 10)).body.room
    await act(kid, room.roomId, 'join')
    await age(room.roomId, 'expires_at', '1 second')
    const s = await state(kid, room.roomId)
    expect(s.body.room.status).toBe('void')
    expect(s.body.room.voidReason).toBe('expired')
    expect(await balance(host.userId)).toBe(1000)
    expect(await balance(kid.userId)).toBe(1000)
  })

  it('a pet can be in one live room at a time', async () => {
    const [host, kid] = await family(2)
    const a = (await create(host, 'flappy', 10)).body.room
    expect((await create(host, 'satcatcher', 10)).status).toBe(409)
    const b = (await create(kid, 'satcatcher', 10)).body.room
    expect((await act(kid, a.roomId, 'join')).status).toBe(409)
    expect(await balance(kid.userId)).toBe(990)
    expect(b.roomId).toBeTruthy()
  })

  it('two joins racing for the last of a balance: only one is held', async () => {
    const parent = await seedPlayer()
    const kid = await seedPlayer({ balance: 100 })
    const other = await seedPlayer()
    await seedConnectedAccount(parent.userId, kid.userId)
    await seedConnectedAccount(parent.userId, other.userId)
    const r1 = (await create(parent, 'flappy', 100)).body.room
    const r2 = (await create(other, 'flappy', 100)).body.room
    const results = await Promise.all([act(kid, r1.roomId, 'join'), act(kid, r2.roomId, 'join')])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(await balance(kid.userId)).toBe(0)
  })
})

describe('game rooms: Flappy Pet / Sat Catcher turns', () => {
  async function playTurn(p: Player, roomId: string, score: number, seconds = 60) {
    const begun = await act(p, roomId, 'turn_begin')
    expect(begun.status).toBe(200)
    // Make the run long enough for the score
    await queryDB(
      `UPDATE game_room_players SET turn_started_at = now() - ($1 || ' seconds')::interval WHERE room_id = $2 AND device_id = $3`,
      [String(seconds), roomId, p.deviceId])
    return act(p, roomId, 'turn_submit', { score })
  }

  it('players take turns in join order; the high score takes the whole pot', async () => {
    const players = await family(3)
    const room = (await create(players[0], 'flappy', 100)).body.room
    await act(players[1], room.roomId, 'join')
    await act(players[2], room.roomId, 'join')

    expect((await act(players[1], room.roomId, 'start')).status).toBe(403) // only the host
    const started = await act(players[0], room.roomId, 'start')
    expect(started.body.room.status).toBe('playing')
    expect(started.body.room.seed).toBeGreaterThan(0)
    expect(started.body.room.yourTurn).toBe(true)

    // Out of turn
    expect((await act(players[2], room.roomId, 'turn_begin')).status).toBe(409)
    // Can't leave with your bet once it started
    expect((await act(players[2], room.roomId, 'leave')).status).toBe(409)

    await playTurn(players[0], room.roomId, 9)
    expect((await state(players[1], room.roomId)).body.room.yourTurn).toBe(true)
    await playTurn(players[1], room.roomId, 14)
    const last = await playTurn(players[2], room.roomId, 3)
    expect(last.body.room.status).toBe('finished')

    expect(await balance(players[1].userId)).toBe(1200)
    expect(await balance(players[0].userId)).toBe(900)
    expect(await balance(players[2].userId)).toBe(900)
    expect(await totalBalance(players)).toBe(3000)
    const s = await state(players[1], room.roomId)
    expect(s.body.room.yourPayout).toBe(300)
    // Bets move sats only; pet coins are untouched
    const coins = await queryDB<{ pet_coins: number }>(`SELECT pet_coins FROM profiles WHERE id = ANY($1)`, [players.map((p) => p.userId)])
    expect(coins.every((c) => c.pet_coins === 1000)).toBe(true)
  })

  it('a tie splits the pot; the odd sat goes to whoever posted the score first', async () => {
    const players = await family(3)
    const room = (await create(players[0], 'satcatcher', 50)).body.room
    await act(players[1], room.roomId, 'join')
    await act(players[2], room.roomId, 'join')
    await act(players[0], room.roomId, 'start')
    await playTurn(players[0], room.roomId, 20)
    await playTurn(players[1], room.roomId, 20)
    await playTurn(players[2], room.roomId, 5)
    // Pot 150 between two: 75 each
    expect(await balance(players[0].userId)).toBe(1025)
    expect(await balance(players[1].userId)).toBe(1025)
    expect(await totalBalance(players)).toBe(3000)
  })

  it('rejects a score too high for the time played', async () => {
    const [host, kid] = await family(2)
    const room = (await create(host, 'flappy', 10)).body.room
    await act(kid, room.roomId, 'join')
    await act(host, room.roomId, 'start')
    await act(host, room.roomId, 'turn_begin')
    const res = await act(host, room.roomId, 'turn_submit', { score: 500 })
    expect(res.status).toBe(422)
    expect((await state(host, room.roomId)).body.room.yourTurn).toBe(true)
  })

  it('a missed turn counts as 0 and play moves on', async () => {
    const [host, kid] = await family(2)
    const room = (await create(host, 'flappy', 10)).body.room
    await act(kid, room.roomId, 'join')
    await act(host, room.roomId, 'start')
    await age(room.roomId, 'turn_deadline', '1 second') // host never pressed play
    const s = await state(kid, room.roomId)
    expect(s.body.room.yourTurn).toBe(true)
    await playTurn(kid, room.roomId, 1)
    expect(await balance(kid.userId)).toBe(1010)
    expect(await balance(host.userId)).toBe(990)
  })

  it('a free room moves no sats', async () => {
    const [host, kid] = await family(2)
    const room = (await create(host, 'flappy', 0)).body.room
    await act(kid, room.roomId, 'join')
    await act(host, room.roomId, 'start')
    await playTurn(host, room.roomId, 4)
    await playTurn(kid, room.roomId, 2)
    expect(await balance(host.userId)).toBe(1000)
    expect(await balance(kid.userId)).toBe(1000)
    expect((await queryDB(`SELECT 1 FROM transactions WHERE user_id = ANY($1)`, [[host.userId, kid.userId]])).length).toBe(0)
  })
})

describe('game rooms: Pickleball results', () => {
  async function startPickleball(n: number, bet = 100) {
    const players = await family(n)
    const room = (await create(players[0], 'pickleball', bet)).body.room
    for (const p of players.slice(1)) await act(p, room.roomId, 'join')
    await act(players[0], room.roomId, 'start')
    return { players, roomId: room.roomId as string }
  }

  it('pays the winning side when every pet reports the same result', async () => {
    const { players, roomId } = await startPickleball(2)
    const first = await act(players[1], roomId, 'report', { winner: 'right', left: 3, right: 6 })
    expect(first.body.room.status).toBe('playing') // waiting for the other pet
    const second = await act(players[0], roomId, 'report', { winner: 'right', left: 3, right: 6 })
    expect(second.body.room.status).toBe('finished')
    expect(await balance(players[1].userId)).toBe(1100) // seat 1 plays right
    expect(await balance(players[0].userId)).toBe(900)
  })

  it('doubles: the winning pair splits the pot', async () => {
    const { players, roomId } = await startPickleball(4)
    for (const p of players) await act(p, roomId, 'report', { winner: 'left', left: 6, right: 2 })
    // Seats 0 and 3 play left
    expect(await balance(players[0].userId)).toBe(1100)
    expect(await balance(players[3].userId)).toBe(1100)
    expect(await balance(players[1].userId)).toBe(900)
    expect(await balance(players[2].userId)).toBe(900)
  })

  it('a host claiming a win the other pet disputes returns every bet', async () => {
    const { players, roomId } = await startPickleball(2)
    await act(players[0], roomId, 'report', { winner: 'left', left: 6, right: 0 })
    const res = await act(players[1], roomId, 'report', { winner: 'right', left: 2, right: 6 })
    expect(res.body.room.status).toBe('void')
    expect(res.body.room.voidReason).toBe('results_disagree')
    expect(await totalBalance(players)).toBe(2000)
    expect(await balance(players[0].userId)).toBe(1000)
  })

  it('a pet that never reports: the game returns every bet', async () => {
    const { players, roomId } = await startPickleball(2)
    await act(players[0], roomId, 'report', { winner: 'left', left: 6, right: 4 })
    await age(roomId, 'first_report_at', '3 minutes')
    const s = await state(players[0], roomId)
    expect(s.body.room.status).toBe('void')
    expect(s.body.room.voidReason).toBe('unfinished')
    expect(await balance(players[0].userId)).toBe(1000)
    expect(await balance(players[1].userId)).toBe(1000)
  })

  it('a pet whose match did not finish abandons it: every bet goes back at once', async () => {
    const { players, roomId } = await startPickleball(3)
    const res = await act(players[2], roomId, 'abandon')
    expect(res.body.room.status).toBe('void')
    expect(await totalBalance(players)).toBe(3000)
  })

  it('rejects an impossible result', async () => {
    const { players, roomId } = await startPickleball(2)
    expect((await act(players[0], roomId, 'report', { winner: 'left', left: 2, right: 6 })).status).toBe(400)
  })
})
