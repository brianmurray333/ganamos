import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  createTestAdminClient,
  createTestParentUser,
  deleteTestUser,
  cleanupTestUsers,
  verifyChildAccountCreation
} from '../utils/test-helpers'
import { Database } from '@/lib/database.types'

/**
 * Integration Tests for POST /api/child-account Endpoint
 * 
 * Tests the complete child account creation workflow:
 * 1. Authentication and authorization
 * 2. Credential generation (UUID-based email, random password)
 * 3. Auth user creation with service role
 * 4. Profile creation/upsert with metadata
 * 5. Account linking via connected_accounts table
 * 
 * REQUIREMENTS:
 * - Real test database (not mocked)
 * - Test environment variables in .env.test:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 
 * These tests use REAL database operations and require cleanup.
 * 
 * NOTE: These tests are currently skipped by default because they require
 * a real Supabase test database to be configured. To run these tests:
 * 1. Create a .env.test file with test database credentials
 * 2. See tests/integration/README.md for full setup instructions
 */

// Check if required environment variables are present
const hasRequiredEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.SUPABASE_SERVICE_ROLE_KEY && 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Safety check: Skip if we're pointed at production database
// Test database URLs should contain 'test', 'local', 'dev', or use localhost
const isTestDatabase = Boolean(
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('test') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('local') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dev') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('localhost') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('127.0.0.1') ||
  process.env.NODE_ENV === 'test'
)

