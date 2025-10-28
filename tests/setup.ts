import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  usePathname: () => '/test-path',
  useParams: () => ({}),
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Test Helper Functions for Integration Tests

/**
 * Creates a mock Supabase client with chainable methods
 */
export const mockSupabaseClient = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    admin: {
      deleteUser: vi.fn(),
    },
  },
  from: vi.fn(() => mockSupabaseClient),
  select: vi.fn(() => mockSupabaseClient),
  insert: vi.fn(() => mockSupabaseClient),
  update: vi.fn(() => mockSupabaseClient),
  delete: vi.fn(() => mockSupabaseClient),
  eq: vi.fn(() => mockSupabaseClient),
  order: vi.fn(() => mockSupabaseClient),
  single: vi.fn(),
}

/**
 * Creates a mock session object
 */
export function createMockSession(userId: string) {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    access_token: 'mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    refresh_token: 'mock-refresh-token',
  }
}

/**
 * Creates a mock profile object
 */
export function createMockProfile(overrides: any = {}) {
  return {
    id: 'user-id',
    email: 'user@example.com',
    name: 'Test User',
    username: 'testuser',
    balance: 1000,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    fixed_issues_count: 0,
    status: 'active',
    ...overrides,
  }
}

/**
 * Creates a mock child account profile with @ganamos.app email
 */
export function createMockChildAccount(overrides: any = {}) {
  const childId = overrides.id || 'child-account-id'
  return {
    id: childId,
    email: `${childId}@ganamos.app`,
    name: 'Child Account',
    username: `child_${childId}`,
    balance: 500,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    fixed_issues_count: 0,
    status: 'active',
    ...overrides,
  }
}

/**
 * Creates a mock connected_accounts relationship
 */
export function createMockConnection(primaryUserId: string, connectedUserId: string, overrides: any = {}) {
  return {
    id: `connection-${primaryUserId}-${connectedUserId}`,
    primary_user_id: primaryUserId,
    connected_user_id: connectedUserId,
    relationship_type: 'parent_child',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Creates a mock transaction object
 */
export function createMockTransaction(userId: string, overrides: any = {}) {
  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  return {
    id: txId,
    user_id: userId,
    type: 'deposit',
    amount: 100,
    status: 'completed',
    payment_request: null,
    payment_hash: null,
    r_hash_str: null,
    memo: 'Test transaction',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}