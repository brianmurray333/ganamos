/**
 * Consolidated test data and factories
 * Single source of truth for test fixtures
 */

/**
 * Valid pet types as per database constraints
 */
export const VALID_PET_TYPES = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl'] as const
export type PetType = (typeof VALID_PET_TYPES)[number]

/**
 * Standard test user IDs for consistent testing
 */
export const TEST_USER_IDS = {
  PRIMARY: 'test-user-primary-123',
  SECONDARY: 'test-user-secondary-456',
  CHILD: 'test-user-child-789',
  CONNECTED_CHILD: 'test-user-child-789', // Alias for CHILD (used by device list tests)
  UNRELATED: 'test-user-unrelated-999',
} as const

/**
 * Standard test profile data
 */
export const TEST_PROFILES = {
  PRIMARY: {
    id: TEST_USER_IDS.PRIMARY,
    email: 'primary@example.com',
    name: 'Primary User',
    username: 'primaryuser',
    avatar_url: 'https://example.com/avatar1.jpg',
    balance: 50000,
    pet_coins: 100,
    fixed_issues_count: 5,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
  },
  SECONDARY: {
    id: TEST_USER_IDS.SECONDARY,
    email: 'secondary@example.com',
    name: 'Secondary User',
    username: 'secondaryuser',
    avatar_url: 'https://example.com/avatar2.jpg',
    balance: 25000,
    pet_coins: 50,
    fixed_issues_count: 2,
    created_at: new Date('2024-01-02').toISOString(),
    updated_at: new Date('2024-01-02').toISOString(),
  },
  CHILD: {
    id: TEST_USER_IDS.CHILD,
    email: 'child@example.com',
    name: 'Child User',
    username: 'childuser',
    avatar_url: 'https://example.com/avatar3.jpg',
    balance: 500,
    pet_coins: 10,
    fixed_issues_count: 1,
    created_at: new Date('2024-01-03').toISOString(),
    updated_at: new Date('2024-01-03').toISOString(),
  },
  WITHOUT_NAME: {
    id: 'user-no-name',
    email: 'noname@example.com',
    name: null,
    username: 'nonameuser',
    avatar_url: null,
    balance: 1000,
    pet_coins: 5,
    fixed_issues_count: 0,
    created_at: new Date('2024-01-04').toISOString(),
    updated_at: new Date('2024-01-04').toISOString(),
  },
} as const

/**
 * Standard test device data
 */
