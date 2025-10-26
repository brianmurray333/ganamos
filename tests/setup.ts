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
  createServerSupabaseClient: vi.fn(() => ({
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

// Mock email library
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
}))

// Mock nostr-tools library
vi.mock('nostr-tools', () => {
  const mockPublish = vi.fn((relays: string[], event: any) => {
    // Return promises for each relay (can be customized in tests)
    return relays.map(() => Promise.resolve())
  })

  const MockSimplePool = vi.fn().mockImplementation(() => ({
    publish: mockPublish,
    close: vi.fn(),
  }))

  return {
    SimplePool: MockSimplePool,
    finalizeEvent: vi.fn((template: any, privateKey: Uint8Array) => ({
      ...template,
      id: 'mock-event-id-' + Date.now(),
      pubkey: 'mock-pubkey-' + Array.from(privateKey.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(''),
      sig: 'mock-signature-' + Date.now(),
    })),
    getPublicKey: vi.fn((privateKey: Uint8Array) => {
      // Return a mock public key derived from private key for consistency
      return Array.from(privateKey.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('')
    }),
    generateSecretKey: vi.fn(() => new Uint8Array(32).fill(0xAB)),
  }
})

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