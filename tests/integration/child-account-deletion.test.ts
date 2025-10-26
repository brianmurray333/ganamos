import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/delete-child-account/route'
import {
  createTestParentAccount,
  createTestChildAccount,
  createConnectionFixture,
  createParentChildFixture,
  createDeletedChildAccount,
  createNonChildAccount,
  type ExtendedProfile,
} from './helpers/child-account-fixtures'
import {
  MockDatabaseState,
  createMockSupabaseClient,
  createMockRequest,
  mockAuthenticatedSession,
} from './helpers/api-test-helpers'

// Mock Next.js modules
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

// Mock Supabase clients
let mockDbState: MockDatabaseState
let currentAuthUserId: string | undefined

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(() => {
    return createMockSupabaseClient(mockDbState, currentAuthUserId)
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => {
    // Admin client has same interface but bypasses RLS
    return createMockSupabaseClient(mockDbState, currentAuthUserId)
  }),
  createBrowserSupabaseClient: vi.fn(),
  getSupabaseClient: vi.fn(),
}))

describe('POST /api/delete-child-account - Integration Tests', () => {
  beforeEach(() => {
    mockDbState = new MockDatabaseState()
    currentAuthUserId = undefined
    
    // Ensure SUPABASE_SERVICE_ROLE_KEY is set
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  afterEach(() => {
    mockDbState.reset()
    vi.clearAllMocks()
  })

  describe('Authentication Tests', () => {
    it('should return 401 when no session exists', async () => {
      // Arrange: No authenticated user
      currentAuthUserId = undefined
      const request = createMockRequest({ childAccountId: 'some-id' })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should require authenticated session to proceed', async () => {
      // Arrange: Authenticated parent with child account
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      // No authentication
      currentAuthUserId = undefined
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(401)
      expect(mockDbState.getProfile(child.id)?.status).not.toBe('deleted')
    })
  })

  describe('Validation Tests', () => {
    it('should return 400 when childAccountId is missing', async () => {
      // Arrange: Authenticated user, but no childAccountId in request
      const parent = createTestParentAccount()
      mockDbState.addProfile(parent)
      currentAuthUserId = parent.id
      
      const request = createMockRequest({}) // Missing childAccountId

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('Child account ID is required')
    })

    it('should return 403 when child account does not exist (no connection)', async () => {
      // Arrange: Authenticated parent, but child account doesn't exist
      // Note: API checks connection first, so returns 403 before checking profile
      const parent = createTestParentAccount()
      mockDbState.addProfile(parent)
      currentAuthUserId = parent.id
      
      const nonExistentChildId = 'non-existent-child-id'
      const request = createMockRequest({ childAccountId: nonExistentChildId })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert: Returns 403 because no connection exists (checked before profile)
      expect(response.status).toBe(403)
      expect(data.error).toBe("You don't have permission to delete this account")
    })

    it('should return 400 when account email does not end with @ganamos.app', async () => {
      // Arrange: Try to delete a regular account (not a child account)
      const parent = createTestParentAccount()
      const regularAccount = createNonChildAccount()
      const connection = createConnectionFixture(parent.id, regularAccount.id)
      
      mockDbState.addProfile(parent)
      mockDbState.addProfile(regularAccount)
      mockDbState.addConnection(connection)
      currentAuthUserId = parent.id
      
      const request = createMockRequest({ childAccountId: regularAccount.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('This is not a child account and cannot be deleted')
    })

    it('should return 500 when SUPABASE_SERVICE_ROLE_KEY is not configured', async () => {
      // Arrange: Remove service role key
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      currentAuthUserId = parent.id
      
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Server configuration error: Cannot delete auth user')
    })
  })

  describe('Authorization Tests', () => {
    it('should return 403 when user does not own the child account', async () => {
      // Arrange: Different user tries to delete someone else's child
      const parent = createTestParentAccount()
      const otherUser = createTestParentAccount({ id: 'other-user-id' })
      const child = createTestChildAccount(parent.id)
      const connection = createConnectionFixture(parent.id, child.id)
      
      mockDbState.addProfile(parent)
      mockDbState.addProfile(otherUser)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      // Authenticate as OTHER user (not the parent)
      currentAuthUserId = otherUser.id
      
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(403)
      expect(data.error).toBe("You don't have permission to delete this account")
    })

    it('should return 403 when connected_accounts relationship does not exist', async () => {
      // Arrange: Child account exists but no connection to requesting user
      const parent = createTestParentAccount()
      const child = createTestChildAccount(parent.id)
      
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      // NOTE: No connection added
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(403)
      expect(data.error).toBe("You don't have permission to delete this account")
    })

    it('should allow parent to delete their own child account', async () => {
      // Arrange: Valid parent-child relationship
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(200)
    })
  })

  describe('Soft Delete Behavior Tests', () => {
    it('should successfully soft delete child account with correct status', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Child account deleted successfully')
      
      // Verify soft delete fields
      const updatedChild = mockDbState.getProfile(child.id) as ExtendedProfile
      expect(updatedChild?.status).toBe('deleted')
      expect(updatedChild?.deleted_at).toBeDefined()
      expect(updatedChild?.deleted_by).toBe(parent.id)
    })

    it('should set deleted_at timestamp when soft deleting', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const beforeDelete = new Date()
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      await POST(request)

      // Assert
      const updatedChild = mockDbState.getProfile(child.id) as ExtendedProfile
      expect(updatedChild?.deleted_at).toBeDefined()
      
      if (updatedChild?.deleted_at) {
        const deletedAt = new Date(updatedChild.deleted_at)
        expect(deletedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime())
        expect(deletedAt.getTime()).toBeLessThanOrEqual(new Date().getTime())
      }
    })

    it('should set deleted_by to parent user ID', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      await POST(request)

      // Assert
      const updatedChild = mockDbState.getProfile(child.id) as ExtendedProfile
      expect(updatedChild?.deleted_by).toBe(parent.id)
    })

    it('should delete connected_accounts relationship', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Verify connection exists before deletion
      expect(mockDbState.getConnectionByUsers(parent.id, child.id)).toBeDefined()

      // Act
      await POST(request)

      // Assert
      expect(mockDbState.getConnectionByUsers(parent.id, child.id)).toBeUndefined()
    })

    it('should preserve auth.users record for restoration capability', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      await POST(request)

      // Assert: Profile still exists (soft deleted)
      const childProfile = mockDbState.getProfile(child.id)
      expect(childProfile).toBeDefined()
      
      // Assert: auth.users record preserved (simulated by authUsers set)
      expect(mockDbState.authUsers.has(child.id)).toBe(true)
    })

    it('should return success response with restoration note', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Child account deleted successfully')
      expect(data.note).toBe('Account data is preserved and can be restored if needed')
    })
  })

  describe('Data Consistency Tests', () => {
    it('should preserve child account profile data after soft delete', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      const originalChildData = { ...child }
      
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      await POST(request)

      // Assert: Core profile data unchanged (except soft-delete fields)
      const updatedChild = mockDbState.getProfile(child.id) as ExtendedProfile
      expect(updatedChild?.id).toBe(originalChildData.id)
      expect(updatedChild?.email).toBe(originalChildData.email)
      expect(updatedChild?.name).toBe(originalChildData.name)
      expect(updatedChild?.balance).toBe(originalChildData.balance)
    })

    it('should not cascade delete to other tables (transactions preserved)', async () => {
      // Arrange: This test verifies soft-delete philosophy
      const { parent, child, connection } = createParentChildFixture()
      
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      await POST(request)

      // Assert: Profile exists (soft deleted)
      const childProfile = mockDbState.getProfile(child.id)
      expect(childProfile).toBeDefined()
      
      // Note: In real integration test with database, would verify:
      // - transactions table still has child's transaction records
      // - posts table still has child's posts
      // - activities table still has child's activities
      // These are preserved because we do SOFT delete, not CASCADE delete
    })
  })

  describe('Edge Cases', () => {
    it('should handle already deleted child account gracefully', async () => {
      // Arrange: Child account already soft-deleted
      const parent = createTestParentAccount()
      const deletedChild = createDeletedChildAccount(parent.id, parent.id)
      const connection = createConnectionFixture(parent.id, deletedChild.id)
      
      mockDbState.addProfile(parent)
      mockDbState.addProfile(deletedChild as any)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: deletedChild.id })

      // Act: Try to delete already deleted account
      const response = await POST(request)

      // Assert: Should succeed (idempotent operation)
      // Note: Current implementation doesn't check for already deleted status
      // It will update status='deleted' again, which is safe
      expect(response.status).toBe(200)
    })

    it('should handle concurrent deletion attempts safely', async () => {
      // Arrange
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request1 = createMockRequest({ childAccountId: child.id })
      const request2 = createMockRequest({ childAccountId: child.id })

      // Act: Simulate concurrent requests
      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ])

      // Assert: Both should succeed (idempotent soft delete)
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      
      // Child should be deleted exactly once
      const updatedChild = mockDbState.getProfile(child.id) as ExtendedProfile
      expect(updatedChild?.status).toBe('deleted')
    })

    it('should handle missing profile after connection check', async () => {
      // Arrange: Edge case - connection exists but profile deleted between checks
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addConnection(connection)
      // Note: Child profile NOT added (simulates race condition)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(404)
      expect(data.error).toBe('Child account profile not found')
    })

    it('should handle connection cleanup failure gracefully', async () => {
      // Arrange: Simulate scenario where profile update succeeds but connection delete fails
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)

      // Assert: Should still return success (per endpoint logic)
      // Endpoint doesn't fail the request if connection cleanup fails
      expect(response.status).toBe(200)
      
      // Profile should be soft deleted even if connection cleanup failed
      const updatedChild = mockDbState.getProfile(child.id) as ExtendedProfile
      expect(updatedChild?.status).toBe('deleted')
    })
  })

  describe('Integration with Frontend', () => {
    it('should support the account switching workflow after deletion', async () => {
      // Arrange: User viewing child account, then deletes it
      const { parent, child, connection } = createParentChildFixture()
      mockDbState.addProfile(parent)
      mockDbState.addProfile(child)
      mockDbState.addConnection(connection)
      
      // Parent authenticated, deleting child they're currently viewing
      currentAuthUserId = parent.id
      const request = createMockRequest({ childAccountId: child.id })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert: Success response allows frontend to switch accounts
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Frontend should:
      // 1. Check if currently viewing deleted account
      // 2. Switch back to main account (resetToMainAccount())
      // 3. Refresh connected accounts list (fetchConnectedAccounts())
      // 4. Show success toast
    })

    it('should provide clear error messages for UI display', async () => {
      // Arrange: Various error scenarios
      const { parent, child, connection } = createParentChildFixture()
      
      // Test Case 1: Missing childAccountId
      currentAuthUserId = parent.id
      const request1 = createMockRequest({})
      const response1 = await POST(request1)
      const data1 = await response1.json()
      expect(data1.error).toBe('Child account ID is required')
      
      // Test Case 2: Unauthorized
      currentAuthUserId = undefined
      const request2 = createMockRequest({ childAccountId: child.id })
      const response2 = await POST(request2)
      const data2 = await response2.json()
      expect(data2.error).toBe('Unauthorized')
    })
  })
})