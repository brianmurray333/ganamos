/**
 * Integration tests for GET /api/user/balance
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * This route uses createServerSupabaseClient with getSession for auth
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedUser } from './helpers/test-isolation'
import { getAuthenticatedClient, getServiceClient, getAnonClient } from './helpers/db-client'

// Track current authenticated user for mock - use hoisted to share state with mocks
const authState = vi.hoisted(() => ({ userId: null as string | null }))

// Mock createServerSupabaseClient to return authenticated client
vi.mock('@/lib/supabase', async () => {
  const { getAuthenticatedClient, getAnonClient } = await import('./helpers/db-client')
  return {
    createServerSupabaseClient: vi.fn(() => {
      if (!authState.userId) {
        const client = getAnonClient()
        const mockClient = Object.create(client)
        mockClient.auth = {
          getSession: async () => ({ data: { session: null }, error: null }),
        }
        return mockClient
      }

      const client = getAuthenticatedClient(authState.userId)
      const mockClient = Object.create(client)
      mockClient.auth = {
        ...client.auth,
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: authState.userId,
                email: `test-${authState.userId!.slice(0, 8)}@test.local`,
              },
              access_token: 'mock-token',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              refresh_token: 'mock-refresh',
            },
          },
          error: null,
        }),
      }
      return mockClient
    }),
  }
})

// Import route after mocks are set up
import { GET } from '@/app/api/user/balance/route'

describe('GET /api/user/balance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const response = await GET()

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not authenticated')
    })
  })

  describe('Balance Retrieval', () => {
    it('should return user balance', async () => {
      const { id: userId } = await seedUser({ balance: 5000 })
      authState.userId = userId

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.balance).toBe(5000)
    })

    it('should return zero balance for new user', async () => {
      const { id: userId } = await seedUser({ balance: 0 })
      authState.userId = userId

      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.balance).toBe(0)
    })

    it('should return correct balance after updates', async () => {
      const { id: userId } = await seedUser({ balance: 1000 })
      authState.userId = userId

      // Verify initial balance
      let response = await GET()
      let data = await response.json()
      expect(data.balance).toBe(1000)

      // Update balance directly in DB
      const serviceClient = getServiceClient()
      await serviceClient.from('profiles').update({ balance: 2500 }).eq('id', userId)

      // Verify updated balance
      response = await GET()
      data = await response.json()
      expect(data.balance).toBe(2500)
    })

    it('should only return own balance, not other users', async () => {
      const { id: userId1 } = await seedUser({ balance: 100 })
      const { id: userId2 } = await seedUser({ balance: 9999 })

      // Logged in as user1
      authState.userId = userId1

      const response = await GET()
      const data = await response.json()

      expect(data.balance).toBe(100)
      expect(data.balance).not.toBe(9999)
    })

    it('should handle large balance values', async () => {
      const largeBalance = 999999999
      const { id: userId } = await seedUser({ balance: largeBalance })
      authState.userId = userId

      const response = await GET()
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.balance).toBe(largeBalance)
    })
  })
})
