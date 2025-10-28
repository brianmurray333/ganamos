import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Determine if we're running integration tests (by checking test file path)
const isIntegrationTest = () => {
  const testPath = expect.getState().testPath || ''
  return testPath.includes('integration/')
}

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

// Conditionally mock Supabase client
// For integration tests, use real Supabase connection
// For unit tests, use mocked client
if (!isIntegrationTest()) {
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
}

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