import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Database utilities for integration tests
 * Provides functions for setup, cleanup, and test data management
 */

export interface TestSupabaseClient {
  supabase: ReturnType<typeof createClient<Database>>
  trackUser: (userId: string) => void
  trackProfile: (profileId: string) => void
  trackConnection: (connectionId: string) => void
  cleanup: () => Promise<void>
}

/**
 * Create a test Supabase client with admin privileges
 * Uses service role key to bypass RLS policies for test setup
 */
export function createTestSupabaseClient(): TestSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing test environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
    )
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const createdUserIds: string[] = []
  const createdProfileIds: string[] = []
  const createdConnectionIds: string[] = []

  return {
    supabase,
    trackUser: (userId: string) => {
      if (!createdUserIds.includes(userId)) {
        createdUserIds.push(userId)
      }
    },
    trackProfile: (profileId: string) => {
      if (!createdProfileIds.includes(profileId)) {
        createdProfileIds.push(profileId)
      }
    },
    trackConnection: (connectionId: string) => {
      if (!createdConnectionIds.includes(connectionId)) {
        createdConnectionIds.push(connectionId)
      }
    },
    cleanup: async () => {
      // Clean up in reverse order of creation to maintain referential integrity
      if (createdConnectionIds.length > 0) {
        const { error: connError } = await supabase
          .from('connected_accounts')
          .delete()
          .in('id', createdConnectionIds)
        if (connError) {
          console.warn('Failed to cleanup connections:', connError.message)
        }
      }

      if (createdProfileIds.length > 0) {
        const { error: profileError } = await supabase
          .from('profiles')
          .delete()
          .in('id', createdProfileIds)
        if (profileError) {
          console.warn('Failed to cleanup profiles:', profileError.message)
        }
      }

      if (createdUserIds.length > 0) {
        // Delete auth users (requires service role)
        for (const userId of createdUserIds) {
          const { error: userError } = await supabase.auth.admin.deleteUser(userId)
          if (userError) {
            console.warn(`Failed to cleanup user ${userId}:`, userError.message)
          }
        }
      }

      // Clear the tracking arrays
      createdConnectionIds.length = 0
      createdProfileIds.length = 0
      createdUserIds.length = 0
    },
  }
}

/**
 * Clean up test data by email pattern
 * Useful for cleaning up child accounts created during tests
 */
export async function cleanupTestAccountsByEmail(
  supabase: ReturnType<typeof createClient<Database>>,
  emailPattern: string
): Promise<void> {
  // Find profiles matching email pattern
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .like('email', emailPattern)

  if (!profiles || profiles.length === 0) return

  const profileIds = profiles.map((p) => p.id)

  // Delete connected_accounts relationships
  await supabase
    .from('connected_accounts')
    .delete()
    .or(`primary_user_id.in.(${profileIds.join(',')}),connected_user_id.in.(${profileIds.join(',')})`)

  // Delete profiles
  await supabase
    .from('profiles')
    .delete()
    .in('id', profileIds)

  // Delete auth users
  for (const profileId of profileIds) {
    await supabase.auth.admin.deleteUser(profileId)
  }
}

/**
 * Wait for database operation to complete
 * Useful for ensuring async operations finish before assertions
 */
export async function waitForDatabase(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Verify profile exists in database
 */
export async function verifyProfileExists(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  return !error && !!data
}

/**
 * Verify connected_accounts relationship exists
 */
export async function verifyConnectionExists(
  supabase: ReturnType<typeof createClient<Database>>,
  primaryUserId: string,
  connectedUserId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('primary_user_id', primaryUserId)
    .eq('connected_user_id', connectedUserId)
    .single()

  return !error && !!data
}