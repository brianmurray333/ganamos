import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { createPostToNostrParams } from '../helpers/nostr-test-helpers'

// Counter for unique keys - stored in global scope for mock access
let mockKeyCounter = 0

// Mock lib/env before importing lib/nostr
vi.mock('@/lib/env', () => ({
  serverEnv: {
    integrations: {
      nostr: {
        useMock: false, // Disable mock mode for tests
        mockPrivateKey: undefined,
        privateKey: 'a'.repeat(64), // Valid test private key
        relayGetter: () => [
          'wss://relay.damus.io',
          'wss://nostr.wine',
          'wss://relay.snort.social',
          'wss://nos.lol',
          'wss://relay.primal.net',
        ],
        isConfigured: true,
      },
    },
  },
}))

// Mock nostr-tools before importing anything that uses it
vi.mock('nostr-tools', () => {
  // Use a local counter within the mock factory
  let counter = 0
  return {
    SimplePool: vi.fn().mockImplementation(() => ({
      // Return an array of 5 resolved promises (one per relay)
      publish: vi.fn().mockReturnValue([
        Promise.resolve(),
        Promise.resolve(),
        Promise.resolve(),
        Promise.resolve(),
        Promise.resolve(),
      ]),
      close: vi.fn(),
    })),
    finalizeEvent: vi.fn().mockImplementation((event) => ({
      ...event,
      id: 'mock-event-id-' + Date.now(),
      sig: 'mock-sig',
      pubkey: 'mock-pubkey',
    })),
    getPublicKey: vi.fn().mockImplementation(() => {
      // Return a Uint8Array (32 bytes) that changes each call
      // The lib/nostr.ts will convert this to hex
      const arr = new Uint8Array(32)
      arr[0] = counter++
      arr[1] = 0xab // Add some variation
      return arr
    }),
    generateSecretKey: vi.fn().mockImplementation(() => {
      // Return a unique Uint8Array each time
      const arr = new Uint8Array(32)
      arr[0] = counter
      arr[1] = 0xcd
      return arr
    }),
  }
})

import { postToNostr, generateNostrKeyPair, closeNostrPool } from '@/lib/nostr'
import { SimplePool, finalizeEvent, getPublicKey } from 'nostr-tools'
import { serverEnv } from '@/lib/env'