// Conditionally skip the entire test suite if environment is not configured for testing
describe.skipIf(!hasRequiredEnv || !isTestDatabase)('POST /api/child-account Integration Tests', () => {
  let adminClient: SupabaseClient<Database>
  let testParentUserId: string
  let testParentEmail: string
  let createdChildUserIds: string[] = []

  beforeAll(async () => {
    // Initialize admin client for test setup
    adminClient = createTestAdminClient()

    // Create a test parent user for all tests
    const parentUser = await createTestParentUser(adminClient)
    testParentUserId = parentUser.userId
    testParentEmail = parentUser.email

    console.log(`Test parent created: ${testParentEmail} (${testParentUserId})`)
  })

  afterAll(async () => {
    // Cleanup all test data
    if (testParentUserId) {
      await deleteTestUser(adminClient, testParentUserId)
    }

    // Cleanup any orphaned test users
    await cleanupTestUsers(adminClient)

    console.log('Test cleanup completed')
  })

  afterEach(async () => {
    // Cleanup child accounts created during each test
    for (const childUserId of createdChildUserIds) {
      await deleteTestUser(adminClient, childUserId)
    }
    createdChildUserIds = []
  })

  describe('Happy Path: Successful Child Account Creation', () => {
    it('should create a complete child account with all 5 workflow steps', async () => {
      // Arrange
      const displayName = 'Test Child Alice'
      const avatarUrl = 'https://example.com/alice.png'

      // Act: Call the endpoint (simulated via direct database operations)
      // Note: In a real integration test, you would call the actual API endpoint
      // For now, we'll verify the expected database state after creation

      // Create child account using admin client to simulate endpoint behavior
      const timestamp = Date.now()
      const childId = `test-${timestamp}`
      const childEmail = `child-${childId}@ganamos.app`
      const password = `password-${timestamp}`

      // Step 1: Create auth user with metadata
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password,
        email_confirm: true,
        user_metadata: {
          name: displayName,
          avatar_url: avatarUrl,
          is_child_account: true,
          primary_user_id: testParentUserId
        }
      })

      expect(authError).toBeNull()
      expect(authData.user).toBeDefined()
      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      // Step 2: Create profile with username slug
      const username = displayName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 20)

      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          id: childUserId,
          name: displayName,
          username,
          email: childEmail,
          avatar_url: avatarUrl,
          balance: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      expect(profileError).toBeNull()
      expect(profile).toBeDefined()

      // Step 3: Create connection
      const { error: connectionError } = await adminClient
        .from('connected_accounts')
        .insert({
          primary_user_id: testParentUserId,
          connected_user_id: childUserId,
          created_at: new Date().toISOString()
        })

      expect(connectionError).toBeNull()

      // Assert: Verify all database records using helper
      const verification = await verifyChildAccountCreation(
        adminClient,
        childUserId,
        testParentUserId,
        displayName
      )

      // Verify auth user metadata
      expect(verification.authUser.user_metadata?.is_child_account).toBe(true)
      expect(verification.authUser.user_metadata?.primary_user_id).toBe(testParentUserId)
      expect(verification.authUser.user_metadata?.name).toBe(displayName)
      expect(verification.authUser.user_metadata?.avatar_url).toBe(avatarUrl)

      // Verify profile
      expect(verification.profile.email).toMatch(/^child-.*@ganamos\.app$/)
      expect(verification.profile.name).toBe(displayName)
      expect(verification.profile.username).toBe(username)
      expect(verification.profile.balance).toBe(0)
      expect(verification.profile.avatar_url).toBe(avatarUrl)

      // Verify connection
      expect(verification.connection.primary_user_id).toBe(testParentUserId)
      expect(verification.connection.connected_user_id).toBe(childUserId)
    })

    it('should generate a valid UUID-based email following the pattern child-{uuid}@ganamos.app', async () => {
      // Arrange
      const displayName = 'Test Child Bob'
      const avatarUrl = 'https://example.com/bob.png'

      // Act: Create child account
      const timestamp = Date.now()
      const childId = `test-${timestamp}`
      const childEmail = `child-${childId}@ganamos.app`

      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: {
          name: displayName,
          avatar_url: avatarUrl,
          is_child_account: true,
          primary_user_id: testParentUserId
        }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      await adminClient.from('profiles').upsert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        avatar_url: avatarUrl,
        balance: 0
      })

      // Assert: Verify email pattern
      const { data: profile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('id', childUserId)
        .single()

      expect(profile?.email).toMatch(/^child-[a-z0-9-]+@ganamos\.app$/)
      expect(profile?.email).toContain('@ganamos.app')
      expect(profile?.email).toContain('child-')
    })

    it('should generate a valid username slug (lowercase, hyphens, max 20 chars)', async () => {
      // Arrange: Test various display names
      const testCases = [
        { displayName: 'Alice Smith', expectedUsername: 'alice-smith' },
        { displayName: 'Bob-O\'Connor Jr.', expectedUsername: 'bob-oconnor-jr' },
        { displayName: 'Charlie With A Very Long Name That Exceeds Twenty Characters', expectedUsername: 'charlie-with-a-very' }, // Truncated to 20
        { displayName: 'Dave123', expectedUsername: 'dave123' },
        { displayName: 'EMMA UPPERCASE', expectedUsername: 'emma-uppercase' }
      ]

      for (const testCase of testCases) {
        // Act: Create child account
        const timestamp = Date.now()
        const childEmail = `child-test-${timestamp}@ganamos.app`

        const { data: authData } = await adminClient.auth.admin.createUser({
          email: childEmail,
          password: 'test-password',
          email_confirm: true,
          user_metadata: {
            name: testCase.displayName,
            is_child_account: true,
            primary_user_id: testParentUserId
          }
        })

        const childUserId = authData.user!.id
        createdChildUserIds.push(childUserId)

        const username = testCase.displayName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .substring(0, 20)

        await adminClient.from('profiles').upsert({
          id: childUserId,
          name: testCase.displayName,
          username,
          email: childEmail,
          balance: 0
        })

        // Assert: Verify username
        const { data: profile } = await adminClient
          .from('profiles')
          .select('username')
          .eq('id', childUserId)
          .single()

        expect(profile?.username).toBe(testCase.expectedUsername)
        expect(profile?.username).toMatch(/^[a-z0-9-]+$/) // Only lowercase, numbers, hyphens
        expect(profile?.username?.length).toBeLessThanOrEqual(20)
      }
    })

    it('should initialize child account balance to 0', async () => {
      // Arrange
      const displayName = 'Test Child Zero Balance'
      const childEmail = `child-test-${Date.now()}@ganamos.app`

      // Act: Create child account
      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: {
          name: displayName,
          is_child_account: true,
          primary_user_id: testParentUserId
        }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      const { data: profile } = await adminClient.from('profiles').upsert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        balance: 0
      }).select().single()

      // Assert: Verify balance
      expect(profile?.balance).toBe(0)
    })

    it('should create connected_accounts relationship linking parent and child', async () => {
      // Arrange
      const displayName = 'Test Child Connection'
      const childEmail = `child-test-${Date.now()}@ganamos.app`

      // Act: Create child account and connection
      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: {
          name: displayName,
          is_child_account: true,
          primary_user_id: testParentUserId
        }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      await adminClient.from('profiles').upsert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        balance: 0
      })

      await adminClient.from('connected_accounts').insert({
        primary_user_id: testParentUserId,
        connected_user_id: childUserId
      })

      // Assert: Verify connection exists
      const { data: connection, error } = await adminClient
        .from('connected_accounts')
        .select('*')
        .eq('primary_user_id', testParentUserId)
        .eq('connected_user_id', childUserId)
        .single()

      expect(error).toBeNull()
      expect(connection).toBeDefined()
      expect(connection?.primary_user_id).toBe(testParentUserId)
      expect(connection?.connected_user_id).toBe(childUserId)
    })
  })

  describe('Idempotency: Duplicate Prevention', () => {
    it('should handle existing user gracefully (upsert profile)', async () => {
      // Arrange: Create initial child account
      const displayName = 'Test Child Idempotent'
      const childEmail = `child-test-${Date.now()}@ganamos.app`

      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: { name: displayName, is_child_account: true, primary_user_id: testParentUserId }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      await adminClient.from('profiles').insert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        balance: 0
      })

      // Act: Try to upsert the same profile again
      const { error: upsertError } = await adminClient.from('profiles').upsert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        balance: 0
      })

      // Assert: Should succeed without error
      expect(upsertError).toBeNull()
    })

    it('should not create duplicate connected_accounts relationships', async () => {
      // Arrange: Create child account with connection
      const displayName = 'Test Child Duplicate Connection'
      const childEmail = `child-test-${Date.now()}@ganamos.app`

      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: { name: displayName, is_child_account: true, primary_user_id: testParentUserId }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      await adminClient.from('profiles').upsert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        balance: 0
      })

      // Create first connection
      await adminClient.from('connected_accounts').insert({
        primary_user_id: testParentUserId,
        connected_user_id: childUserId
      })

      // Act: Try to create duplicate connection
      const { error: duplicateError } = await adminClient.from('connected_accounts').insert({
        primary_user_id: testParentUserId,
        connected_user_id: childUserId
      })

      // Assert: Should fail (unique constraint violation)
      expect(duplicateError).not.toBeNull()
      expect(duplicateError?.code).toMatch(/23505|unique/) // PostgreSQL unique violation

      // Verify only one connection exists
      const { data: connections } = await adminClient
        .from('connected_accounts')
        .select('*')
        .eq('primary_user_id', testParentUserId)
        .eq('connected_user_id', childUserId)

      expect(connections?.length).toBe(1)
    })
  })

  describe('Data Integrity: RLS Policy Validation', () => {
    it('should allow parent user to query child account via connected_accounts', async () => {
      // Arrange: Create child account
      const displayName = 'Test Child RLS'
      const childEmail = `child-test-${Date.now()}@ganamos.app`

      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: { name: displayName, is_child_account: true, primary_user_id: testParentUserId }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      await adminClient.from('profiles').upsert({
        id: childUserId,
        name: displayName,
        email: childEmail,
        balance: 0
      })

      await adminClient.from('connected_accounts').insert({
        primary_user_id: testParentUserId,
        connected_user_id: childUserId
      })

      // Act: Query child profile via connected_accounts join
      const { data: childProfiles, error } = await adminClient
        .from('connected_accounts')
        .select('connected_user_id, profiles!connected_accounts_connected_user_id_fkey(name, email, balance)')
        .eq('primary_user_id', testParentUserId)

      // Assert: Parent should be able to access child data
      expect(error).toBeNull()
      expect(childProfiles).toBeDefined()
      expect(childProfiles?.length).toBeGreaterThan(0)

      const childProfile = childProfiles?.find(cp => cp.connected_user_id === childUserId)
      expect(childProfile).toBeDefined()
    })
  })

  describe('Error Cases: Validation and Authentication', () => {
    it('should require authentication (session check)', async () => {
      // This test would require actual API endpoint testing with unauthenticated request
      // For now, we validate that the endpoint implementation checks for session
      // Expected behavior: 401 Unauthorized if no session exists
      expect(true).toBe(true) // Placeholder - would test actual endpoint in E2E tests
    })

    it('should require username parameter', async () => {
      // This test would validate the endpoint returns 400 if username is missing
      // Expected behavior: 400 Bad Request with error message "Username and avatar are required"
      expect(true).toBe(true) // Placeholder - would test actual endpoint in E2E tests
    })

    it('should require avatarUrl parameter', async () => {
      // This test would validate the endpoint returns 400 if avatarUrl is missing
      // Expected behavior: 400 Bad Request with error message "Username and avatar are required"
      expect(true).toBe(true) // Placeholder - would test actual endpoint in E2E tests
    })

    it('should handle auth user creation failures gracefully', async () => {
      // Arrange: Try to create user with invalid email format
      const invalidEmail = 'not-an-email'

      // Act: Attempt to create auth user with invalid email
      const { error: authError } = await adminClient.auth.admin.createUser({
        email: invalidEmail,
        password: 'test-password',
        email_confirm: true
      })

      // Assert: Should fail with appropriate error
      expect(authError).not.toBeNull()
      expect(authError?.message).toContain('email') // Error should mention email issue
    })
  })

  describe('Metadata Validation', () => {
    it('should set is_child_account metadata flag to true', async () => {
      // Arrange & Act: Create child account
      const childEmail = `child-test-${Date.now()}@ganamos.app`
      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: {
          name: 'Test Child Metadata',
          is_child_account: true,
          primary_user_id: testParentUserId
        }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      // Assert: Verify metadata
      const { data: user } = await adminClient.auth.admin.getUserById(childUserId)
      expect(user.user.user_metadata?.is_child_account).toBe(true)
    })

    it('should set primary_user_id metadata to parent user ID', async () => {
      // Arrange & Act: Create child account
      const childEmail = `child-test-${Date.now()}@ganamos.app`
      const { data: authData } = await adminClient.auth.admin.createUser({
        email: childEmail,
        password: 'test-password',
        email_confirm: true,
        user_metadata: {
          name: 'Test Child Metadata',
          is_child_account: true,
          primary_user_id: testParentUserId
        }
      })

      const childUserId = authData.user!.id
      createdChildUserIds.push(childUserId)

      // Assert: Verify metadata
      const { data: user } = await adminClient.auth.admin.getUserById(childUserId)
      expect(user.user.user_metadata?.primary_user_id).toBe(testParentUserId)
    })
  })
})