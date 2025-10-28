import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Authentication utilities for integration tests
 * Provides session management and authentication helpers
 */

export interface TestSession {
  accessToken: string
  refreshToken: string
  userId: string
}

/**
 * Create an authenticated session for a test user
 */
export async function createTestSession(
  supabase: ReturnType<typeof createClient<Database>>,
  email: string,
  password: string
): Promise<TestSession> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    throw new Error(`Failed to create test session: ${error?.message}`)
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.user.id,
  }
}

/**
 * Get Supabase project reference from URL
 */
function getProjectRef(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  // Extract project ref from URL (e.g., https://piluvdxahsstsgcseybj.supabase.co)
  const match = supabaseUrl.match(/https:\/\/([^.]+)\./)
  if (!match) {
    throw new Error('Could not extract project reference from NEXT_PUBLIC_SUPABASE_URL')
  }
  return match[1]
}

/**
 * Create session cookie string matching Supabase auth-helpers format
 * Session is stored as JSON array: [access_token, refresh_token, provider_token, provider_refresh_token, factors]
 * Then chunked into cookies if needed (max 3180 chars per cookie)
 */
export function createSessionCookie(accessToken: string, refreshToken: string): string {
  const projectRef = getProjectRef()
  const cookieBaseName = `sb-${projectRef}-auth-token`
  
  // Create session array matching Supabase auth-helpers format
  const sessionArray = [
    accessToken,
    refreshToken,
    null, // provider_token
    null, // provider_refresh_token
    null  // factors
  ]
  
  const sessionStr = JSON.stringify(sessionArray)
  
  // Check if chunking is needed (max 3180 chars)
  const MAX_CHUNK_SIZE = 3180
  if (sessionStr.length <= MAX_CHUNK_SIZE) {
    // Single cookie
    return `${cookieBaseName}=${sessionStr}`
  }
  
  // Multiple chunked cookies
  const chunks: string[] = []
  for (let i = 0; i < sessionStr.length; i += MAX_CHUNK_SIZE) {
    const chunk = sessionStr.substring(i, i + MAX_CHUNK_SIZE)
    const chunkIndex = Math.floor(i / MAX_CHUNK_SIZE)
    chunks.push(`${cookieBaseName}.${chunkIndex}=${chunk}`)
  }
  
  return chunks.join('; ')
}

/**
 * Sign out and clean up session
 */
export async function cleanupTestSession(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Create headers with authentication for API route testing
 * Uses the Supabase auth-helpers cookie format
 */
export function createAuthHeaders(accessToken: string, refreshToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Cookie: createSessionCookie(accessToken, refreshToken),
  }
}

/**
 * Verify user has correct metadata
 */
export async function verifyUserMetadata(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  expectedMetadata: Record<string, any>
): Promise<boolean> {
  const { data, error } = await supabase.auth.admin.getUserById(userId)

  if (error || !data.user) {
    return false
  }

  const metadata = data.user.user_metadata

  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (metadata[key] !== value) {
      return false
    }
  }

  return true
}