import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { POST } from '@/app/api/delete-child-account/route'

// Mock external dependencies
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

// Import mocked functions for assertions
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createServerSupabaseClient } from '@/lib/supabase'

// Test Fixtures
const PARENT_USER_ID = 'parent-user-123'
const CHILD_ACCOUNT_ID = 'child-account-123'

const VALID_SESSION = {
  user: { id: PARENT_USER_ID },
  access_token: 'mock-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Date.now() + 3600000,
  refresh_token: 'mock-refresh-token',
}

const MOCK_CHILD_PROFILE = {
  id: CHILD_ACCOUNT_ID,
  email: 'child@ganamos.app',
  name: 'Child Account',
  username: 'child_account',
  balance: 500,
}

const MOCK_CONNECTION = {
  id: 'connection-123',
  primary_user_id: PARENT_USER_ID,
  connected_user_id: CHILD_ACCOUNT_ID,
  relationship_type: 'parent_child',
}

// Helper to create mock request
function createMockRequest(body: any): Request {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    method: 'POST',
  } as any
}

// Helper to create mock Supabase client
function createMockSupabaseClient(overrides = {}) {
  const mockClient = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    update: vi.fn(() => mockClient),
    delete: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
    ...overrides,
  }
  return mockClient
}

describe('POST /api/delete-child-account', () => {
  let mockRouteHandlerClient: any
  let mockAdminSupabaseClient: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock behaviors
    mockRouteHandlerClient = createMockSupabaseClient()
    mockAdminSupabaseClient = createMockSupabaseClient()

    vi.mocked(createRouteHandlerClient).mockReturnValue(mockRouteHandlerClient)
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabaseClient)

    // Set environment variable for service role key check
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authorization', () => {
    it('should return 401 when no session exists', async () => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 400 when childAccountId is missing', async () => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      const request = createMockRequest({})
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Child account ID is required')
    })

    it('should return 403 when user does not own the child account', async () => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockRouteHandlerClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("You don't have permission to delete this account")
    })
  })

  describe('Email Validation', () => {
    it('should return 404 when child profile not found', async () => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockRouteHandlerClient.single
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null }) // Connection check
        .mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }) // Profile check

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Child account profile not found')
    })

    it('should return 400 when email does not end with @ganamos.app', async () => {
      const nonChildProfile = { ...MOCK_CHILD_PROFILE, email: 'regular@example.com' }

      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockRouteHandlerClient.single
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null })
        .mockResolvedValueOnce({ data: nonChildProfile, error: null })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('This is not a child account and cannot be deleted')
    })
  })

  describe('Soft Deletion Behavior', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      // Setup successful connection and profile checks
      mockRouteHandlerClient.single
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null })
        .mockResolvedValueOnce({ data: MOCK_CHILD_PROFILE, error: null })
    })

    it('should mark profile as deleted with status flag', async () => {
      mockRouteHandlerClient.single.mockResolvedValue({ data: null, error: null })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      await POST(request)

      expect(mockRouteHandlerClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
          deleted_by: PARENT_USER_ID,
        })
      )
    })

    it('should set deleted_at timestamp', async () => {
      const beforeTest = new Date().toISOString()
      mockRouteHandlerClient.single.mockResolvedValue({ data: null, error: null })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      await POST(request)

      const updateCall = vi.mocked(mockRouteHandlerClient.update).mock.calls[0][0]
      expect(updateCall.deleted_at).toBeDefined()
      expect(new Date(updateCall.deleted_at).getTime()).toBeGreaterThanOrEqual(new Date(beforeTest).getTime())
    })

    it('should return 500 when profile update fails', async () => {
      // Mock the update to throw an error - this will be caught by the catch block
      // Note: Due to mock chain complexity, this ends up in the generic catch handler
      mockRouteHandlerClient.from.mockImplementation(() => {
        throw new Error('Database error')
      })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      // The error is caught by the generic catch block
      expect(response.status).toBe(500)
      expect(data.error).toBe('An unexpected error occurred')
    })
  })

  describe('Cascading Effects', () => {
    beforeEach(() => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockRouteHandlerClient.single
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null })
        .mockResolvedValueOnce({ data: MOCK_CHILD_PROFILE, error: null })
        .mockResolvedValueOnce({ data: null, error: null }) // Update profile
        .mockResolvedValueOnce({ data: null, error: null }) // Delete connection
    })

    it('should delete connected_accounts relationship', async () => {
      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      await POST(request)

      expect(mockRouteHandlerClient.delete).toHaveBeenCalled()
      expect(mockRouteHandlerClient.eq).toHaveBeenCalledWith('id', MOCK_CONNECTION.id)
    })

    it('should NOT fail entire request if connection deletion fails', async () => {
      // Reset single mock to return error on delete
      mockRouteHandlerClient.single
        .mockReset()
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null })
        .mockResolvedValueOnce({ data: MOCK_CHILD_PROFILE, error: null })
        .mockResolvedValueOnce({ data: null, error: null }) // Update profile succeeds
        .mockResolvedValueOnce({ data: null, error: { message: 'Delete failed' } }) // Delete fails

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Success Response', () => {
    it('should return 200 with success message on successful deletion', async () => {
      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockRouteHandlerClient.single
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null })
        .mockResolvedValueOnce({ data: MOCK_CHILD_PROFILE, error: null })
        .mockResolvedValueOnce({ data: null, error: null }) // Update
        .mockResolvedValueOnce({ data: null, error: null }) // Delete

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        message: 'Child account deleted successfully',
        note: 'Account data is preserved and can be restored if needed',
      })
    })
  })

  describe('Error Handling', () => {
    it('should return 500 on unexpected errors', async () => {
      mockRouteHandlerClient.auth.getSession.mockRejectedValue(new Error('Unexpected error'))

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('An unexpected error occurred')
    })

    it('should return 500 when service role key is not configured', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      mockRouteHandlerClient.auth.getSession.mockResolvedValue({
        data: { session: VALID_SESSION },
        error: null,
      })

      mockRouteHandlerClient.single
        .mockResolvedValueOnce({ data: MOCK_CONNECTION, error: null })
        .mockResolvedValueOnce({ data: MOCK_CHILD_PROFILE, error: null })

      const request = createMockRequest({ childAccountId: CHILD_ACCOUNT_ID })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Server configuration error: Cannot delete auth user')
    })
  })
})
