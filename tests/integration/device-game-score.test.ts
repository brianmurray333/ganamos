/**
 * Integration tests for /api/device/game-score
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * This route uses createServerSupabaseClient (no auth required for device endpoints)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/device/game-score/route'
import { seedUser, seedDevice, queryDB } from './helpers/test-isolation'
import { getServiceClient } from './helpers/db-client'
import { getPool, trackGameScore } from '../setup-db'

// Helper to seed a game score directly
async function seedGameScore(
  deviceId: string,
  userId: string,
  score: number
): Promise<{ id: string }> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      `INSERT INTO flappy_bird_game (device_id, user_id, score)
       VALUES ($1::uuid, $2::uuid, $3::int)
       RETURNING id`,
      [deviceId, userId, score]
    )
    const id = result.rows[0].id
    trackGameScore(id)
    return { id }
  } finally {
    client.release()
  }
}

function createScorePostRequest(deviceId: string | null, body: Record<string, unknown>): NextRequest {
  const url = deviceId
    ? `http://localhost:3000/api/device/game-score?deviceId=${deviceId}`
    : 'http://localhost:3000/api/device/game-score'

  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createScoreGetRequest(deviceId?: string): NextRequest {
  const url = deviceId
    ? `http://localhost:3000/api/device/game-score?deviceId=${deviceId}`
    : 'http://localhost:3000/api/device/game-score'

  return new NextRequest(url, { method: 'GET' })
}

describe('/api/device/game-score', () => {
  describe('POST - Score Submission', () => {
    describe('Request Validation', () => {
      it('should return 400 when deviceId is missing', async () => {
        const request = createScorePostRequest(null, { score: 10 })
        const response = await POST(request)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBe('Device ID required')
      })

      it('should return 400 when score is missing', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        const request = createScorePostRequest(deviceId, {})
        const response = await POST(request)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBe('Score must be a non-negative number')
      })

      it('should return 400 when score is negative', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        const request = createScorePostRequest(deviceId, { score: -5 })
        const response = await POST(request)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBe('Score must be a non-negative number')
      })

      it('should return 400 when score is not a number', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        const request = createScorePostRequest(deviceId, { score: 'invalid' })
        const response = await POST(request)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
      })
    })

    describe('Device Verification', () => {
      it('should return 404 when device does not exist', async () => {
        const fakeDeviceId = crypto.randomUUID()

        const request = createScorePostRequest(fakeDeviceId, { score: 10 })
        const response = await POST(request)

        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBe('Device not found or not paired')
      })

      it('should return 404 when device is not paired', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'disconnected' })

        const request = createScorePostRequest(deviceId, { score: 10 })
        const response = await POST(request)

        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBe('Device not found or not paired')
      })
    })

    describe('Successful Score Submission', () => {
      it('should record score and return success', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired', petName: 'Fluffy' })

        const request = createScorePostRequest(deviceId, { score: 42 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.success).toBe(true)
        expect(data.personalBest).toBe(42)

        // Verify score was inserted in database
        const serviceClient = getServiceClient()
        const { data: scores } = await serviceClient
          .from('flappy_bird_game')
          .select('*')
          .eq('device_id', deviceId)

        expect(scores).toHaveLength(1)
        expect(scores![0].score).toBe(42)
        expect(scores![0].user_id).toBe(userId)
      })

      it('should accept zero as valid score', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        const request = createScorePostRequest(deviceId, { score: 0 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.success).toBe(true)
        expect(data.personalBest).toBe(0)
      })

      it('should floor decimal scores', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        const request = createScorePostRequest(deviceId, { score: 42.9 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.personalBest).toBe(42)
      })

      it('should indicate personal best on first score', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        const request = createScorePostRequest(deviceId, { score: 50 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.isPersonalBest).toBe(true)
      })

      it('should indicate personal best when beating previous score', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        // Submit first score
        await seedGameScore(deviceId, userId, 30)

        // Submit higher score
        const request = createScorePostRequest(deviceId, { score: 50 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.isPersonalBest).toBe(true)
        expect(data.personalBest).toBe(50)
      })

      it('should NOT indicate personal best when score is lower', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

        // Submit first score
        await seedGameScore(deviceId, userId, 100)

        // Submit lower score
        const request = createScorePostRequest(deviceId, { score: 50 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.isPersonalBest).toBe(false)
        expect(data.personalBest).toBe(100)
      })
    })

    describe('Leaderboard', () => {
      it('should return leaderboard with top scores', async () => {
        // Create multiple users with scores
        const { id: user1Id } = await seedUser()
        const { id: device1Id } = await seedDevice(user1Id, { status: 'paired', petName: 'Pet1' })
        await seedGameScore(device1Id, user1Id, 100)

        const { id: user2Id } = await seedUser()
        const { id: device2Id } = await seedDevice(user2Id, { status: 'paired', petName: 'Pet2' })
        await seedGameScore(device2Id, user2Id, 200)

        const { id: user3Id } = await seedUser()
        const { id: device3Id } = await seedDevice(user3Id, { status: 'paired', petName: 'Pet3' })

        // Submit score for user3
        const request = createScorePostRequest(device3Id, { score: 150 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.leaderboard).toBeDefined()
        expect(data.leaderboard.length).toBeGreaterThan(0)

        // First place should be 200
        expect(data.leaderboard[0].score).toBe(200)
      })

      it('should mark current device entries as isYou', async () => {
        const { id: userId } = await seedUser()
        const { id: deviceId } = await seedDevice(userId, { status: 'paired', petName: 'MyPet' })

        const request = createScorePostRequest(deviceId, { score: 999 })
        const response = await POST(request)

        expect(response.status).toBe(200)
        const data = await response.json()

        const myEntry = data.leaderboard.find((e: { isYou: boolean }) => e.isYou)
        expect(myEntry).toBeDefined()
        expect(myEntry.petName).toBe('MyPet')
      })
    })
  })

  describe('GET - Leaderboard Retrieval', () => {
    it('should return leaderboard without deviceId', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired', petName: 'TestPet' })
      await seedGameScore(deviceId, userId, 75)

      const request = createScoreGetRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.leaderboard).toBeDefined()
    })

    it('should return personal best when deviceId provided', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })
      await seedGameScore(deviceId, userId, 50)
      await seedGameScore(deviceId, userId, 80)
      await seedGameScore(deviceId, userId, 60)

      const request = createScoreGetRequest(deviceId)
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.personalBest).toBe(80)
    })

    it('should return yourRank when deviceId provided', async () => {
      // Create user with high score
      const { id: user1Id } = await seedUser()
      const { id: device1Id } = await seedDevice(user1Id, { status: 'paired' })
      await seedGameScore(device1Id, user1Id, 1000)

      // Create user with lower score
      const { id: user2Id } = await seedUser()
      const { id: device2Id } = await seedDevice(user2Id, { status: 'paired' })
      await seedGameScore(device2Id, user2Id, 500)

      const request = createScoreGetRequest(device2Id)
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.yourRank).toBe(2)
    })

    it('should return null for personal best when no scores exist', async () => {
      const { id: userId } = await seedUser()
      const { id: deviceId } = await seedDevice(userId, { status: 'paired' })

      const request = createScoreGetRequest(deviceId)
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.personalBest).toBeNull()
      expect(data.yourRank).toBeNull()
    })
  })
})
