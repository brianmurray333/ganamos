import { beforeEach, afterEach, vi } from 'vitest'
import { createMockSupabaseClient, resetMockSupabaseClient } from './mocks/supabase-mock'
import '@testing-library/jest-dom/vitest'

// Create global mock Supabase client that all tests share
export const mockSupabaseClient = createMockSupabaseClient()

// Global mock for @/lib/supabase - all tests get this automatically
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createBrowserSupabaseClient: vi.fn(() => mockSupabaseClient),
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

// Setup global test environment
beforeEach(() => {
  vi.clearAllMocks()
  resetMockSupabaseClient(mockSupabaseClient)
})

afterEach(() => {
  vi.clearAllMocks()
})

// Mock environment variables (only if not already set - allows CI to use real values)
process.env.NODE_ENV = 'test'
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key'
process.env.SUPABASE_SECRET_API_KEY = process.env.SUPABASE_SECRET_API_KEY || 'mock-service-role-key'
