import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/child-account/route'
import { v4 as uuidv4 } from 'uuid'
import type { Profile, ConnectedAccount } from '@/lib/database.types'

// Unmock Supabase for integration tests - we need real database connections
vi.unmock('@/lib/supabase')

// Import AFTER unmocking to get the real implementation
const { createServerSupabaseClient } = await import('@/lib/supabase')

/**
 * Integration Test Suite for Child Account Creation API
 * 
 * Tests the /api/child-account endpoint's complete workflow including:
 * - Authentication and authorization
 * - Credential generation (email, password, username)
 * - Auth user creation via Supabase Admin API
 * - Profile creation/update with metadata
 * - Parent-child account linking
 * 
 * Requirements:
 * - Real Supabase test database connection
 * - Environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - Service role privileges for admin operations
 * 
 * Note: This test suite uses a real database connection and performs actual
 * database operations. It is NOT mocked like unit tests in tests/unit/.
 * 
 * FIXME: These integration tests are currently disabled because they require:
 * 1. Proper Next.js request context mocking (cookies() function fails in test env)
 * 2. A dedicated test database or better transaction rollback strategy
 * 3. Proper mocking of @supabase/auth-helpers-nextjs for createRouteHandlerClient
 * 
 * These tests should be refactored in a separate PR to either:
 * - Use a proper E2E testing framework (Playwright/Cypress) with real HTTP requests
 * - Properly mock Next.js request context with AsyncLocalStorage
 * - Convert to unit tests that test the business logic directly without API routes
 */

