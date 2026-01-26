/**
 * Supabase client factories for real database tests.
 *
 * - getServiceClient(): Bypasses RLS, use for setup/assertions
 * - getAnonClient(): Respects RLS, use for testing public access
 * - getAuthenticatedClient(): Authenticated as specific user, respects RLS
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import type { Database } from '@/lib/database.types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
// Local Supabase JWT secret (from `supabase start` output)
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

/**
 * Get a Supabase client with service role (bypasses RLS).
 * Use this for test setup and direct assertions.
 */
export function getServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, process.env.SUPABASE_SECRET_API_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Get a Supabase client with anon key (respects RLS).
 * Use this for testing unauthenticated/public access.
 */
export function getAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Get a Supabase client authenticated as a specific user.
 * Uses JWT to simulate the user's session, respects RLS policies.
 */
export function getAuthenticatedClient(userId: string): SupabaseClient<Database> {
  const token = jwt.sign(
    {
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET
  )

  return createClient<Database>(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
}

/**
 * Create a mock for createRouteHandlerClient that returns a real authenticated client.
 * Use with vi.mock('@supabase/auth-helpers-nextjs') in tests.
 *
 * Note: We override auth methods but keep the original client's from/rpc methods intact
 * by using Object.create to preserve the prototype chain.
 */
export function createMockRouteHandlerClient(userId: string) {
  const client = getAuthenticatedClient(userId)

  // Override auth methods while preserving the original client's methods
  // We need to return an object that has `from`, `rpc`, etc. from the original client
  const mockClient = Object.create(client)

  // Override auth with mock implementations
  mockClient.auth = {
    ...client.auth,
    getUser: async () => ({
      data: {
        user: {
          id: userId,
          email: `test-${userId.slice(0, 8)}@test.local`,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    }),
    getSession: async () => ({
      data: {
        session: {
          user: {
            id: userId,
            email: `test-${userId.slice(0, 8)}@test.local`,
            aud: 'authenticated',
            role: 'authenticated',
            created_at: new Date().toISOString(),
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
}
