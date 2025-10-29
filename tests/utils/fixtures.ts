/**
 * Test fixtures for integration tests
 * Provides consistent test data generation
 */

/**
 * Generate test request payload for /api/verify-fix endpoint
 */
export function createVerifyFixRequest(overrides: {
  beforeImage?: string | undefined
  afterImage?: string | undefined
  description?: string | undefined
  title?: string | undefined
} = {}) {
  const payload: Record<string, any> = {}
  
  // Only include fields that are not explicitly set to undefined
  if (!('beforeImage' in overrides)) {
    payload.beforeImage = 'https://example.com/before-image.jpg'
  } else if (overrides.beforeImage !== undefined) {
    payload.beforeImage = overrides.beforeImage
  }
  
  if (!('afterImage' in overrides)) {
    payload.afterImage = 'https://example.com/after-image.jpg'
  } else if (overrides.afterImage !== undefined) {
    payload.afterImage = overrides.afterImage
  }
  
  if (!('description' in overrides)) {
    payload.description = 'Test issue: broken street light'
  } else if (overrides.description !== undefined) {
    payload.description = overrides.description
  }
  
  if (!('title' in overrides)) {
    payload.title = 'Broken Street Light'
  } else if (overrides.title !== undefined) {
    payload.title = overrides.title
  }
  
  return payload
}

/**
 * Generate base64 encoded test image string
 * Simulates a small PNG image for testing
 */
export function createBase64Image(): string {
  // 1x1 transparent PNG
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
}

/**
 * Generate test AI response with specified confidence
 */
export function createAIResponse(confidence: number, reasoning: string = 'Test reasoning') {
  return `CONFIDENCE: ${confidence}\nREASONING: ${reasoning}`
}

/**
 * Generate malformed AI response (missing confidence)
 */
export function createMalformedAIResponse(): string {
  return 'This is a malformed response without proper formatting'
}

/**
 * Generate AI response missing reasoning
 */
export function createAIResponseMissingReasoning(confidence: number): string {
  return `CONFIDENCE: ${confidence}\nSome text but no reasoning label`
}

/**
 * Create test profile data
 */
export function createTestProfileData(overrides: {
  id?: string
  email?: string
  name?: string
  username?: string
  balance?: number
  fixed_issues_count?: number
} = {}) {
  const timestamp = Date.now()
  
  return {
    id: overrides.id || `test-user-${timestamp}`,
    email: overrides.email || `test-${timestamp}@example.com`,
    name: overrides.name || `Test User ${timestamp}`,
    username: overrides.username || `testuser${timestamp}`,
    balance: overrides.balance ?? 0,
    fixed_issues_count: overrides.fixed_issues_count ?? 0,
  }
}

/**
 * Create test post data
 */
export function createTestPostData(userId: string, overrides: {
  title?: string
  description?: string
  image_url?: string
  location?: string
  reward?: number
} = {}) {
  const timestamp = Date.now()
  
  return {
    user_id: userId,
    title: overrides.title || `Test Issue ${timestamp}`,
    description: overrides.description || 'Test issue description',
    image_url: overrides.image_url || 'https://example.com/test-image.jpg',
    location: overrides.location || 'Test Location',
    reward: overrides.reward ?? 100,
  }
}