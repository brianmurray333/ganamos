import { vi } from 'vitest'

/**
 * Test Fixtures and Mock Data Factories for Child Account Integration Tests
 */

// Valid test user IDs
export const MOCK_PARENT_USER_ID = 'parent-user-123'
export const MOCK_CHILD_USER_ID = 'child-user-456'
export const MOCK_UUID = 'test-uuid'

// Valid test data
export const MOCK_CHILD_USERNAME = 'Test Child'
export const MOCK_CHILD_AVATAR_URL = '/images/avatars/ghibli-1.png'
export const MOCK_CHILD_EMAIL = `child-${MOCK_UUID}@ganamos.app`
export const MOCK_CHILD_USERNAME_SLUG = 'test-child'

/**
 * Helper to create mock authenticated session
 */
export function createMockSession(userId: string = MOCK_PARENT_USER_ID) {
  return {
    user: { 
      id: userId,
      email: 'parent@example.com',
      user_metadata: {},
    },
    access_token: 'mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    refresh_token: 'mock-refresh-token',
  }
}

/**
 * Helper to create mock profile data
 */
export function createMockProfile(overrides: {
  id?: string
  email?: string
  name?: string
  username?: string
  avatar_url?: string
  balance?: number
} = {}) {
  return {
    id: MOCK_PARENT_USER_ID,
    email: 'parent@example.com',
    name: 'Parent User',
    username: 'parentuser',
    avatar_url: null,
    balance: 5000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    fixed_issues_count: 0,
    ...overrides,
  }
}

/**
 * Helper to create mock child profile data
 */
export function createMockChildProfile(overrides: {
  id?: string
  email?: string
  name?: string
  username?: string
  avatar_url?: string
  balance?: number
} = {}) {
  return createMockProfile({
    id: MOCK_CHILD_USER_ID,
    email: MOCK_CHILD_EMAIL,
    name: MOCK_CHILD_USERNAME,
    username: MOCK_CHILD_USERNAME_SLUG,
    avatar_url: MOCK_CHILD_AVATAR_URL,
    balance: 0,
    ...overrides,
  })
}

/**
 * Helper to create mock auth user data (from Supabase admin.createUser)
 */
export function createMockAuthUser(userId: string, metadata: any = {}) {
  return {
    id: userId,
    email: MOCK_CHILD_EMAIL,
    user_metadata: {
      name: MOCK_CHILD_USERNAME,
      avatar_url: MOCK_CHILD_AVATAR_URL,
      is_child_account: true,
      primary_user_id: MOCK_PARENT_USER_ID,
      ...metadata,
    },
    created_at: new Date().toISOString(),
  }
}

/**
 * Helper to create mock connected account data
 */
export function createMockConnectedAccount(overrides: {
  id?: string
  primary_user_id?: string
  connected_user_id?: string
} = {}) {
  return {
    id: 'connection-123',
    primary_user_id: MOCK_PARENT_USER_ID,
    connected_user_id: MOCK_CHILD_USER_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Helper to create mock query builder for Supabase operations
 */
export function createMockQueryBuilder(data: any = null, error: any = null) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  }
}

/**
 * Helper to setup successful session mock
 */
export function mockSessionSuccess(mockClient: any, session: any = createMockSession()) {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session },
    error: null,
  })
}

/**
 * Helper to setup failed/missing session mock
 */
export function mockSessionFailure(mockClient: any, error: any = null) {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: null },
    error,
  })
}

/**
 * Helper to setup successful admin user creation
 */
export function mockAdminCreateUserSuccess(
  mockAdminClient: any,
  userId: string = MOCK_CHILD_USER_ID,
  metadata: any = {}
) {
  mockAdminClient.auth.admin.createUser.mockResolvedValue({
    data: { user: createMockAuthUser(userId, metadata) },
    error: null,
  })
}

/**
 * Helper to setup failed admin user creation
 */
