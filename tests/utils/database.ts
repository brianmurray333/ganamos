import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Test database utilities for integration tests
 * Provides Supabase client setup and cleanup helpers
 */

let testSupabaseClient: SupabaseClient<Database> | null = null
// Track created test profiles and posts for cleanup
let createdTestProfileIds: Set<string> = new Set()
let createdTestPostIds: Set<number> = new Set()

/**
 * Get or create test Supabase client with service role key
 * Uses environment variables from .env.local or test environment
 */
export function getTestSupabaseClient(): SupabaseClient<Database> {
  if (testSupabaseClient) {
    return testSupabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local'
    )
  }

  testSupabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return testSupabaseClient
}

/**
 * Create a test profile in the database
 * Returns the created profile ID
 */
export async function createTestProfile(overrides: Partial<Database['public']['Tables']['profiles']['Insert']> = {}) {
  const client = getTestSupabaseClient()
  const timestamp = Date.now()
  
  const testProfile: Database['public']['Tables']['profiles']['Insert'] = {
    id: overrides.id || uuidv4(),
    email: overrides.email || `test-${timestamp}@example.com`,
    name: overrides.name || `Test User ${timestamp}`,
    username: overrides.username || `testuser${timestamp}`,
    balance: overrides.balance ?? 0,
    fixed_issues_count: overrides.fixed_issues_count ?? 0,
    ...overrides,
  }

  const { data, error } = await client
    .from('profiles')
    .insert(testProfile)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create test profile: ${error.message}`)
  }

  // Track created profile for cleanup
  createdTestProfileIds.add(data.id)

  return data
}

/**
 * Create a test post in the database
 * Returns the created post
 */
export async function createTestPost(
  userId: string,
  overrides: Partial<Database['public']['Tables']['posts']['Insert']> = {}
) {
  const client = getTestSupabaseClient()
  const timestamp = Date.now()

  const testPost: Database['public']['Tables']['posts']['Insert'] = {
    user_id: userId,
    title: overrides.title || `Test Issue ${timestamp}`,
    description: overrides.description || 'Test issue description',
    image_url: overrides.image_url || 'https://example.com/test-image.jpg',
    location: overrides.location || 'Test Location',
    reward: overrides.reward ?? 100,
    ...overrides,
  }

  const { data, error } = await client
    .from('posts')
    .insert(testPost)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create test post: ${error.message}`)
  }

  // Track created post for cleanup
  createdTestPostIds.add(data.id)

  return data
}

/**
 * Clean up test profiles that were created during tests
 * Useful for cleanup in afterEach/afterAll hooks
 */
export async function cleanupTestProfiles() {
  const client = getTestSupabaseClient()
  
  if (createdTestProfileIds.size === 0) {
    return
  }

  const idsToDelete = Array.from(createdTestProfileIds)
  
  const { error } = await client
    .from('profiles')
    .delete()
    .in('id', idsToDelete)

  if (error) {
    console.error('Error cleaning up test profiles:', error)
  }

  // Clear tracked IDs after cleanup
  createdTestProfileIds.clear()
}

/**
 * Clean up test posts that were created during tests
 * Useful for cleanup in afterEach/afterAll hooks
 */
export async function cleanupTestPosts() {
  const client = getTestSupabaseClient()
  
  if (createdTestPostIds.size === 0) {
    return
  }

  const idsToDelete = Array.from(createdTestPostIds)
  
  const { error } = await client
    .from('posts')
    .delete()
    .in('id', idsToDelete)

  if (error) {
    console.error('Error cleaning up test posts:', error)
  }

  // Clear tracked IDs after cleanup
  createdTestPostIds.clear()
}

/**
 * Get profile by ID
 */
export async function getProfileById(profileId: string) {
  const client = getTestSupabaseClient()
  
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`)
  }

  return data
}

/**
 * Reset test database client (useful for testing reconnection scenarios)
 */
export function resetTestClient() {
  testSupabaseClient = null
}