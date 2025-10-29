import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

/**
 * Test Helper Utilities for Child Account Integration Tests
 * 
 * This file provides utilities for integration testing with a REAL Supabase database.
 * It includes:
 * - Supabase client initialization with service role
 * - Database cleanup functions for test isolation
 * - Factory functions for creating test data
 * - Mock session helpers for authentication tests
 */

// Test environment validation
export function validateTestEnvironment() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]

  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required test environment variables: ${missing.join(', ')}\n` +
      'Please create a .env.test file with test database credentials.'
    )
  }
}

// Create admin Supabase client with service role for test setup/teardown
export function createTestAdminClient(): SupabaseClient<Database> {
  validateTestEnvironment()
  
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Create authenticated client for testing user operations
export function createTestAuthClient(): SupabaseClient<Database> {
  validateTestEnvironment()
  
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Test Data Factory: Create a parent user for testing
 * Returns user ID and profile data
 */
export async function createTestParentUser(
  adminClient: SupabaseClient<Database>,
  overrides?: {
    email?: string
    name?: string
    username?: string
  }
) {
  const timestamp = Date.now()
  const email = overrides?.email || `test-parent-${timestamp}@test.com`
  const name = overrides?.name || `Test Parent ${timestamp}`
  const username = overrides?.username || `test_parent_${timestamp}`
  
  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: {
      name,
      username
    }
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create test parent user: ${authError?.message}`)
  }

  // Create profile
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      name,
      username,
      balance: 1000, // Give test parent some balance
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (profileError) {
    // Cleanup auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create test parent profile: ${profileError.message}`)
  }

  return {
    userId: authData.user.id,
    email,
    name,
    username,
    profile
  }
}

/**
 * Test Data Factory: Create a child account for testing
 * Returns user ID, email, and profile data
 */
export async function createTestChildAccount(
  adminClient: SupabaseClient<Database>,
  primaryUserId: string,
  overrides?: {
    displayName?: string
    avatarUrl?: string
  }
) {
  const timestamp = Date.now()
  const childId = `test-child-${timestamp}`
  const email = `child-${childId}@ganamos.app`
  const displayName = overrides?.displayName || `Test Child ${timestamp}`
  const avatarUrl = overrides?.avatarUrl || 'https://example.com/avatar.png'

  // Create auth user with metadata
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: {
      name: displayName,
      avatar_url: avatarUrl,
      is_child_account: true,
      primary_user_id: primaryUserId
    }
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create test child user: ${authError?.message}`)
  }

  // Generate username slug
  const username = displayName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 20)

  // Create profile
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      name: displayName,
      username,
      avatar_url: avatarUrl,
      balance: 0, // Child accounts start with 0 balance
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (profileError) {
    // Cleanup auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create test child profile: ${profileError.message}`)
  }

  // Create connection
  const { error: connectionError } = await adminClient
    .from('connected_accounts')
    .insert({
      primary_user_id: primaryUserId,
      connected_user_id: authData.user.id,
      created_at: new Date().toISOString()
    })

  if (connectionError) {
    // Cleanup on failure
    await adminClient.auth.admin.deleteUser(authData.user.id)
    await adminClient.from('profiles').delete().eq('id', authData.user.id)
    throw new Error(`Failed to create test connection: ${connectionError.message}`)
  }

  return {
    userId: authData.user.id,
    email,
    displayName,
    username,
    avatarUrl,
    profile
  }
}

/**
 * Database Cleanup: Delete test user and all related data
 */
export async function deleteTestUser(
  adminClient: SupabaseClient<Database>,
  userId: string
) {
  // Delete in reverse order of creation to avoid foreign key issues

  // 1. Delete connected_accounts relationships (both as primary and connected user)
  await adminClient
    .from('connected_accounts')
    .delete()
    .or(`primary_user_id.eq.${userId},connected_user_id.eq.${userId}`)

  // 2. Delete profile
  await adminClient
    .from('profiles')
    .delete()
    .eq('id', userId)

  // 3. Delete auth user (this cascades to any remaining related data)
  await adminClient.auth.admin.deleteUser(userId)
}

/**
 * Database Cleanup: Delete all test users created during test run
 * Identifies test users by email pattern (test-parent-*, child-test-child-*)
 */
export async function cleanupTestUsers(adminClient: SupabaseClient<Database>) {
  // Find all test profiles
  const { data: testProfiles } = await adminClient
    .from('profiles')
    .select('id, email')
    .or(`email.like.test-parent-%@test.com,email.like.child-test-child-%@ganamos.app`)

  if (!testProfiles || testProfiles.length === 0) {
    return
  }

  // Delete each test user
  for (const profile of testProfiles) {
    await deleteTestUser(adminClient, profile.id)
  }
}

/**
 * Mock Session Helper: Create a mock session object for testing authenticated endpoints
 */
export function createMockSession(userId: string, email: string) {
  return {
    user: {
      id: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString()
    },
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    token_type: 'bearer'
  }
}

/**
 * Verification Helper: Check if a child account was created correctly
 */
export async function verifyChildAccountCreation(
  adminClient: SupabaseClient<Database>,
  childUserId: string,
  expectedPrimaryUserId: string,
  expectedDisplayName: string
) {
  // 1. Verify auth user metadata
  const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(childUserId)
  
  if (authError) {
    throw new Error(`Failed to verify auth user: ${authError.message}`)
  }

  // Check metadata
  if (!authUser.user.user_metadata?.is_child_account) {
    throw new Error('Auth user missing is_child_account metadata')
  }

  if (authUser.user.user_metadata?.primary_user_id !== expectedPrimaryUserId) {
    throw new Error(
      `Auth user has incorrect primary_user_id: expected ${expectedPrimaryUserId}, ` +
      `got ${authUser.user.user_metadata?.primary_user_id}`
    )
  }

  // 2. Verify profile
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', childUserId)
    .single()

  if (profileError) {
    throw new Error(`Failed to verify profile: ${profileError.message}`)
  }

  if (profile.balance !== 0) {
    throw new Error(`Profile has incorrect balance: expected 0, got ${profile.balance}`)
  }

  if (profile.name !== expectedDisplayName) {
    throw new Error(`Profile has incorrect name: expected ${expectedDisplayName}, got ${profile.name}`)
  }

  // Verify email pattern
  if (!profile.email.startsWith('child-') || !profile.email.endsWith('@ganamos.app')) {
    throw new Error(`Profile has incorrect email pattern: ${profile.email}`)
  }

  // 3. Verify connection
  const { data: connection, error: connectionError } = await adminClient
    .from('connected_accounts')
    .select('*')
    .eq('primary_user_id', expectedPrimaryUserId)
    .eq('connected_user_id', childUserId)
    .single()

  if (connectionError) {
    throw new Error(`Failed to verify connection: ${connectionError.message}`)
  }

  return {
    authUser: authUser.user,
    profile,
    connection
  }
}