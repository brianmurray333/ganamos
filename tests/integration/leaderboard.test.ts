/**
 * Integration tests for GET /api/leaderboard against the real local database.
 *
 * History: this file used to be describe.skip'd. It seeded many devices for one user
 * (the schema now has UNIQUE(devices.user_id), one device per user), ran its own copy
 * of the leaderboard SQL instead of the route, tested a NULL pet_name (pet_name is now
 * NOT NULL), ended the shared pg pool in afterAll, and fetched http://localhost:3000
 * (needs a running dev server). It now seeds one user + device per score and calls the
 * route handler directly. Seeded rows are cleaned up by tests/setup-db.ts.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/leaderboard/route'
import { queryDB } from '../setup-db'
import { seedUser, seedDevice } from './helpers/test-isolation'

// Seeded scores sit far above anything other tests insert, so they are the global top 20
const BASE = 1_000_000_000

async function seedPlayer(petName: string, score: number, createdAt?: Date) {
  const user = await seedUser({ name: `Leaderboard ${petName}` })
  const device = await seedDevice(user.id, { petName })
  await queryDB(
    `INSERT INTO flappy_bird_game (device_id, user_id, score, created_at)
     VALUES ($1::uuid, $2::uuid, $3::int, $4::timestamptz)`,
    [device.id, user.id, score, (createdAt ?? new Date()).toISOString()]
  )
  return { userId: user.id, deviceId: device.id }
}

async function getLeaderboard() {
  const response = await GET(new NextRequest('http://localhost:3000/api/leaderboard'))
  return { response, data: await response.json() }
}

describe('GET /api/leaderboard - Integration Tests', () => {
  it('returns the top scores ordered by score DESC with ranks and pet names', async () => {
    const scores = [5, 1, 4, 2, 3]
    for (const s of scores) await seedPlayer(`Pet-${s}`, BASE + s)

    const { response, data } = await getLeaderboard()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=60')

    const top = data.leaderboard.slice(0, 5)
    expect(top.map((e: any) => e.score)).toEqual([5, 4, 3, 2, 1].map(s => BASE + s))
    expect(top.map((e: any) => e.petName)).toEqual(['Pet-5', 'Pet-4', 'Pet-3', 'Pet-2', 'Pet-1'])
    expect(top.map((e: any) => e.rank)).toEqual([1, 2, 3, 4, 5])
    top.forEach((e: any) => expect(typeof e.createdAt).toBe('string'))
  })

  it('breaks ties by earliest created_at first', async () => {
    const t0 = Date.now() - 60_000
    await seedPlayer('Tied-Late', BASE + 50, new Date(t0 + 2000))
    await seedPlayer('Tied-Early', BASE + 50, new Date(t0))
    await seedPlayer('Tied-Middle', BASE + 50, new Date(t0 + 1000))

    const { data } = await getLeaderboard()

    expect(data.leaderboard.slice(0, 3).map((e: any) => e.petName)).toEqual([
      'Tied-Early',
      'Tied-Middle',
      'Tied-Late',
    ])
  })

  it('returns at most 20 entries while totalEntries counts every score', async () => {
    for (let i = 0; i < 25; i++) await seedPlayer(`Many-${i}`, BASE + i)

    const { data } = await getLeaderboard()
    const { rows } = await queryDB('SELECT COUNT(*)::int AS n FROM flappy_bird_game')

    expect(data.leaderboard).toHaveLength(20)
    expect(data.leaderboard[0].score).toBe(BASE + 24)
    expect(data.leaderboard[19].score).toBe(BASE + 5)
    expect(data.totalEntries).toBe(rows[0].n)
    expect(data.totalEntries).toBeGreaterThanOrEqual(25)
  })
})