export function mockAdminCreateUserFailure(mockAdminClient: any, errorMessage: string) {
  mockAdminClient.auth.admin.createUser.mockResolvedValue({
    data: null,
    error: { message: errorMessage },
  })
}

/**
 * Helper to setup admin user list (for checking existing users)
 */
export function mockAdminListUsers(mockAdminClient: any, users: any[] = []) {
  mockAdminClient.auth.admin.listUsers.mockResolvedValue({
    data: { users },
    error: null,
  })
}

/**
 * Helper to setup successful profile upsert
 */
export function mockProfileUpsertSuccess(mockClient: any, profile: any = createMockChildProfile()) {
  const mockQueryBuilder = createMockQueryBuilder(profile, null)
  mockClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Helper to setup failed profile upsert
 */
export function mockProfileUpsertFailure(mockClient: any, errorMessage: string) {
  const mockQueryBuilder = createMockQueryBuilder(null, { message: errorMessage })
  mockClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Helper to setup connected accounts query (for checking duplicates)
 */
export function mockConnectedAccountsQuery(
  mockClient: any,
  existingConnection: any = null,
  error: any = null
) {
  const mockQueryBuilder = createMockQueryBuilder(existingConnection, error)
  mockClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Helper to setup successful connection creation
 */
export function mockConnectionInsertSuccess(
  mockClient: any,
  connection: any = createMockConnectedAccount()
) {
  const mockQueryBuilder = createMockQueryBuilder(connection, null)
  mockClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Helper to setup failed connection creation
 */
export function mockConnectionInsertFailure(mockClient: any, errorMessage: string) {
  const mockQueryBuilder = createMockQueryBuilder(null, { message: errorMessage })
  mockClient.from.mockReturnValue(mockQueryBuilder)
  return mockQueryBuilder
}

/**
 * Helper to verify admin user was created with correct metadata
 */
export function expectAdminUserCreatedWith(
  mockAdminClient: any,
  expectedEmail: string,
  expectedMetadata: any
) {
  expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
    expect.objectContaining({
      email: expectedEmail,
      email_confirm: true,
      user_metadata: expect.objectContaining(expectedMetadata),
    })
  )
}

/**
 * Helper to verify profile was upserted with correct data
 */
export function expectProfileUpsertedWith(
  mockQueryBuilder: any,
  expectedData: {
    id: string
    name: string
    username: string
    email: string
    avatar_url: string
    balance: number
  }
) {
  expect(mockQueryBuilder.upsert).toHaveBeenCalledWith(
    expect.objectContaining(expectedData),
    { onConflict: 'id' }
  )
}

/**
 * Helper to verify connection was created
 */
export function expectConnectionCreated(
  mockQueryBuilder: any,
  primaryUserId: string,
  connectedUserId: string
) {
  expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      primary_user_id: primaryUserId,
      connected_user_id: connectedUserId,
    })
  )
}

/**
 * Helper to verify username slug transformation
 */
export function expectValidUsernameSlug(slug: string, originalName: string) {
  // Should be lowercase
  expect(slug).toBe(slug.toLowerCase())
  
  // Should only contain alphanumeric and hyphens
  expect(slug).toMatch(/^[a-z0-9-]+$/)
  
  // Should be max 20 characters
  expect(slug.length).toBeLessThanOrEqual(20)
}

/**
 * Helper to verify child email format
 */
export function expectValidChildEmail(email: string) {
  expect(email).toMatch(/^child-[0-9a-f-]+@ganamos\.app$/)
}

/**
 * Helper to create mock NextRequest
 */
export function createMockRequest(body: any): any {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    method: 'POST',
  }
}

/**
 * Helper to create comprehensive mock Supabase client
 */
export function createMockSupabaseClient(overrides = {}) {
  return {
    auth: {
      getSession: vi.fn(),
      admin: {
        createUser: vi.fn(),
        listUsers: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
    from: vi.fn(),
    ...overrides,
  }
}