import { vi } from 'vitest'

/**
 * Creates a mock authenticated user for testing
 */
export function createMockUser(overrides: Partial<{
  id: string
  email: string
  aud: string
  role: string
}> = {}) {
  return {
    id: overrides.id || 'test-user-id',
    email: overrides.email || 'test@example.com',
    aud: overrides.aud || 'authenticated',
    role: overrides.role || 'authenticated',
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Mocks an authenticated Supabase client
 */
export function mockAuthenticatedClient(user: ReturnType<typeof createMockUser>) {
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  }
}

/**
 * Mocks an unauthenticated Supabase client (no user)
 */
export function mockUnauthenticatedClient() {
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  }
}

/**
 * Mocks a Supabase client with invalid/expired token
 */
export function mockExpiredTokenClient() {
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: null },
        error: { message: 'Token expired' },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  }
}