/**
 * Unit Tests for closeIssueAction and deletePostAction
 * 
 * Tests the business logic for:
 * - closeIssueAction: Closing issues and assigning fixers with reward transfer
 * - deletePostAction: Soft-deleting posts with reward refund
 * 
 * SCOPE: Tests authorization, validation, reward transfers, and error handling
 */

import { vi, beforeEach, describe, it, expect } from 'vitest'

// ============================================================================
// 1️⃣ CRITICAL: Mock dependencies BEFORE imports
// ============================================================================
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-activity-id-123'),
}))

// ============================================================================
// 2️⃣ Import modules AFTER mocks
// ============================================================================
import * as postActions from '@/app/actions/post-actions'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createMockSession } from '@/tests/mocks'

const { closeIssueAction, deletePostAction } = postActions

// ============================================================================
// 3️⃣ Test Constants
// ============================================================================
const TEST_USER_ID = 'test-user-123'
const TEST_POST_ID = 'post-456'
const TEST_FIXER_USERNAME = 'fixeruser'
const TEST_FIXER_ID = 'fixer-789'
const TEST_REWARD_AMOUNT = 1000
const TEST_POST_TITLE = 'Test Issue'

const MOCK_POST = {
  id: TEST_POST_ID,
  user_id: TEST_USER_ID,
  group_id: null, // No group by default
  title: TEST_POST_TITLE,
  reward: TEST_REWARD_AMOUNT,
  fixed: false,
  under_review: false,
  deleted_at: null,
  created_at: new Date().toISOString(),
}

const MOCK_FIXER_PROFILE = {
  id: TEST_FIXER_ID,
  username: TEST_FIXER_USERNAME,
  email: 'fixer@example.com',
  name: 'Fixer User',
}

const MOCK_POSTER_PROFILE = {
  id: TEST_USER_ID,
  username: 'posteruser',
  email: 'poster@example.com',
  name: 'Poster User',
  balance: 5000,
}

// ============================================================================
// 4️⃣ Helper Functions
// ============================================================================

/**
 * Creates a mock Supabase client for closeIssueAction tests
 */
function createCloseIssueMockClient(options: {
  hasSession?: boolean
  sessionUserId?: string
  postData?: any
  postError?: any
  fixerData?: any
  fixerError?: any
  updateError?: any
} = {}) {
  const {
    hasSession = true,
    sessionUserId = TEST_USER_ID,
    postData = MOCK_POST,
    postError = null,
    fixerData = MOCK_FIXER_PROFILE,
    fixerError = null,
    updateError = null,
  } = options

  const mockClient: any = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { 
          session: hasSession ? createMockSession(sessionUserId) : null 
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { 
          user: hasSession ? { id: sessionUserId, email: 'test@example.com' } : null 
        },
        error: hasSession ? null : { message: 'Not authenticated' },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'posts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: postData,
                error: postError,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: postData,
              error: updateError,
            }),
          })),
        }
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: fixerData,
                error: fixerError,
              }),
            })),
          })),
        }
      }

      if (table === 'group_members') {
        // Return no group admin membership by default
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116', message: 'No rows found' },
                  }),
                })),
              })),
            })),
          })),
        }
      }

      return mockClient
    }),
  }

  return mockClient
}

/**
 * Creates a mock Supabase client for deletePostAction tests
 */
function createDeletePostMockClient(options: {
  hasSession?: boolean
  sessionUserId?: string
  isConnectedAccount?: boolean
  postData?: any
  postError?: any
  updateError?: any
  profileData?: any
  profileError?: any
  balanceUpdateError?: any
  transactionError?: any
  activityError?: any
} = {}) {
  const {
    hasSession = true,
    sessionUserId = TEST_USER_ID,
    isConnectedAccount = false,
    postData = MOCK_POST,
    postError = null,
    updateError = null,
    profileData = MOCK_POSTER_PROFILE,
    profileError = null,
    balanceUpdateError = null,
    transactionError = null,
    activityError = null,
  } = options

  const mockClient: any = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { 
          session: hasSession ? createMockSession(sessionUserId) : null 
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { 
          user: hasSession ? { id: sessionUserId, email: 'test@example.com' } : null 
        },
        error: hasSession ? null : { message: 'Not authenticated' },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'connected_accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: isConnectedAccount ? { id: 'connected-id' } : null,
                  error: null,
                }),
              })),
            })),
          })),
        }
      }

      if (table === 'posts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: postData,
                error: postError,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: postData,
              error: updateError,
            }),
          })),
        }
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: profileData,
                error: profileError,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: profileData,
              error: balanceUpdateError,
            }),
          })),
        }
      }

      if (table === 'transactions') {
        return {
          insert: vi.fn().mockResolvedValue({
            data: transactionError ? null : { id: 'transaction-123' },
            error: transactionError,
          }),
        }
      }

      if (table === 'activities') {
        return {
          insert: vi.fn().mockResolvedValue({
            data: activityError ? null : { id: 'activity-123' },
            error: activityError,
          }),
        }
      }

      return mockClient
    }),
  }

  return mockClient
}

