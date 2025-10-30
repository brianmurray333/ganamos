/**
 * Authentication Test Helpers
 * 
 * Provides utilities for creating test authentication sessions
 * and user contexts for integration tests.
 */

import { Session, User } from '@supabase/supabase-js'
import { TEST_USER_IDS, TEST_PROFILES } from './fixtures'

/**
 * Creates a mock authentication session for testing
 */
export function createMockSession(userId: string = TEST_USER_IDS.PRIMARY): Session {
  return {
    access_token: `mock-token-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `mock-refresh-${userId}`,
    user: createMockUser(userId),
  }
}

/**
 * Creates a mock user object for testing
 */
export function createMockUser(userId: string = TEST_USER_IDS.PRIMARY): User {
  const profile = Object.values(TEST_PROFILES).find(p => p.id === userId) || TEST_PROFILES.PRIMARY_USER
  
  return {
    id: userId,
    app_metadata: {},
    user_metadata: {
      name: profile.name,
      avatar_url: profile.avatar_url,
    },
    aud: 'authenticated',
    created_at: profile.created_at,
    email: profile.email,
  } as User
}

/**
 * Creates a mock unauthenticated session (null user)
 */
export function createUnauthenticatedSession() {
  return {
    data: { session: null },
    error: null,
  }
}

/**
 * Creates a mock authenticated session response
 */
export function createAuthenticatedSessionResponse(userId: string = TEST_USER_IDS.PRIMARY) {
  return {
    data: { session: createMockSession(userId) },
    error: null,
  }
}

/**
 * Creates a mock getUser() response
 */
export function createGetUserResponse(userId: string = TEST_USER_IDS.PRIMARY) {
  return {
    data: { user: createMockUser(userId) },
    error: null,
  }
}

/**
 * Creates a mock unauthenticated getUser() response
 */
export function createUnauthenticatedUserResponse() {
  return {
    data: { user: null },
    error: { message: 'Not authenticated', status: 401 },
  }
}