/**
 * Test helpers for Nostr integration tests
 * Provides reusable utilities for creating requests and mock data
 */

/**
 * Create a POST request for the Nostr publish-post API
 */
export function createNostrPublishRequest(body: Record<string, any>) {
  return new Request('http://localhost:3457/api/nostr/publish-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Create a POST request with a raw body (for testing malformed JSON)
 */
export function createNostrPublishRequestRaw(body: string) {
  return new Request('http://localhost:3457/api/nostr/publish-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

/**
 * Minimal valid request body for Nostr publish
 */
export const minimalValidNostrPost = {
  title: 'Test Issue',
  description: 'Test description',
  postId: 'test-post-id',
}

/**
 * Full request body with all optional fields for Nostr publish
 */
export const fullNostrPost = {
  title: 'Test Issue',
  description: 'Test description',
  location: 'Via Regina',
  city: 'Como',
  latitude: 45.8081,
  longitude: 9.0852,
  reward: 5000,
  postId: 'test-post-id',
  imageUrl: 'https://example.com/image.jpg',
}

/**
 * Default successful mock response for postToNostr
 */
export const mockSuccessfulNostrResponse = {
  success: true,
  eventId: 'mock-event-id',
  relaysPublished: 5,
  relaysFailed: 0,
}

/**
 * Create a mock failure response for postToNostr
 */
export function createMockFailureResponse(error: string) {
  return {
    success: false,
    error,
  }
}

/**
 * Create mock postToNostr parameters for lib/nostr tests
 */
export const createPostToNostrParams = (overrides?: Record<string, any>) => ({
  title: 'Test Issue',
  description: 'Test description',
  reward: 1000,
  postId: 'test-post-id',
  ...overrides,
})

/**
 * Create a POST request for the Nostr setup-profile API
 * (No body needed as profile data is hardcoded)
 */
export function createSetupProfileRequest() {
  return new Request('http://localhost:3457/api/nostr/setup-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}