export const TEST_DEVICES = {
  PAIRED: {
    id: 'device-paired-123',
    user_id: TEST_USER_IDS.PRIMARY,
    pairing_code: 'ABC123',
    pet_name: 'Fluffy',
    pet_type: 'cat' as PetType,
    status: 'paired' as const,
    last_seen_at: new Date().toISOString(),
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date().toISOString(),
  },
  DISCONNECTED: {
    id: 'device-disconnected-456',
    user_id: TEST_USER_IDS.PRIMARY,
    pairing_code: 'XYZ789',
    pet_name: 'Buddy',
    pet_type: 'dog' as PetType,
    status: 'disconnected' as const,
    last_seen_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date('2024-01-02').toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  PENDING: {
    id: 'device-pending-789',
    user_id: null,
    pairing_code: 'PND456',
    pet_name: null,
    pet_type: null,
    status: 'pending' as const,
    last_seen_at: null,
    created_at: new Date('2024-01-03').toISOString(),
    updated_at: new Date('2024-01-03').toISOString(),
  },
  // Device belonging to primary user (for list tests)
  PRIMARY_USER_DEVICE: {
    id: 'device-primary-user-001',
    user_id: TEST_USER_IDS.PRIMARY,
    pairing_code: 'PRI001',
    pet_name: 'Primary Pet',
    pet_type: 'cat' as PetType,
    status: 'paired' as const,
    last_seen_at: new Date().toISOString(),
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date().toISOString(),
  },
  // Device belonging to connected child user (for list tests)
  CHILD_USER_DEVICE: {
    id: 'device-child-user-001',
    user_id: TEST_USER_IDS.CHILD,
    pairing_code: 'CHD001',
    pet_name: 'Child Pet',
    pet_type: 'dog' as PetType,
    status: 'paired' as const,
    last_seen_at: new Date().toISOString(),
    created_at: new Date('2024-01-05').toISOString(),
    updated_at: new Date().toISOString(),
  },
} as const

/**
 * Standard test transaction data
 */
export const TEST_TRANSACTIONS = {
  DEPOSIT: {
    id: 'tx-deposit-123',
    user_id: TEST_USER_IDS.PRIMARY,
    type: 'deposit' as const,
    amount: 1000,
    status: 'completed' as const,
    memo: 'Test deposit',
    created_at: new Date().toISOString(),
  },
  WITHDRAWAL: {
    id: 'tx-withdrawal-456',
    user_id: TEST_USER_IDS.PRIMARY,
    type: 'withdrawal' as const,
    amount: 500,
    status: 'completed' as const,
    memo: 'Test withdrawal',
    created_at: new Date().toISOString(),
  },
  INTERNAL: {
    id: 'tx-internal-789',
    user_id: TEST_USER_IDS.PRIMARY,
    type: 'internal' as const,
    amount: 100,
    status: 'completed' as const,
    memo: 'Payment received',
    created_at: new Date().toISOString(),
  },
  PENDING: {
    id: 'tx-pending-999',
    user_id: TEST_USER_IDS.PRIMARY,
    type: 'deposit' as const,
    amount: 2000,
    status: 'pending' as const,
    memo: 'Pending deposit',
    created_at: new Date().toISOString(),
  },
} as const

/**
 * Standard test connected accounts data
 * Note: Table uses primary_user_id and connected_user_id columns
 */
export const TEST_CONNECTED_ACCOUNTS = {
  PRIMARY_TO_CHILD: {
    id: 'connection-001',
    primary_user_id: TEST_USER_IDS.PRIMARY,
    connected_user_id: TEST_USER_IDS.CHILD,
    created_at: new Date('2024-01-05').toISOString(),
    updated_at: new Date('2024-01-05').toISOString(),
  },
} as const

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a mock profile with optional overrides
 */
export function createMockProfile(
  overrides: Partial<(typeof TEST_PROFILES)['PRIMARY']> = {}
): (typeof TEST_PROFILES)['PRIMARY'] {
  return {
    ...TEST_PROFILES.PRIMARY,
    ...overrides,
  }
}

/**
 * Create a mock device with optional overrides
 */
export function createMockDevice(
  overrides: Partial<(typeof TEST_DEVICES)['PAIRED']> = {}
): (typeof TEST_DEVICES)['PAIRED'] {
  return {
    ...TEST_DEVICES.PAIRED,
    ...overrides,
  }
}

/**
 * Create a mock transaction with optional overrides
 */
export function createMockTransaction(
  overrides: Partial<(typeof TEST_TRANSACTIONS)['DEPOSIT']> = {}
): (typeof TEST_TRANSACTIONS)['DEPOSIT'] {
  return {
    ...TEST_TRANSACTIONS.DEPOSIT,
    ...overrides,
  }
}

/**
 * Create a mock user object (for auth)
 * Accepts either a userId string or an options object with id property
 */
export function createMockUser(options: string | { id: string } = TEST_USER_IDS.PRIMARY) {
  const userId = typeof options === 'string' ? options : options.id
  const profile =
    Object.values(TEST_PROFILES).find((p) => p.id === userId) || TEST_PROFILES.PRIMARY
  return {
    id: userId,
    email: profile.email,
    app_metadata: {},
    user_metadata: {
      name: profile.name,
      avatar_url: profile.avatar_url,
    },
    aud: 'authenticated',
    created_at: profile.created_at,
  }
}

/**
 * Create a mock session object
 */
export function createMockSession(userId: string = TEST_USER_IDS.PRIMARY) {
  return {
    access_token: `mock-token-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `mock-refresh-${userId}`,
    user: createMockUser(userId),
  }
}

/**
 * Create a mock request body for device registration
 */
export function createMockRequestBody(
  overrides: Partial<{
    deviceCode: string
    petName: string
    petType: string
    targetUserId?: string
  }> = {}
) {
  return {
    deviceCode: overrides.deviceCode || 'ABC123',
    petName: overrides.petName || 'Fluffy',
    petType: overrides.petType || 'cat',
    ...(overrides.targetUserId && { targetUserId: overrides.targetUserId }),
  }
}

/**
 * Create a mock Bitcoin price data object
 */
export function createMockPriceData(
  overrides: {
    price?: string
    currency?: string
    source?: string
    created_at?: string
    age_minutes?: number
  } = {}
) {
  return {
    price: '50000.00',
    currency: 'USD',
    source: 'DIA',
    created_at: new Date().toISOString(),
    age_minutes: 15,
    ...overrides,
  }
}

/**
 * Helper to create timestamp N minutes ago
 */
export function createTimestampMinutesAgo(minutes: number): string {
  const date = new Date(Date.now() - minutes * 60000)
  return date.toISOString()
}

/**
 * Generate a 1x1 transparent PNG for testing
 */
export function createBase64Image(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
}

/**
 * Create test post data with optional overrides
 */
export function createTestPostData(
  userId: string,
  overrides: {
    title?: string
    description?: string
    image_url?: string
    location?: string
    reward?: number
    ai_confidence_score?: number
    ai_analysis?: string
    under_review?: boolean
    submitted_fix_image_url?: string | null
    submitted_fix_by_id?: string | null
    submitted_fix_by_name?: string | null
    fixed?: boolean
    fixed_by?: string | null
  } = {}
) {
  const timestamp = Date.now()

  return {
    user_id: userId,
    title: overrides.title || `Test Issue ${timestamp}`,
    description: overrides.description || 'Test issue description',
    image_url: overrides.image_url || 'https://example.com/test-image.jpg',
    location: overrides.location || 'Test Location',
    reward: overrides.reward ?? 100,
    ai_confidence_score: overrides.ai_confidence_score ?? undefined,
    ai_analysis: overrides.ai_analysis ?? undefined,
    under_review: overrides.under_review ?? false,
    submitted_fix_image_url: overrides.submitted_fix_image_url ?? null,
    submitted_fix_by_id: overrides.submitted_fix_by_id ?? null,
    submitted_fix_by_name: overrides.submitted_fix_by_name ?? null,
    fixed: overrides.fixed ?? false,
    fixed_by: overrides.fixed_by ?? null,
  }
}

/**
 * Generate test request payload for /api/verify-fix endpoint
 */
export function createVerifyFixRequest(
  overrides: {
    beforeImage?: string | undefined
    afterImage?: string | undefined
    description?: string | undefined
    title?: string | undefined
  } = {}
) {
  const payload: Record<string, string> = {}

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
