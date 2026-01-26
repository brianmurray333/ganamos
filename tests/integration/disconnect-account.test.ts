/**
 * Integration tests for POST /api/disconnect-account
 *
 * Tests the full request flow: NextRequest -> route handler -> real database
 * Requires mocking auth since this route uses createRouteHandlerClient
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedUser, seedConnectedAccount } from './helpers/test-isolation'
import { getServiceClient, createMockRouteHandlerClient, getAnonClient } from './helpers/db-client'

// Track current authenticated user for mock - use hoisted to share state with mocks
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
import { POST } from '@/app/api/disconnect-account/route'

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({})),
}))

function createDisconnectRequest(connectedAccountId?: string): Request {
  return new Request('http://localhost:3000/api/disconnect-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connectedAccountId ? { connectedAccountId } : {}),
  })
}

describe('POST /api/disconnect-account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.userId = null
  })

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      authState.userId = null

      const request = createDisconnectRequest('some-id')
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Request Validation', () => {
    it('should return 400 when connectedAccountId is missing', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const request = createDisconnectRequest()
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Connected account ID is required')
    })
  })

  describe('Disconnecting Accounts', () => {
    it('should successfully disconnect a connected account', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent' })
      const { id: childId } = await seedUser({ name: 'Child' })
      const { id: connectionId } = await seedConnectedAccount(parentId, childId)
      authState.userId = parentId

      // Verify connection exists
      const serviceClient = getServiceClient()
      const { data: before } = await serviceClient
        .from('connected_accounts')
        .select('*')
        .eq('id', connectionId)
        .single()
      expect(before).not.toBeNull()

      const request = createDisconnectRequest(childId)
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toBe('Account disconnected successfully')

      // Verify connection was deleted
      const { data: after } = await serviceClient
        .from('connected_accounts')
        .select('*')
        .eq('id', connectionId)
        .single()
      expect(after).toBeNull()
    })

    it('should return 403 when trying to disconnect account not owned by user', async () => {
      const { id: userId1 } = await seedUser()
      const { id: userId2 } = await seedUser()
      const { id: childId } = await seedUser()
      await seedConnectedAccount(userId2, childId) // user2 owns this connection
      authState.userId = userId1 // Logged in as user1

      const request = createDisconnectRequest(childId)
      const response = await POST(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe("You don't have permission to disconnect this account")
    })

    it('should return 403 for non-existent connection', async () => {
      const { id: userId } = await seedUser()
      authState.userId = userId

      const fakeChildId = crypto.randomUUID()
      const request = createDisconnectRequest(fakeChildId)
      const response = await POST(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe("You don't have permission to disconnect this account")
    })

    it('should not allow child to disconnect from parent', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent' })
      const { id: childId } = await seedUser({ name: 'Child' })
      await seedConnectedAccount(parentId, childId)
      authState.userId = childId // Logged in as child

      // Child trying to disconnect from parent (should fail - child is connected_user_id, not primary)
      const request = createDisconnectRequest(parentId)
      const response = await POST(request)

      expect(response.status).toBe(403)
    })

    it('should only disconnect specified account', async () => {
      const { id: parentId } = await seedUser({ name: 'Parent' })
      const { id: child1Id } = await seedUser({ name: 'Child1' })
      const { id: child2Id } = await seedUser({ name: 'Child2' })
      const { id: conn1Id } = await seedConnectedAccount(parentId, child1Id)
      const { id: conn2Id } = await seedConnectedAccount(parentId, child2Id)
      authState.userId = parentId

      // Disconnect child1 only
      const request = createDisconnectRequest(child1Id)
      const response = await POST(request)
      expect(response.status).toBe(200)

      // Verify child1 disconnected
      const serviceClient = getServiceClient()
      const { data: conn1 } = await serviceClient
        .from('connected_accounts')
        .select('*')
        .eq('id', conn1Id)
        .single()
      expect(conn1).toBeNull()

      // Verify child2 still connected
      const { data: conn2 } = await serviceClient
        .from('connected_accounts')
        .select('*')
        .eq('id', conn2Id)
        .single()
      expect(conn2).not.toBeNull()
    })
  })
})
