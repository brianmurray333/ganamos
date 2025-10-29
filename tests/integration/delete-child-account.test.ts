import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST as deleteChildAccount } from '@/app/api/delete-child-account/route'
import { POST as softDeleteChildAccount } from '@/app/api/soft-delete-child-account/route'

// Mock Supabase clients
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn()
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn()
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}))

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createServerSupabaseClient } from '@/lib/supabase'

describe('DELETE /api/delete-child-account - Integration Tests', () => {
  let mockSupabaseClient: any
  let mockAdminSupabaseClient: any
  
  // Test data
  const mockParentUserId = 'parent-user-123'
  const mockChildUserId = 'child-user-456'
  const mockChildEmail = 'child@ganamos.app'
  const mockNonChildEmail = 'adult@example.com'
  const mockConnectionId = 'connection-789'
  
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
    
    // Setup default mock implementations
    mockSupabaseClient = {
      auth: {
        getSession: vi.fn()
      },
      from: vi.fn()
    }
    
    mockAdminSupabaseClient = {
      auth: {
        admin: {
          deleteUser: vi.fn()
        }
      }
    }
    
    // Default Supabase client factory mock
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabaseClient)
    
    // Default environment variable
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })
  
  describe('Authentication Validation', () => {
    it('should return 401 when no session exists', async () => {
      // Arrange: No session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })
    
    it('should return 400 when childAccountId is missing', async () => {
      // Arrange: Valid session but missing childAccountId
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({})
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('Child account ID is required')
    })
  })
  
  describe('Authorization Validation', () => {
    it('should return 403 when user does not own the connected account', async () => {
      // Arrange: Valid session but no ownership
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' }
              })
            })
          })
        })
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(403)
      expect(data.error).toBe("You don't have permission to delete this account")
      expect(mockFrom).toHaveBeenCalledWith('connected_accounts')
    })
    
    it('should return 403 when connected_accounts relationship does not exist', async () => {
      // Arrange: Valid session but relationship not found
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: null
              })
            })
          })
        })
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(403)
      expect(data.error).toBe("You don't have permission to delete this account")
    })
  })
  
  describe('Email Constraint Validation', () => {
    it('should return 400 when email does not end with @ganamos.app', async () => {
      // Arrange: Valid session and ownership but non-child email
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          // First call: connected_accounts
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else {
          // Second call: profiles
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { 
                    id: mockChildUserId,
                    email: mockNonChildEmail
                  },
                  error: null
                })
              })
            })
          }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('This is not a child account and cannot be deleted')
    })
    
    it('should return 404 when child profile is not found', async () => {
      // Arrange: Valid session and ownership but profile doesn't exist
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          // First call: connected_accounts (success)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else {
          // Second call: profiles (not found)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Not found' }
                })
              })
            })
          }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(404)
      expect(data.error).toBe('Child account profile not found')
    })
  })
  
  describe('Soft-Delete Behavior', () => {
    it('should soft-delete child account with correct metadata', async () => {
      // Arrange: Successful soft-delete flow
      const mockTimestamp = new Date().toISOString()
      
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          // First call: connected_accounts
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else if (callCount === 2) {
          // Second call: profiles (get)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { 
                    id: mockChildUserId,
                    email: mockChildEmail
                  },
                  error: null
                })
              })
            })
          }
        } else if (callCount === 3) {
          // Third call: profiles (update for soft-delete)
          return {
            update: mockUpdate
          }
        } else {
          // Fourth call: connected_accounts (delete)
          return {
            delete: mockDelete
          }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Child account deleted successfully')
      expect(data.note).toBe('Account data is preserved and can be restored if needed')
      
      // Verify soft-delete update was called with correct metadata
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
          deleted_by: mockParentUserId
        })
      )
      
      // Verify the update call includes timestamp fields
      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall).toHaveProperty('deleted_at')
      expect(updateCall).toHaveProperty('updated_at')
      expect(updateCall.deleted_at).toBeTruthy()
      expect(updateCall.updated_at).toBeTruthy()
      
      // Verify connected_accounts was deleted
      expect(mockDelete).toHaveBeenCalled()
    })
    
    it('should return 500 when soft-delete fails', async () => {
      // Arrange: Soft-delete operation fails
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          // First call: connected_accounts (success)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else if (callCount === 2) {
          // Second call: profiles (get - success)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { 
                    id: mockChildUserId,
                    email: mockChildEmail
                  },
                  error: null
                })
              })
            })
          }
        } else {
          // Third call: profiles (update - failure)
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' }
              })
            })
          }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to delete profile')
    })
  })
  
  describe('Cascading Behavior', () => {
    it('should hard-delete connected_accounts relationship', async () => {
      // Arrange: Successful deletion with cascading
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: mockChildUserId, email: mockChildEmail },
                  error: null
                })
              })
            })
          }
        } else if (callCount === 3) {
          return { update: mockUpdate }
        } else {
          return { delete: mockDelete }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      await deleteChildAccount(request)
      
      // Assert: Verify connected_accounts delete was called
      expect(mockDelete).toHaveBeenCalled()
      const deleteEqCall = mockDelete.mock.results[0].value.eq
      expect(deleteEqCall).toHaveBeenCalledWith('id', mockConnectionId)
    })
    
    it('should succeed even if connected_accounts deletion fails', async () => {
      // Arrange: Soft-delete succeeds but connected_accounts deletion fails
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Delete failed' }
        })
      })
      
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: mockChildUserId, email: mockChildEmail },
                  error: null
                })
              })
            })
          }
        } else if (callCount === 3) {
          return { update: mockUpdate }
        } else {
          return { delete: mockDelete }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert: Request should still succeed despite connection delete failure
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalled()
      expect(mockDelete).toHaveBeenCalled()
    })
    
    it('should NOT delete auth.users record', async () => {
      // Arrange: Successful deletion
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: mockChildUserId, email: mockChildEmail },
                  error: null
                })
              })
            })
          }
        } else if (callCount === 3) {
          return { update: mockUpdate }
        } else {
          return { delete: mockDelete }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      await deleteChildAccount(request)
      
      // Assert: Verify auth.admin.deleteUser was NEVER called
      expect(mockAdminSupabaseClient.auth.admin.deleteUser).not.toHaveBeenCalled()
    })
  })
  
  describe('Environment Configuration', () => {
    it('should return 500 when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      // Arrange: Missing environment variable
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: mockChildUserId, email: mockChildEmail },
                  error: null
                })
              })
            })
          }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Server configuration error: Cannot delete auth user')
      
      // Restore for other tests
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    })
  })
  
  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Arrange: Throw unexpected error
      mockSupabaseClient.auth.getSession.mockRejectedValue(
        new Error('Unexpected database error')
      )
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('An unexpected error occurred')
    })
    
    it('should handle malformed request body', async () => {
      // Arrange: Invalid JSON
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: 'invalid json'
      })
      
      // Act
      const response = await deleteChildAccount(request)
      const data = await response.json()
      
      // Assert: Should return 500 error for malformed JSON
      expect(response.status).toBe(500)
      expect(data.error).toBe('An unexpected error occurred')
    })
  })
})