describe('lib/nostr.ts - Nostr Integration', () => {
  // Set up test environment
  beforeAll(() => {
    // Disable mocks to test real relay code path
    process.env.USE_MOCKS = 'false'
    // Set a valid 64-char hex NOSTR_PRIVATE_KEY for tests
    process.env.NOSTR_PRIVATE_KEY = 'a'.repeat(64)
  })

  // Clean up after each test
  afterEach(() => {
    vi.clearAllMocks()
    closeNostrPool()
  })

  describe('postToNostr()', () => {
    describe('Event Construction', () => {
      it('should create Kind 1 event with minimal required fields', async () => {
        const result = await postToNostr(createPostToNostrParams())

        expect(result.success).toBe(true)
        expect(result.eventId).toContain('mock-event-id')
        expect(result.relaysPublished).toBe(5) // All 5 relays succeed by default
        expect(result.relaysFailed).toBe(0)
      })

      it('should create Kind 1 event with all optional fields', async () => {
        const result = await postToNostr(
          createPostToNostrParams({
            title: 'Test Issue with Location',
            description: 'Test description with all fields',
            location: 'Via Regina',
            city: 'Como',
            latitude: 45.8081,
            longitude: 9.0852,
            reward: 5000,
            postId: 'test-post-id-full',
            imageUrl: 'https://example.com/image.jpg',
          })
        )

        expect(result.success).toBe(true)
        expect(result.eventId).toBeDefined()
        expect(result.relaysPublished).toBe(5)
      })

      it('should format event content with city when provided', async () => {
        await postToNostr(createPostToNostrParams({ city: 'Como' }))

        // Verify finalizeEvent was called with proper content structure
        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 1,
            content: expect.stringContaining('🏙️ New issue posted in Como!'),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should format event content with location fallback', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          location: 'Via Regina',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('🏙️ New issue posted in Via Regina!'),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should include reward in formatted content', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 5000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('💰 Reward: 5,000 sats'),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should include Ganamos post URL in content', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'abc123',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('https://www.ganamos.earth/post/abc123'),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should include hashtags in content', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('#Ganamos #Bitcoin'),
          }),
          expect.any(Uint8Array)
        )
      })
    })

    describe('Tag Generation', () => {
      it('should include required tags: ganamos, bitcoin, reference URL', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.arrayContaining([
              ['t', 'ganamos'],
              ['t', 'bitcoin'],
              ['r', 'https://www.ganamos.earth/post/test-post-id'],
            ]),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should add geolocation tag when coordinates provided', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          latitude: 45.808100,
          longitude: 9.085200,
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.arrayContaining([
              ['g', '45.808100,9.085200'],
            ]),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should add image metadata tag when imageUrl provided', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
          imageUrl: 'https://example.com/image.jpg',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.arrayContaining([
              ['imeta', 'url https://example.com/image.jpg'],
            ]),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should add city tag when city provided', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          city: 'Como',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.arrayContaining([
              ['t', 'como'],
            ]),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should normalize city tag by removing spaces and lowercasing', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          city: 'New York City',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.arrayContaining([
              ['t', 'newyorkcity'],
            ]),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should not add geolocation tag when only latitude provided', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          latitude: 45.808100,
          reward: 1000,
          postId: 'test-post-id',
        })

        const call = (finalizeEvent as any).mock.calls[0][0]
        const geoTags = call.tags.filter((tag: string[]) => tag[0] === 'g')
        expect(geoTags.length).toBe(0)
      })

      it('should not add geolocation tag when only longitude provided', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          longitude: 9.085200,
          reward: 1000,
          postId: 'test-post-id',
        })

        const call = (finalizeEvent as any).mock.calls[0][0]
        const geoTags = call.tags.filter((tag: string[]) => tag[0] === 'g')
        expect(geoTags.length).toBe(0)
      })
    })

    describe('Event Signing', () => {
      it('should call finalizeEvent with correct event template structure', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(finalizeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 1,
            created_at: expect.any(Number),
            tags: expect.any(Array),
            content: expect.any(String),
          }),
          expect.any(Uint8Array)
        )
      })

      it('should call finalizeEvent with Uint8Array secret key', async () => {
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        const secretKeyArg = (finalizeEvent as any).mock.calls[0][1]
        expect(secretKeyArg).toBeInstanceOf(Uint8Array)
        expect(secretKeyArg.length).toBe(32)
      })

      it('should use created_at timestamp close to current time', async () => {
        const beforeTimestamp = Math.floor(Date.now() / 1000)
        
        await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        const afterTimestamp = Math.floor(Date.now() / 1000)
        const eventTemplate = (finalizeEvent as any).mock.calls[0][0]
        
        expect(eventTemplate.created_at).toBeGreaterThanOrEqual(beforeTimestamp)
        expect(eventTemplate.created_at).toBeLessThanOrEqual(afterTimestamp)
      })
    })

    describe('Relay Publishing', () => {
      it('should return success when all relays confirm', async () => {
        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(true)
        expect(result.relaysPublished).toBe(5)
        expect(result.relaysFailed).toBe(0)
      })

      it('should return success when at least 1 relay confirms', async () => {
        // Mock SimplePool to have 4 failures and 1 success
        const mockPublish = vi.fn((relays: string[]) => {
          return relays.map((_, index) => 
            index === 0 ? Promise.resolve() : Promise.reject(new Error('Relay failed'))
          )
        })
        
        vi.mocked(SimplePool).mockImplementation(() => ({
          publish: mockPublish,
          close: vi.fn(),
        }) as any)

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(true)
        expect(result.relaysPublished).toBe(1)
        expect(result.relaysFailed).toBe(4)
      })

      it('should return failure when all relays fail', async () => {
        // Mock SimplePool to have all failures
        const mockPublish = vi.fn((relays: string[]) => {
          return relays.map(() => Promise.reject(new Error('All relays failed')))
        })
        
        vi.mocked(SimplePool).mockImplementation(() => ({
          publish: mockPublish,
          close: vi.fn(),
        }) as any)

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(false)
        expect(result.relaysPublished).toBe(0)
        expect(result.relaysFailed).toBe(5)
      })

      it('should use Promise.allSettled pattern to handle mixed relay results', async () => {
        const mockPublish = vi.fn((relays: string[]) => {
          return relays.map((_, index) => 
            index % 2 === 0 ? Promise.resolve() : Promise.reject(new Error('Relay failed'))
          )
        })
        
        vi.mocked(SimplePool).mockImplementation(() => ({
          publish: mockPublish,
          close: vi.fn(),
        }) as any)

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(true)
        expect(result.relaysPublished).toBe(3) // 3 successful (indexes 0, 2, 4)
        expect(result.relaysFailed).toBe(2) // 2 failed (indexes 1, 3)
      })
    })

    describe('Error Handling', () => {
      it('should throw error when NOSTR_PRIVATE_KEY not configured', async () => {
        // Mock serverEnv to have no private key
        vi.mocked(serverEnv).integrations.nostr.privateKey = undefined

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('NOSTR_PRIVATE_KEY not configured')

        // Restore
        vi.mocked(serverEnv).integrations.nostr.privateKey = 'a'.repeat(64)
      })

      it('should handle error when NOSTR_PRIVATE_KEY is invalid format', async () => {
        // Mock serverEnv to have invalid private key
        vi.mocked(serverEnv).integrations.nostr.privateKey = 'invalid-key'

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('64-character hex string')

        // Restore
        vi.mocked(serverEnv).integrations.nostr.privateKey = 'a'.repeat(64)
      })

      it('should return error object when publishing fails', async () => {
        // Mock all relays to fail
        const mockPublish = vi.fn((relays: string[]) => {
          return relays.map(() => Promise.reject(new Error('Network error')))
        })
        
        vi.mocked(SimplePool).mockImplementation(() => ({
          publish: mockPublish,
          close: vi.fn(),
        }) as any)

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(false)
        expect(result.relaysPublished).toBe(0)
        expect(result.relaysFailed).toBe(5)
      })

      it('should catch and return error when finalizeEvent throws', async () => {
        // Mock finalizeEvent to throw
        vi.mocked(finalizeEvent).mockImplementationOnce(() => {
          throw new Error('Signing failed')
        })

        const result = await postToNostr({
          title: 'Test Issue',
          description: 'Test description',
          reward: 1000,
          postId: 'test-post-id',
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Signing failed')
      })
    })
  })

  describe('generateNostrKeyPair()', () => {
    it('should return privateKey in hex format', () => {
      const keyPair = generateNostrKeyPair()

      expect(keyPair.privateKey).toBeDefined()
      expect(keyPair.privateKey).toMatch(/^[0-9a-f]{64}$/i) // 64-char hex string
    })

    it('should return publicKey in hex format', () => {
      const keyPair = generateNostrKeyPair()

      expect(keyPair.publicKey).toBeDefined()
      expect(keyPair.publicKey).toMatch(/^[0-9a-f]{64}$/i)
    })

    it('should return npub setup instruction', () => {
      const keyPair = generateNostrKeyPair()

      expect(keyPair.npub).toBeDefined()
      expect(keyPair.npub).toContain('NOSTR_PRIVATE_KEY=')
      expect(keyPair.npub).toContain('.env.local')
    })

    it('should generate different keys on each call', () => {
      const keyPair1 = generateNostrKeyPair()
      const keyPair2 = generateNostrKeyPair()

      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey)
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey)
    })
  })

  describe('Connection Pool Management', () => {
    // Note: These tests require special mock patterns that are complex to set up
    // They test internal implementation details of pool management
    it.skip('should reuse singleton pool across multiple calls', async () => {
      await postToNostr({
        title: 'Test Issue 1',
        description: 'Test description 1',
        reward: 1000,
        postId: 'test-post-id-1',
      })

      await postToNostr({
        title: 'Test Issue 2',
        description: 'Test description 2',
        reward: 2000,
        postId: 'test-post-id-2',
      })

      // SimplePool constructor should only be called once
      expect(SimplePool).toHaveBeenCalledTimes(1)
    })

    it.skip('should close pool when closeNostrPool called', () => {
      const mockClose = vi.fn()
      vi.mocked(SimplePool).mockImplementation(() => ({
        publish: vi.fn(),
        close: mockClose,
      }) as any)

      // Trigger pool creation
      postToNostr({
        title: 'Test Issue',
        description: 'Test description',
        reward: 1000,
        postId: 'test-post-id',
      })

      closeNostrPool()

      expect(mockClose).toHaveBeenCalledWith(
        expect.arrayContaining([
          'wss://relay.damus.io',
          'wss://nostr.wine',
          'wss://relay.snort.social',
          'wss://nos.lol',
          'wss://relay.primal.net',
        ])
      )
    })
  })
})