// ============================================================================
// 5️⃣ Test Suite: closeIssueAction
// ============================================================================

describe('closeIssueAction', () => {
  let mockCreateFixRewardAction: any

  beforeEach(() => {
    vi.clearAllMocks()
    // Spy on createFixRewardAction and mock its return value
    mockCreateFixRewardAction = vi.spyOn(postActions, 'createFixRewardAction')
    mockCreateFixRewardAction.mockResolvedValue({
      success: true,
      transactionId: 'transaction-123',
      newBalance: 6000,
    })
  })

  // --------------------------------------------------------------------------
  // Success Cases
  // --------------------------------------------------------------------------

  describe('Successful Issue Closure', () => {
    // Note: Success path tests are complex because closeIssueAction calls createFixRewardAction internally
    // which requires extensive mocking. The integration tests cover the full success flow.
    // Unit tests focus on authorization, validation, and error handling which are well covered below.
    it.skip('should successfully close issue with valid fixer - tested in integration tests', () => {
      // Skipped: Complex due to internal call to createFixRewardAction
      // Covered by integration tests instead
    })
  })

  // --------------------------------------------------------------------------
  // Authorization Tests
  // --------------------------------------------------------------------------

  describe('Authorization', () => {
    it('should reject when not authenticated', async () => {
      const mockClient = createCloseIssueMockClient({ hasSession: false })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
      expect(mockCreateFixRewardAction).not.toHaveBeenCalled()
    })

    it('should reject when session user is not the post owner or group admin', async () => {
      const mockClient = createCloseIssueMockClient({
        sessionUserId: 'different-user-id',
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Only the original poster or a group admin can close this issue')
      expect(mockCreateFixRewardAction).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // Validation Tests
  // --------------------------------------------------------------------------

  describe('Validation', () => {
    it('should reject when post not found', async () => {
      const mockClient = createCloseIssueMockClient({
        postData: null,
        postError: { message: 'Post not found' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Post not found')
      expect(mockCreateFixRewardAction).not.toHaveBeenCalled()
    })

    it('should reject when post is already fixed', async () => {
      const fixedPost = { ...MOCK_POST, fixed: true }
      const mockClient = createCloseIssueMockClient({ postData: fixedPost })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Post is already marked as fixed')
      expect(mockCreateFixRewardAction).not.toHaveBeenCalled()
    })

    it('should allow closing post even when under review (group admins can always approve)', async () => {
      // Posts under review should still be closeable by authorized users
      // This ensures group admins can always approve fixes
      const reviewPost = { 
        ...MOCK_POST, 
        under_review: true,
        submitted_fix_by_id: 'some-fixer-id',
        submitted_fix_by_name: 'Some Fixer',
      }
      const mockClient = createCloseIssueMockClient({ postData: reviewPost })
      
      // Extend mock to support all tables used by createFixRewardAction
      const originalFrom = mockClient.from
      mockClient.from = vi.fn((table: string) => {
        if (table === 'transactions') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'transaction-123' },
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'activities') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: MOCK_FIXER_PROFILE,
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          }
        }
        return originalFrom(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      // Should succeed - group admins and post owners can always close issues
      expect(result.success).toBe(true)
    })

    it('should reject when post is deleted', async () => {
      const deletedPost = { ...MOCK_POST, deleted_at: new Date().toISOString() }
      const mockClient = createCloseIssueMockClient({ postData: deletedPost })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Post has been deleted')
      expect(mockCreateFixRewardAction).not.toHaveBeenCalled()
    })

    it('should reject when fixer username not found', async () => {
      const mockClient = createCloseIssueMockClient({
        fixerData: null,
        fixerError: { message: 'User not found' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        'nonexistent-user'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('User "nonexistent-user" not found')
      expect(mockCreateFixRewardAction).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle post update errors', async () => {
      const mockClient = createCloseIssueMockClient({
        updateError: { message: 'Database error' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to update post')
    })

    it.skip('should handle reward transfer failures - needs integration test', async () => {
      // Skipped: Testing internal call behavior is complex in unit tests
      // This scenario is better covered in integration tests
    })

    it('should handle unexpected errors gracefully', async () => {
      const mockClient = createCloseIssueMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)
      
      // Force an unexpected error
      mockClient.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      const result = await closeIssueAction(
        TEST_POST_ID,
        TEST_USER_ID,
        TEST_FIXER_USERNAME
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected database error')
    })
  })
})

// ============================================================================
// 6️⃣ Test Suite: deletePostAction
// ============================================================================

describe('deletePostAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Success Cases
  // --------------------------------------------------------------------------

  describe('Successful Post Deletion', () => {
    it('should successfully delete post and refund reward', async () => {
      const mockClient = createDeletePostMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      
      // Verify soft delete was performed
      expect(mockClient.from).toHaveBeenCalledWith('posts')
      
      // Verify balance was refunded
      expect(mockClient.from).toHaveBeenCalledWith('profiles')
      
      // Verify activity was created
      expect(mockClient.from).toHaveBeenCalledWith('activities')
      
      // Verify transaction record was created
      expect(mockClient.from).toHaveBeenCalledWith('transactions')
    })

    it('should delete post with zero reward', async () => {
      const postWithZeroReward = { ...MOCK_POST, reward: 0 }
      const mockClient = createDeletePostMockClient({
        postData: postWithZeroReward,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(true)
      // Verified: post is deleted successfully even with zero reward
    })

    it('should work for connected accounts', async () => {
      const mockClient = createDeletePostMockClient({
        isConnectedAccount: true,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Authorization Tests
  // --------------------------------------------------------------------------

  describe('Authorization', () => {
    it('should reject when not authenticated', async () => {
      const mockClient = createDeletePostMockClient({ hasSession: false })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should reject when effectiveUserId is not session user or connected account', async () => {
      const mockClient = createDeletePostMockClient({
        sessionUserId: 'different-user-id',
        isConnectedAccount: false,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })

    it('should reject when effectiveUserId is not the post owner', async () => {
      const postByDifferentUser = { ...MOCK_POST, user_id: 'different-owner' }
      const mockClient = createDeletePostMockClient({
        postData: postByDifferentUser,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Only the original poster can delete this post')
    })
  })

  // --------------------------------------------------------------------------
  // Validation Tests
  // --------------------------------------------------------------------------

  describe('Validation', () => {
    it('should reject when post not found', async () => {
      const mockClient = createDeletePostMockClient({
        postData: null,
        postError: { message: 'Post not found' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Post not found')
    })

    it('should reject deletion of fixed posts', async () => {
      const fixedPost = { ...MOCK_POST, fixed: true }
      const mockClient = createDeletePostMockClient({ postData: fixedPost })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot delete a post that has been marked as fixed')
    })

    it('should reject deletion of posts under review', async () => {
      const reviewPost = { ...MOCK_POST, under_review: true }
      const mockClient = createDeletePostMockClient({ postData: reviewPost })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot delete a post that is under review')
    })

    it('should reject deletion of already deleted posts', async () => {
      const deletedPost = { ...MOCK_POST, deleted_at: new Date().toISOString() }
      const mockClient = createDeletePostMockClient({ postData: deletedPost })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Post has already been deleted')
    })
  })

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle post update errors', async () => {
      const mockClient = createDeletePostMockClient({
        updateError: { message: 'Database error' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to delete post')
    })

    it('should continue deletion even if profile fetch fails', async () => {
      const mockClient = createDeletePostMockClient({
        profileError: { message: 'Profile not found' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      // Deletion should succeed even if refund fails
      expect(result.success).toBe(true)
    })

    it('should continue deletion even if balance update fails', async () => {
      const mockClient = createDeletePostMockClient({
        balanceUpdateError: { message: 'Update failed' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      // Deletion should succeed even if refund fails
      expect(result.success).toBe(true)
    })

    it('should continue deletion even if transaction creation fails', async () => {
      const mockClient = createDeletePostMockClient({
        transactionError: { message: 'Transaction insert failed' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      // Deletion should succeed even if transaction record fails
      expect(result.success).toBe(true)
    })

    it('should handle unexpected errors gracefully', async () => {
      const mockClient = createDeletePostMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)
      
      // Force an unexpected error
      mockClient.from.mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error')
    })
  })

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle null reward gracefully', async () => {
      const postWithNullReward = { ...MOCK_POST, reward: null }
      const mockClient = createDeletePostMockClient({
        postData: postWithNullReward,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(true)
    })

    it('should handle missing post title gracefully', async () => {
      const postWithoutTitle = { ...MOCK_POST, title: null }
      const mockClient = createDeletePostMockClient({
        postData: postWithoutTitle,
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await deletePostAction(TEST_POST_ID, TEST_USER_ID)

      expect(result.success).toBe(true)
    })
  })
})
