import { vi } from 'vitest'

/**
 * Mocks a Supabase query chain that returns data
 */
export function mockSuccessfulQuery<T>(data: T) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data, error: null })),
    then: vi.fn((callback) => callback({ data, error: null })),
  }
}

/**
 * Mocks a Supabase query chain that returns an error
 */
export function mockFailedQuery(errorMessage: string) {
  const error = { message: errorMessage, details: '', hint: '', code: '' }
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data: null, error })),
    then: vi.fn((callback) => callback({ data: null, error })),
  }
}

/**
 * Mocks a Supabase query chain that returns empty results
 */
export function mockEmptyQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: vi.fn((callback) => callback({ data: null, error: null })),
  }
}

/**
 * Creates a mock Supabase client with configurable table responses
 */
export function createMockSupabaseClient(tableResponses: Record<string, any> = {}) {
  return {
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn((tableName: string) => {
      const response = tableResponses[tableName]
      if (response) {
        return response
      }
      // Default: return empty query chain
      return mockEmptyQuery()
    }),
  }
}

