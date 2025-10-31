/**
 * Test helpers for Sphinx integration tests
 * Provides reusable utilities for creating requests, mock data, and environment setup
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
 */
export const minimalValidSphinxPost = {
  title: 'Test Issue',
  description: 'Test description',
  postId: 'test-post-id',
  reward: 1000,
}

/**
 * Full request body with all optional fields for Sphinx publish
 */
export const fullSphinxPost = {
  title: 'Test Issue in Como',
  description: 'Detailed test description',
  location: 'Via Regina',
  city: 'Como',
  reward: 5000,
  postId: 'test-post-id-full',
  imageUrl: 'https://example.com/image.jpg',
}

/**
 * Default successful mock response for postToSphinx
 */
export const mockSuccessfulSphinxResponse = {
  success: true,
  result: {
    message_id: 'mock-message-id-123',
    chat_pubkey: 'mock-chat-pubkey',
  },
}

/**
 * Create a mock failure response for postToSphinx
 */
export function createMockFailureResponse(error: string) {
  return {
    success: false,
    error,
  }
}

/**
 * Helper to setup Sphinx environment variables for tests
 */
export function setupSphinxTestEnvironment(overrides: {
  SPHINX_CHAT_PUBKEY?: string
  SPHINX_BOT_ID?: string
  SPHINX_BOT_SECRET?: string
} = {}) {
  const defaults = {
    SPHINX_CHAT_PUBKEY: 'test-chat-pubkey-12345',
    SPHINX_BOT_ID: 'test-bot-id',
    SPHINX_BOT_SECRET: 'test-bot-secret',
  }

  const env = { ...defaults, ...overrides }

  process.env.SPHINX_CHAT_PUBKEY = env.SPHINX_CHAT_PUBKEY
  process.env.SPHINX_BOT_ID = env.SPHINX_BOT_ID
  process.env.SPHINX_BOT_SECRET = env.SPHINX_BOT_SECRET

  return env
}

/**
 * Helper to clear Sphinx environment variables
 */
export function clearSphinxTestEnvironment() {
  delete process.env.SPHINX_CHAT_PUBKEY
  delete process.env.SPHINX_BOT_ID
  delete process.env.SPHINX_BOT_SECRET
}

/**
 * Create mock postToSphinx parameters for lib/sphinx tests
 */
export const createPostToSphinxParams = (overrides?: Record<string, any>) => ({
  title: 'Test Issue',
  description: 'Test description',
  reward: 1000,
  postId: 'test-post-id',
  ...overrides,
})

/**
 * Mock successful Sphinx API response
 */
export const mockSphinxApiSuccessResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    message_id: 'sphinx-msg-123',
    chat_id: 'sphinx-chat-456',
  }),
}

/**
 * Create mock Sphinx API error response
 */
export function createMockSphinxApiErrorResponse(status: number, errorMessage: string) {
  return {
    ok: false,
    status,
    statusText: errorMessage,
    text: async () => errorMessage,
    json: async () => ({ error: errorMessage }),
  }
}