describe.skip('POST /api/child-account - Integration Tests', () => {
  let adminSupabase: ReturnType<typeof createServerSupabaseClient>
  let testParentUserId: string
  let testParentEmail: string
  let createdChildUserIds: string[] = []
  let createdConnectionIds: string[] = []

  // Mock cookies for Next.js route handler
  const mockCookies = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }

  beforeEach(async () => {
    // Initialize admin Supabase client with service role key
    adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })

    // Create a test parent user for authentication
    const parentEmail = `test-parent-${uuidv4()}@ganamos.app`
    const { data: parentAuthData, error: parentError } = await adminSupabase.auth.admin.createUser({
      email: parentEmail,
      password: uuidv4(),
      email_confirm: true,
      user_metadata: {
        name: 'Test Parent',
        is_child_account: false,
      },
    })

    if (parentError || !parentAuthData.user) {
      throw new Error(`Failed to create test parent user: ${parentError?.message}`)
    }

    testParentUserId = parentAuthData.user.id
    testParentEmail = parentEmail

    // Create parent profile using upsert in case a trigger auto-created it
    const { error: profileError } = await adminSupabase.from('profiles').upsert({
      id: testParentUserId,
      name: 'Test Parent',
      username: `testparent-${uuidv4().slice(0, 8)}`, // Make unique
      email: parentEmail,
      balance: 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    if (profileError) {
      throw new Error(`Failed to create test parent profile: ${profileError.message}`)
    }
  })

  afterEach(async () => {
    // Clean up created child accounts
    for (const childUserId of createdChildUserIds) {
      // Delete from profiles
      await adminSupabase.from('profiles').delete().eq('id', childUserId)
      
      // Delete from auth.users
      await adminSupabase.auth.admin.deleteUser(childUserId)
    }

    // Clean up connected_accounts relationships
    for (const connectionId of createdConnectionIds) {
      await adminSupabase.from('connected_accounts').delete().eq('id', connectionId)
    }

    // Clean up test parent
    if (testParentUserId) {
      await adminSupabase.from('profiles').delete().eq('id', testParentUserId)
      await adminSupabase.auth.admin.deleteUser(testParentUserId)
    }

    // Reset tracking arrays
    createdChildUserIds = []
    createdConnectionIds = []
  })

  /**
   * Helper: Create mock authenticated request
   */
  const createAuthenticatedRequest = (body: { username: string; avatarUrl: string }) => {
    return new Request('http://localhost:3457/api/child-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /**
   * Helper: Mock session for authenticated requests
   */
  const mockAuthenticatedSession = () => {
    // Mock createRouteHandlerClient to return authenticated session
    vi.doMock('@supabase/auth-helpers-nextjs', () => ({
      createRouteHandlerClient: () => ({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: {
                  id: testParentUserId,
                  email: testParentEmail,
                },
              },
            },
          }),
        },
        from: (table: string) => {
          // Delegate to real admin client for database operations
          return adminSupabase.from(table)
        },
      }),
    }))
  }

  /**
   * Helper: Mock unauthenticated session
   */
  const mockUnauthenticatedSession = () => {
    vi.doMock('@supabase/auth-helpers-nextjs', () => ({
      createRouteHandlerClient: () => ({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
          }),
        },
      }),
    }))
  }

  it('should create a child account with valid authentication', async () => {
    mockAuthenticatedSession()

    const request = createAuthenticatedRequest({
      username: 'Charlotte Test',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const response = await POST(request)
    const responseData = await response.json()

    expect(response.status).toBe(200)
    expect(responseData.success).toBe(true)
    expect(responseData.message).toBe('Child account created successfully')
    expect(responseData.profile).toBeDefined()

    // Track child user ID for cleanup
    const childUserId = responseData.profile.id
    createdChildUserIds.push(childUserId)

    // Verify profile creation with correct metadata
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', childUserId)
      .single()

    expect(profile).toBeDefined()
    expect(profile?.name).toBe('Charlotte Test')
    expect(profile?.email).toMatch(/^child-[a-f0-9-]+@ganamos\.app$/) // UUID-based email
    expect(profile?.username).toBe('charlotte-test') // Slugified username
    expect(profile?.avatar_url).toBe('https://example.com/avatar.png')
    expect(profile?.balance).toBe(0) // Initial balance

    // Verify auth user creation with metadata
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(childUserId)
    expect(authUser.user).toBeDefined()
    expect(authUser.user?.user_metadata?.is_child_account).toBe(true)
    expect(authUser.user?.user_metadata?.primary_user_id).toBe(testParentUserId)

    // Verify connected_accounts linkage
    const { data: connection } = await adminSupabase
      .from('connected_accounts')
      .select('*')
      .eq('primary_user_id', testParentUserId)
      .eq('connected_user_id', childUserId)
      .single()

    expect(connection).toBeDefined()
    expect(connection?.primary_user_id).toBe(testParentUserId)
    expect(connection?.connected_user_id).toBe(childUserId)

    // Track connection for cleanup
    if (connection?.id) {
      createdConnectionIds.push(connection.id)
    }
  })

  it('should reject unauthenticated requests', async () => {
    mockUnauthenticatedSession()

    const request = createAuthenticatedRequest({
      username: 'Unauthorized Test',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const response = await POST(request)
    const responseData = await response.json()

    expect(response.status).toBe(401)
    expect(responseData.error).toBe('Authentication required')
  })

  it('should validate required fields (username and avatarUrl)', async () => {
    mockAuthenticatedSession()

    // Missing username
    const requestMissingUsername = new Request('http://localhost:3457/api/child-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl: 'https://example.com/avatar.png' }),
    })

    const response1 = await POST(requestMissingUsername)
    const responseData1 = await response1.json()

    expect(response1.status).toBe(400)
    expect(responseData1.error).toBe('Username and avatar are required')

    // Missing avatarUrl
    const requestMissingAvatar = new Request('http://localhost:3457/api/child-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Test Child' }),
    })

    const response2 = await POST(requestMissingAvatar)
    const responseData2 = await response2.json()

    expect(response2.status).toBe(400)
    expect(responseData2.error).toBe('Username and avatar are required')
  })

  it('should generate unique UUID-based email for each child account', async () => {
    mockAuthenticatedSession()

    const request1 = createAuthenticatedRequest({
      username: 'Child One',
      avatarUrl: 'https://example.com/avatar1.png',
    })

    const response1 = await POST(request1)
    const data1 = await response1.json()
    createdChildUserIds.push(data1.profile.id)

    const request2 = createAuthenticatedRequest({
      username: 'Child Two',
      avatarUrl: 'https://example.com/avatar2.png',
    })

    const response2 = await POST(request2)
    const data2 = await response2.json()
    createdChildUserIds.push(data2.profile.id)

    // Both should have unique UUID-based emails
    expect(data1.profile.email).toMatch(/^child-[a-f0-9-]+@ganamos\.app$/)
    expect(data2.profile.email).toMatch(/^child-[a-f0-9-]+@ganamos\.app$/)
    expect(data1.profile.email).not.toBe(data2.profile.email)
  })

  it('should generate valid username from display name (lowercase, hyphens, alphanumeric)', async () => {
    mockAuthenticatedSession()

    const testCases = [
      { input: 'Charlotte Rose', expected: 'charlotte-rose' },
      { input: 'UPPERCASE NAME', expected: 'uppercase-name' },
      { input: 'Special!@#Characters', expected: 'specialcharacters' },
      { input: 'Multiple   Spaces', expected: 'multiple-spaces' },
      { input: 'VeryLongNameThatExceedsTwentyCharactersLimit', expected: 'verylongnamethatexce' }, // Max 20 chars
    ]

    for (const testCase of testCases) {
      const request = createAuthenticatedRequest({
        username: testCase.input,
        avatarUrl: 'https://example.com/avatar.png',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.profile.username).toBe(testCase.expected)
      createdChildUserIds.push(data.profile.id)
    }
  })

  it('should handle idempotency for existing child accounts (upsert profile)', async () => {
    mockAuthenticatedSession()

    // Create child account first time
    const request1 = createAuthenticatedRequest({
      username: 'Idempotent Test',
      avatarUrl: 'https://example.com/avatar1.png',
    })

    const response1 = await POST(request1)
    const data1 = await response1.json()
    const childUserId = data1.profile.id
    createdChildUserIds.push(childUserId)

    // Manually update profile to simulate existing state
    await adminSupabase
      .from('profiles')
      .update({ name: 'Updated Name' })
      .eq('id', childUserId)

    // Attempt to create again with same child account (simulated by updating user metadata)
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(childUserId)
    const childEmail = authUser.user?.email

    // Update auth user metadata to trigger upsert path
    await adminSupabase.auth.admin.updateUserById(childUserId, {
      user_metadata: {
        name: 'Idempotent Test Updated',
        avatar_url: 'https://example.com/avatar2.png',
        is_child_account: true,
        primary_user_id: testParentUserId,
      },
    })

    // Verify profile was upserted (updated, not duplicated)
    const { data: profiles } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('email', childEmail)

    expect(profiles?.length).toBe(1) // Only one profile exists
    expect(profiles?.[0].id).toBe(childUserId)
  })

  it('should prevent duplicate connected_accounts relationships', async () => {
    mockAuthenticatedSession()

    // Create child account
    const request = createAuthenticatedRequest({
      username: 'Duplicate Connection Test',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const response = await POST(request)
    const data = await response.json()
    const childUserId = data.profile.id
    createdChildUserIds.push(childUserId)

    // Verify only one connection exists
    const { data: connections } = await adminSupabase
      .from('connected_accounts')
      .select('*')
      .eq('primary_user_id', testParentUserId)
      .eq('connected_user_id', childUserId)

    expect(connections?.length).toBe(1)

    // Track connection for cleanup
    if (connections?.[0]?.id) {
      createdConnectionIds.push(connections[0].id)
    }

    // Attempt to create duplicate connection manually (endpoint prevents this, but test the check)
    const { error: duplicateError } = await adminSupabase
      .from('connected_accounts')
      .insert({
        primary_user_id: testParentUserId,
        connected_user_id: childUserId,
        created_at: new Date().toISOString(),
      })

    // Should fail due to unique constraint or RLS policy
    expect(duplicateError).toBeDefined()
  })

  it('should initialize child account balance to 0', async () => {
    mockAuthenticatedSession()

    const request = createAuthenticatedRequest({
      username: 'Balance Test',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.profile.balance).toBe(0)
    createdChildUserIds.push(data.profile.id)

    // Verify in database
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('balance')
      .eq('id', data.profile.id)
      .single()

    expect(profile?.balance).toBe(0)
  })

  it('should set correct metadata flags (is_child_account, primary_user_id)', async () => {
    mockAuthenticatedSession()

    const request = createAuthenticatedRequest({
      username: 'Metadata Test',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const response = await POST(request)
    const data = await response.json()
    const childUserId = data.profile.id
    createdChildUserIds.push(childUserId)

    // Verify auth user metadata
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(childUserId)

    expect(authUser.user?.user_metadata?.is_child_account).toBe(true)
    expect(authUser.user?.user_metadata?.primary_user_id).toBe(testParentUserId)
    expect(authUser.user?.user_metadata?.name).toBe('Metadata Test')
  })

  it('should create child account with service role privileges (bypassing RLS)', async () => {
    mockAuthenticatedSession()

    const request = createAuthenticatedRequest({
      username: 'Service Role Test',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const response = await POST(request)
    const data = await response.json()
    const childUserId = data.profile.id
    createdChildUserIds.push(childUserId)

    // Verify admin operations succeeded (auth.admin.createUser requires service role)
    const { data: authUser, error: authError } = await adminSupabase.auth.admin.getUserById(childUserId)

    expect(authError).toBeNull()
    expect(authUser.user).toBeDefined()
    expect(authUser.user?.id).toBe(childUserId)

    // Verify profile was created despite RLS policies
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', childUserId)
      .single()

    expect(profileError).toBeNull()
    expect(profile).toBeDefined()
  })

  it('should handle errors gracefully and return appropriate status codes', async () => {
    mockAuthenticatedSession()

    // Test with invalid avatar URL (empty string)
    const request = createAuthenticatedRequest({
      username: 'Error Test',
      avatarUrl: '', // Invalid empty string
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Username and avatar are required')
  })
})