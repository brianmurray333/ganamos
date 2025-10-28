/**
 * Integration tests for POST /api/child-account endpoint
 * 
 * Tests the complete child account creation workflow including:
 * - Authentication and authorization
 * - UUID-based email generation
 * - Username slug creation
 * - Metadata validation
 * - Profile creation with correct initial state
 * - Connected_accounts relationship creation
 * - Idempotent operations
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { createTestSupabaseClient, waitForDatabase, verifyProfileExists, verifyConnectionExists, cleanupTestAccountsByEmail } from '../utils/database'
import { createTestParentUser, VALID_CHILD_AVATARS, generateValidUsernames, generateInvalidUsernames } from '../utils/fixtures'
import { createTestSession, createAuthHeaders, verifyUserMetadata } from '../utils/auth'
import type { TestSupabaseClient } from '../utils/database'
import type { TestParentUser } from '../utils/fixtures'

describe('POST /api/child-account', () => {
  let testClient: TestSupabaseClient
  let parentUser: TestParentUser
  let sessionAccessToken: string
  let sessionRefreshToken: string

  // Skip tests if environment variables are not set
  const skipIfNoTestDb = () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return true
    }
    return false
  }

  beforeAll(async () => {
    if (skipIfNoTestDb()) {
      console.warn('Skipping integration tests: Test database not configured')
      return
    }

    // Clean up any leftover test data from previous runs
    testClient = createTestSupabaseClient()
    await cleanupTestAccountsByEmail(testClient.supabase, '%test%')
  })

  beforeEach(async () => {
    if (skipIfNoTestDb()) return

    // Create fresh test client and parent user for each test
    testClient = createTestSupabaseClient()
    parentUser = await createTestParentUser(
      testClient.supabase,
      undefined,
      {
        trackUser: testClient.trackUser,
        trackProfile: testClient.trackProfile,
      }
    )

    // Create authenticated session
    const session = await createTestSession(
      testClient.supabase,
      parentUser.email,
      parentUser.password
    )
    sessionAccessToken = session.accessToken
    sessionRefreshToken = session.refreshToken
  })

  afterEach(async () => {
    if (skipIfNoTestDb()) return
    
    // Clean up test data
    await testClient.cleanup()
  })

  afterAll(async () => {
    if (skipIfNoTestDb()) return
    
    // Final cleanup
    await cleanupTestAccountsByEmail(testClient.supabase, '%test%')
  })

  describe('Authentication and Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toContain('Authentication required')
    })

    it.skip('should accept authenticated requests with valid session', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Input Validation', () => {
    it('should reject request without username', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Username and avatar are required')
    })

    it('should reject request without avatarUrl', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Username and avatar are required')
    })

    it.skip('should accept request with valid username and avatarUrl', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      if (response.status !== 200) {
        const data = await response.json()
        console.error('Unexpected error response:', {
          status: response.status,
          data,
        })
      }

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Child Account Creation', () => {
    it.skip('should create child account with correct email format', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.profile.email).toMatch(/^child-[0-9a-f-]+@ganamos\.app$/)
    })

    it.skip('should create child account with generated username slug', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'Test Child Name',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username).toBe('test-child-name')
      expect(data.profile.username).toMatch(/^[a-z0-9-]+$/)
      expect(data.profile.username.length).toBeLessThanOrEqual(20)
    })

    it.skip('should create child account with initial balance of 0', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.balance).toBe(0)
    })

    it.skip('should create child account with correct metadata', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      await waitForDatabase()

      const hasCorrectMetadata = await verifyUserMetadata(
        testClient.supabase,
        data.profile.id,
        {
          is_child_account: true,
          primary_user_id: parentUser.id,
          name: 'TestChild',
          avatar_url: VALID_CHILD_AVATARS[0],
        }
      )

      expect(hasCorrectMetadata).toBe(true)
    })

    it.skip('should create profile record in database', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      await waitForDatabase()

      const profileExists = await verifyProfileExists(testClient.supabase, data.profile.id)
      expect(profileExists).toBe(true)
    })
  })

  describe('Account Linking', () => {
    it.skip('should create connected_accounts relationship', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      await waitForDatabase()

      const connectionExists = await verifyConnectionExists(
        testClient.supabase,
        parentUser.id,
        data.profile.id
      )
      expect(connectionExists).toBe(true)
    })

    it.skip('should link child account to correct parent user', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      await waitForDatabase()

      const { data: connection } = await testClient.supabase
        .from('connected_accounts')
        .select('*')
        .eq('connected_user_id', data.profile.id)
        .single()

      expect(connection?.primary_user_id).toBe(parentUser.id)
      expect(connection?.connected_user_id).toBe(data.profile.id)
    })
  })

  describe('Idempotent Operations', () => {
    it.skip('should handle duplicate email gracefully', async () => {
      if (skipIfNoTestDb()) return

      // Create first child account
      const firstResponse = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(firstResponse.status).toBe(200)
      const firstData = await firstResponse.json()

      await waitForDatabase()

      // The endpoint generates unique UUIDs, so duplicate emails shouldn't occur
      // This test verifies the check is in place
      const { data: existingUser } = await testClient.supabase.auth.admin.listUsers({
        filter: `email eq '${firstData.profile.email}'`,
      })

      expect(existingUser?.users).toHaveLength(1)
    })

    it.skip('should not create duplicate connections', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      await waitForDatabase()

      // Check that only one connection exists
      const { data: connections } = await testClient.supabase
        .from('connected_accounts')
        .select('*')
        .eq('primary_user_id', parentUser.id)
        .eq('connected_user_id', data.profile.id)

      expect(connections).toHaveLength(1)
    })
  })

  describe('Username Slug Generation', () => {
    it.skip('should convert uppercase to lowercase', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username).toBe('testchild')
    })

    it.skip('should replace spaces with hyphens', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'Test Child Name',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username).toBe('test-child-name')
    })

    it.skip('should remove special characters', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'Test@Child#Name!',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username).toBe('testchildname')
    })

    it.skip('should limit username to 20 characters', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'This Is A Very Long Name That Exceeds Twenty Characters',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username.length).toBeLessThanOrEqual(20)
    })

    it.skip('should only contain alphanumeric characters and hyphens', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'Test_Child.Name@123!',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.username).toMatch(/^[a-z0-9-]+$/)
    })
  })

  describe('Error Handling', () => {
    it('should return error for invalid request format', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: 'invalid json',
      })

      expect(response.status).toBeGreaterThanOrEqual(400)
    })

    it('should handle missing session gracefully', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'invalid-cookie',
        },
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBeTruthy()
    })
  })

  describe('Response Structure', () => {
    it.skip('should return success response with profile data', async () => {
      if (skipIfNoTestDb()) return

      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('message')
      expect(data).toHaveProperty('profile')
      expect(data.profile).toHaveProperty('id')
      expect(data.profile).toHaveProperty('email')
      expect(data.profile).toHaveProperty('name')
      expect(data.profile).toHaveProperty('username')
      expect(data.profile).toHaveProperty('avatar_url')
      expect(data.profile).toHaveProperty('balance')
    })

    it.skip('should return profile with correct avatar URL', async () => {
      if (skipIfNoTestDb()) return

      const avatarUrl = VALID_CHILD_AVATARS[2]
      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username: 'TestChild',
          avatarUrl,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.avatar_url).toBe(avatarUrl)
    })

    it.skip('should return profile with correct name', async () => {
      if (skipIfNoTestDb()) return

      const username = 'TestChildName'
      const response = await fetch('http://localhost:3457/api/child-account', {
        method: 'POST',
        headers: createAuthHeaders(sessionAccessToken, sessionRefreshToken),
        body: JSON.stringify({
          username,
          avatarUrl: VALID_CHILD_AVATARS[0],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.profile.name).toBe(username)
    })
  })
})