describe('DELETE /api/soft-delete-child-account - Idempotency Tests', () => {
  let mockSupabaseClient: any
  let mockAdminSupabaseClient: any
  
  const mockParentUserId = 'parent-user-123'
  const mockChildUserId = 'child-user-456'
  const mockChildEmail = 'child@ganamos.app'
  const mockConnectionId = 'connection-789'
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    mockSupabaseClient = {
      auth: {
        getSession: vi.fn()
      },
      from: vi.fn()
    }
    
    mockAdminSupabaseClient = {
      auth: {
        admin: {
          deleteUser: vi.fn()
        }
      }
    }
    
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminSupabaseClient)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })
  
  describe('Idempotency', () => {
    it('should return 400 when account is already deleted', async () => {
      // Arrange: Account already has status='deleted'
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          // First call: connected_accounts
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else {
          // Second call: profiles (already deleted)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { 
                    id: mockChildUserId,
                    email: mockChildEmail,
                    status: 'deleted'
                  },
                  error: null
                })
              })
            })
          }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await softDeleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('Account is already deleted')
    })
    
    it('should allow deletion of active account', async () => {
      // Arrange: Account with status='active'
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockParentUserId } } },
        error: null
      })
      
      let callCount = 0
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
      
      const mockFrom = vi.fn((tableName: string) => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { 
                      id: mockConnectionId,
                      primary_user_id: mockParentUserId,
                      connected_user_id: mockChildUserId
                    },
                    error: null
                  })
                })
              })
            })
          }
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { 
                    id: mockChildUserId,
                    email: mockChildEmail,
                    status: 'active'
                  },
                  error: null
                })
              })
            })
          }
        } else if (callCount === 3) {
          return { update: mockUpdate }
        } else {
          return { delete: mockDelete }
        }
      })
      mockSupabaseClient.from = mockFrom
      
      const request = new Request('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      const response = await softDeleteChildAccount(request)
      const data = await response.json()
      
      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalled()
    })
  })
})