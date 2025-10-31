/**
 * Test helpers for Sphinx integration tests
 * Provides reusable utilities for creating requests and mock data
 */

/**
 * Create a POST request for the Sphinx publish-post API
 */
export function createSphinxPublishRequest(body: Record<string, any>) {
  return new Request('http://localhost:3457/api/sphinx/publish-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Create a POST request with a raw body (for testing malformed JSON)
 */
export function createSphinxPublishRequestRaw(body: string) {
  return new Request('http://localhost:3457/api/sphinx/publish-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

/**
 * Minimal valid request body for Sphinx publish
 * Contains only required fields: title, description, postId
 */
export const minimalValidSphinxPost = {
  title: 'Test Issue',
  description: 'Test description for community issue',
  postId: 'test-post-id-123',
}

/**
 * Full request body with all optional fields for Sphinx publish
 * Includes location details, reward, and image URL
 */
export const fullSphinxPost = {
  title: 'Pothole on Main Street',
  description: 'Large pothole needs urgent repair',
  location: 'Via Regina',
  city: 'Como',
  latitude: 45.8081,
  longitude: 9.0852,
  reward: 5000,
  postId: 'test-post-id-456',
  imageUrl: 'https://example.com/pothole.jpg',
}

/**
 * Default successful mock response for postToSphinx
 * Simulates successful broadcast to Sphinx tribe
 */
export const mockSuccessfulSphinxResponse = {
  success: true,
  result: {
    message: 'Post published to Sphinx tribe successfully',
    messageId: 'mock-sphinx-message-id-789',
  },
}

/**
 * Create a mock failure response for postToSphinx
 * @param error - Error message describing the failure
 */
export function createMockFailureResponse(error: string) {
  return {
    success: false,
    error,
  }
}

/**
 * Create mock postToSphinx parameters for lib/sphinx tests
 * @param overrides - Optional field overrides
 */
export const createPostToSphinxParams = (overrides?: Record<string, any>) => ({
  title: 'Test Issue',
  description: 'Test description',
  location: 'Test Location',
  city: 'Test City',
  latitude: 45.0,
  longitude: 9.0,
  reward: 1000,
  postId: 'test-post-id',
  imageUrl: 'https://example.com/image.jpg',
  ...overrides,
})

/**
 * Mock Sphinx configuration for testing
 * Provides test credentials to avoid real API calls
 */
export const mockSphinxConfig = {
  chatPubkey: 'test-chat-pubkey-123',
  botId: 'test-bot-id-456',
  botSecret: 'test-bot-secret-789',
}