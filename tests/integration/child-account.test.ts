/**
 * Integration tests for POST /api/child-account
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * This route uses both createRouteHandlerClient (for auth) and createServerSupabaseClient (for admin)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { seedUser } from './helpers/test-isolation'
import { getServiceClient, getAnonClient } from './helpers/db-client'
import { getPool, trackUser } from '../setup-db'

// Track child users created during tests for cleanup
const createdChildUsers: string[] = []

// Track current authenticated user for mock
const authState = vi.hoisted(() => ({ userId: null as string | null }))

// Mock the auth helpers to use real DB client with auth
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { getAuthenticatedClient, getAnonClient } = await import('./helpers/db-client')
  return {
    createRouteHandlerClient: vi.fn(() => {
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
import { POST } from '@/app/api/child-account/route'

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: () => [],
  })),
}))

function createChildAccountRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/child-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/child-account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
  })

  afterEach(async () => {
    // Clean up child users created via admin API
    if (createdChildUsers.length > 0) {
      const pool = getPool()
      const client = await pool.connect()
      try {
        // Delete connections
        await client.query(
          `DELETE FROM connected_accounts WHERE connected_user_id = ANY($1::uuid[])`,
          [createdChildUsers]
        )
        // Delete profiles
        await client.query(`DELETE FROM profiles WHERE id = ANY($1::uuid[])`, [createdChildUsers])
        // Delete identities
        await client.query(`DELETE FROM auth.identities WHERE user_id = ANY($1::uuid[])`, [
          createdChildUsers,
        ])
        // Delete auth users
        await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [createdChildUsers])
      } finally {
        client.release()
      }
      createdChildUsers.length = 0
    }
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const request = createChildAccountRequest({
        username: 'ChildUser',
        avatarUrl: 'https://example.com/avatar.png',
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })
  })

  describe('Request Validation', () => {
    it('should return 400 when username is missing', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const request = createChildAccountRequest({
        avatarUrl: 'https://example.com/avatar.png',
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Username and avatar are required')
    })

    it('should return 400 when avatarUrl is missing', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const request = createChildAccountRequest({
        username: 'ChildUser',
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Username and avatar are required')
    })
  })

  describe('Child Account Creation', () => {
    // The child-account route uses adminSupabase (service role) to create/update
    // child profiles, bypassing RLS restrictions. This allows parents to create
    // child accounts successfully.

    it('should successfully create a child account', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent User' })
      authState.userId = parentId

      const request = createChildAccountRequest({
        username: 'MyChild',
        avatarUrl: 'https://example.com/child-avatar.png',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.profile).toBeDefined()
      expect(data.profile.name).toBe('MyChild')

      // Track child for cleanup
      if (data.profile?.id) {
        createdChildUsers.push(data.profile.id)
      }
    })

    it('should create child with unique username derived from display name', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent User' })
      authState.userId = parentId

      const request = createChildAccountRequest({
        username: 'Test Child Name',
        avatarUrl: 'https://example.com/child-avatar.png',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username).toMatch(/^test-child-name/)

      // Track child for cleanup
      if (data.profile?.id) {
        createdChildUsers.push(data.profile.id)
      }
    })

    it('should create connection between parent and child', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent User' })
      authState.userId = parentId

      const request = createChildAccountRequest({
        username: 'ConnectedChild',
        avatarUrl: 'https://example.com/child-avatar.png',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      const childId = data.profile.id

      // Track child for cleanup
      createdChildUsers.push(childId)

      // Verify connection was created
      const serviceClient = getServiceClient()
      const { data: connection } = await serviceClient
        .from('connected_accounts')
        .select('*')
        .eq('primary_user_id', parentId)
        .eq('connected_user_id', childId)
        .single()

      expect(connection).toBeDefined()
      expect(connection?.primary_user_id).toBe(parentId)
      expect(connection?.connected_user_id).toBe(childId)
    })

    it('should allow creating multiple children for same parent', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent User' })
      authState.userId = parentId

      // Create first child
      const request1 = createChildAccountRequest({
        username: 'FirstChild',
        avatarUrl: 'https://example.com/child1.png',
      })
      const response1 = await POST(request1)
      expect(response1.status).toBe(200)
      const data1 = await response1.json()
      createdChildUsers.push(data1.profile.id)

      // Create second child
      const request2 = createChildAccountRequest({
        username: 'SecondChild',
        avatarUrl: 'https://example.com/child2.png',
      })
      const response2 = await POST(request2)
      expect(response2.status).toBe(200)
      const data2 = await response2.json()
      createdChildUsers.push(data2.profile.id)

      // Verify both children exist with different IDs
      expect(data1.profile.id).not.toBe(data2.profile.id)
      expect(data1.profile.name).toBe('FirstChild')
      expect(data2.profile.name).toBe('SecondChild')
    })
  })
})
