import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST as deleteChildAccount } from '@/app/api/delete-child-account/route'

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

describe('DELETE /api/delete-child-account - Data Integrity Tests', () => {
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
  
  describe('Foreign Key Integrity', () => {
    it('should preserve transactions table references after soft-delete', async () => {
      // Arrange: Successful soft-delete
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
      
      // Mock to track which tables are accessed
      const tablesAccessed: string[] = []
      
      const mockFrom = vi.fn((tableName: string) => {
        tablesAccessed.push(tableName)
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
      
      // Assert: Verify transactions table was never accessed for deletion
      expect(tablesAccessed).toContain('connected_accounts')
      expect(tablesAccessed).toContain('profiles')
      expect(tablesAccessed).not.toContain('transactions')
      
      // Verify only profiles was updated (soft-delete) and connected_accounts was deleted
      expect(mockUpdate).toHaveBeenCalled()
      expect(mockDelete).toHaveBeenCalled()
    })
    
    it('should preserve activities table references after soft-delete', async () => {
      // Arrange: Successful soft-delete
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
      
      const tablesAccessed: string[] = []
      
      const mockFrom = vi.fn((tableName: string) => {
        tablesAccessed.push(tableName)
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
      
      // Assert: Verify activities table was never accessed for deletion
      expect(tablesAccessed).not.toContain('activities')
      
      // Verify soft-delete preserves activity references
      expect(mockUpdate).toHaveBeenCalled()
      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall.status).toBe('deleted')
    })
    
    it('should preserve posts table references after soft-delete', async () => {
      // Arrange: Successful soft-delete
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
      
      const tablesAccessed: string[] = []
      
      const mockFrom = vi.fn((tableName: string) => {
        tablesAccessed.push(tableName)
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
      
      // Assert: Verify posts table was never accessed for deletion
      expect(tablesAccessed).not.toContain('posts')
    })
  })
  
  describe('Balance Integrity', () => {
    it('should not modify balance during soft-delete', async () => {
      // Arrange: Profile with existing balance
      const mockBalance = 50000 // 50k sats
      
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
                    balance: mockBalance
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
      
      const request = new Request('http://localhost:3000/api/delete-child-account', {
        method: 'POST',
        body: JSON.stringify({ childAccountId: mockChildUserId })
      })
      
      // Act
      await deleteChildAccount(request)
      
      // Assert: Verify balance field was not included in update
      expect(mockUpdate).toHaveBeenCalled()
      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall).not.toHaveProperty('balance')
      expect(updateCall.status).toBe('deleted')
    })
  })
  
  describe('Audit Trail', () => {
    it('should record who deleted the account', async () => {
      // Arrange
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
      
      // Assert: Verify deleted_by was set to parent user ID
      expect(mockUpdate).toHaveBeenCalled()
      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall.deleted_by).toBe(mockParentUserId)
    })
    
    it('should record when the account was deleted', async () => {
      // Arrange
      const mockNow = new Date('2024-01-15T10:30:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)
      
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
      
      // Assert: Verify deleted_at timestamp was set
      expect(mockUpdate).toHaveBeenCalled()
      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall.deleted_at).toBeTruthy()
      expect(updateCall.updated_at).toBeTruthy()
      
      // Clean up
      vi.useRealTimers()
    })
  })
  
  describe('Data Isolation', () => {
    it('should not affect other users profiles during deletion', async () => {
      // Arrange: Only target child account is modified
      const otherUserId = 'other-user-999'
      
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
      
      // Assert: Verify update was scoped to specific child account ID
      const updateEqCall = mockUpdate.mock.results[0].value.eq
      expect(updateEqCall).toHaveBeenCalledWith('id', mockChildUserId)
      
      // Verify other user IDs were not involved
      const allMockCalls = JSON.stringify(mockUpdate.mock.calls)
      expect(allMockCalls).not.toContain(otherUserId)
      
      // Verify parent user ID only appears as deleted_by reference, not as the target
      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall.deleted_by).toBe(mockParentUserId) // Parent ID should be in deleted_by
      expect(updateEqCall).toHaveBeenCalledWith('id', mockChildUserId) // But child ID is the target
    })
  })
})