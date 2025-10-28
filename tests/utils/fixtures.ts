import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Test data fixtures for creating test users and accounts
 * Provides factory functions for consistent test data generation
 */

export interface TestParentUser {
  id: string
  email: string
  password: string
  name: string
  username: string
  avatarUrl: string
}

export interface TestChildAccount {
  id: string
  email: string
  name: string
  username: string
  avatarUrl: string
  primaryUserId: string
}

/**
 * Create a test parent user with profile
 */
export async function createTestParentUser(
  supabase: ReturnType<typeof createClient<Database>>,
  overrides?: Partial<TestParentUser>,
  trackingCallbacks?: {
    trackUser?: (userId: string) => void
    trackProfile?: (profileId: string) => void
  }
): Promise<TestParentUser> {
  const userId = uuidv4()
  const email = overrides?.email || `test-parent-${userId}@test.com`
  const password = overrides?.password || `test-password-${uuidv4()}`
  const name = overrides?.name || 'Test Parent'
  const username = overrides?.username || `testparent${userId.substring(0, 8)}`
  const avatarUrl = overrides?.avatarUrl || '/images/avatars/default.png'

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      avatar_url: avatarUrl,
    },
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create test parent user: ${authError?.message}`)
  }

  // Track user for cleanup
  trackingCallbacks?.trackUser?.(authData.user.id)

  // Wait a bit for any automatic profile creation to complete
  await new Promise(resolve => setTimeout(resolve, 100))

  // Check if profile already exists (might be created by database trigger)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authData.user.id)
    .single()

  if (!existingProfile) {
    // Create profile if it doesn't exist
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email,
      name,
      username,
      avatar_url: avatarUrl,
      balance: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      // Cleanup auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Failed to create test parent profile: ${profileError.message}`)
    }
  } else {
    // Update existing profile with test data
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        email,
        name,
        username,
        avatar_url: avatarUrl,
        balance: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

    if (updateError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Failed to update test parent profile: ${updateError.message}`)
    }
  }

  // Track profile for cleanup
  trackingCallbacks?.trackProfile?.(authData.user.id)

  return {
    id: authData.user.id,
    email,
    password,
    name,
    username,
    avatarUrl,
  }
}

/**
 * Create a test child account with connection to parent
 */
export async function createTestChildAccount(
  supabase: ReturnType<typeof createClient<Database>>,
  primaryUserId: string,
  overrides?: Partial<Omit<TestChildAccount, 'id' | 'primaryUserId'>>
): Promise<TestChildAccount> {
  const childId = uuidv4()
  const email = overrides?.email || `child-${childId}@ganamos.app`
  const name = overrides?.name || 'Test Child'
  const username = overrides?.username || `testchild${childId.substring(0, 8)}`
  const avatarUrl = overrides?.avatarUrl || '/images/avatars/ghibli-1.png'
  const password = uuidv4()

  // Create auth user with child account metadata
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      avatar_url: avatarUrl,
      is_child_account: true,
      primary_user_id: primaryUserId,
    },
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create test child user: ${authError?.message}`)
  }

  // Wait a bit for any automatic profile creation to complete
  await new Promise(resolve => setTimeout(resolve, 100))

  // Check if profile already exists (might be created by database trigger)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authData.user.id)
    .single()

  if (!existingProfile) {
    // Create profile if it doesn't exist
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email,
      name,
      username,
      avatar_url: avatarUrl,
      balance: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Failed to create test child profile: ${profileError.message}`)
    }
  } else {
    // Update existing profile with test data
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        email,
        name,
        username,
        avatar_url: avatarUrl,
        balance: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

    if (updateError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Failed to update test child profile: ${updateError.message}`)
    }
  }

  // Create connected_accounts relationship
  const { error: connectionError } = await supabase.from('connected_accounts').insert({
    primary_user_id: primaryUserId,
    connected_user_id: authData.user.id,
    created_at: new Date().toISOString(),
  })

  if (connectionError) {
    await supabase.from('profiles').delete().eq('id', authData.user.id)
    await supabase.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create connection: ${connectionError.message}`)
  }

  return {
    id: authData.user.id,
    email,
    name,
    username,
    avatarUrl,
    primaryUserId,
  }
}

/**
 * Generate valid child account avatar URLs
 */
export const VALID_CHILD_AVATARS = [
  '/images/avatars/ghibli-1.png',
  '/images/avatars/ghibli-2.png',
  '/images/avatars/ghibli-3.png',
  '/images/avatars/ghibli-4.png',
  '/images/avatars/ghibli-5.png',
  '/images/avatars/ghibli-6.png',
  '/images/avatars/ghibli-7.png',
]

/**
 * Generate valid username test cases
 */
export function generateValidUsernames(): string[] {
  return [
    'testuser',
    'test-user',
    'test-user-123',
    'a', // minimum length
    'a'.repeat(20), // maximum length
  ]
}

/**
 * Generate invalid username test cases
 */
export function generateInvalidUsernames(): string[] {
  return [
    '', // empty
    'Test User', // spaces
    'test_user', // underscore
    'test.user', // period
    'test@user', // special char
    'TestUser', // uppercase
    'a'.repeat(21), // too long
  ]
}