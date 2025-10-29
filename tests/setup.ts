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

// Mock nostr-tools library to prevent real WebSocket connections
vi.mock('nostr-tools', () => ({
  SimplePool: vi.fn().mockImplementation(() => ({
    publish: vi.fn((relays: string[], event: any) => {
      // Return array of promises, one per relay
      // Default to all successful - tests can override this behavior
      return relays.map(() => Promise.resolve())
    }),
    close: vi.fn(),
  })),
  finalizeEvent: vi.fn((template: any, secretKey: Uint8Array) => ({
    ...template,
    id: 'mock-event-id-' + Date.now(),
    pubkey: 'mock-pubkey-' + Buffer.from(secretKey.slice(0, 8)).toString('hex'),
    sig: 'mock-signature-' + Math.random().toString(36).substring(7),
  })),
  getPublicKey: vi.fn((secretKey: Uint8Array) => {
    // Return deterministic public key based on secret key - use the secret key bytes as pubkey
    return secretKey
  }),
  generateSecretKey: vi.fn(() => {
    // Return random test secret key (32 bytes)
    const key = new Uint8Array(32)
    // Fill with random values to make each call unique
    for (let i = 0; i < 32; i++) {
      key[i] = Math.floor(Math.random() * 256)
    }
    return key
  }),
}))

// Set test environment variables
process.env.NOSTR_PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000000'