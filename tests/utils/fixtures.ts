/**
 * Test fixtures for integration tests
 * Provides consistent test data generation
 */

/**
 * Test user IDs for consistent testing
 */
export const TEST_USER_IDS = {
  PRIMARY: 'test-user-primary-123',
  CONNECTED_CHILD: 'test-user-child-456',
  UNRELATED: 'test-user-unrelated-789',
}

/**
 * Test profile data
 */
export const TEST_PROFILES = {
  PRIMARY_USER: {
    id: TEST_USER_IDS.PRIMARY,
    email: 'primary@example.com',
    name: 'Primary User',
    username: 'primaryuser',
    avatar_url: 'https://example.com/avatar1.jpg',
    balance: 1000,
    fixed_issues_count: 5,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
  },
  CHILD_USER: {
    id: TEST_USER_IDS.CONNECTED_CHILD,
    email: 'child@example.com',
    name: 'Child User',
    username: 'childuser',
    avatar_url: 'https://example.com/avatar2.jpg',
    balance: 500,
    fixed_issues_count: 2,
    created_at: new Date('2024-01-02').toISOString(),
    updated_at: new Date('2024-01-02').toISOString(),
  },
  UNRELATED_USER: {
    id: TEST_USER_IDS.UNRELATED,
    email: 'unrelated@example.com',
    name: 'Unrelated User',
    username: 'unrelateduser',
    avatar_url: 'https://example.com/avatar3.jpg',
    balance: 750,
    fixed_issues_count: 3,
    created_at: new Date('2024-01-03').toISOString(),
    updated_at: new Date('2024-01-03').toISOString(),
  },
}

/**
 * Test device data
 */
export const TEST_DEVICES = {
  PRIMARY_USER_DEVICE: {
    id: 'device-primary-001',
    user_id: TEST_USER_IDS.PRIMARY,
    pairing_code: 'ABC123',
    pet_name: 'Primary Pet',
    pet_type: 'dog',
    status: 'active',
    last_seen_at: new Date('2024-01-15').toISOString(),
    created_at: new Date('2024-01-10').toISOString(),
    updated_at: new Date('2024-01-15').toISOString(),
  },
  CHILD_USER_DEVICE: {
    id: 'device-child-001',
    user_id: TEST_USER_IDS.CONNECTED_CHILD,
    pairing_code: 'XYZ789',
    pet_name: 'Child Pet',
    pet_type: 'cat',
    status: 'active',
    last_seen_at: new Date('2024-01-16').toISOString(),
    created_at: new Date('2024-01-11').toISOString(),
    updated_at: new Date('2024-01-16').toISOString(),
  },
}

/**
 * Test connected accounts data
 */
export const TEST_CONNECTED_ACCOUNTS = {
  PRIMARY_TO_CHILD: {
    id: 'connection-001',
    primary_user_id: TEST_USER_IDS.PRIMARY,
    connected_user_id: TEST_USER_IDS.CONNECTED_CHILD,
    created_at: new Date('2024-01-05').toISOString(),
    updated_at: new Date('2024-01-05').toISOString(),
  },
}

/**
 * Create a test device with optional overrides
 */
export function createDevice(overrides: Partial<typeof TEST_DEVICES.PRIMARY_USER_DEVICE> = {}) {
  return {
    id: `device-${Date.now()}`,
    user_id: TEST_USER_IDS.PRIMARY,
    pairing_code: `CODE${Math.random().toString(36).substring(7).toUpperCase()}`,
    pet_name: 'Test Pet',
    pet_type: 'dog',
    status: 'active',
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

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