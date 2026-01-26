/**
 * Unit Tests for createFixRewardAction
 * 
 * Tests the core business logic for creating and distributing fix rewards,
 * including transaction flows, error handling, and balance updates.
 * 
 * SCOPE: This action is called when marking a post as fixed to reward the fixer.
 * It creates transactions, updates balances, increments fix counters, and logs activities.
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

// @/lib/supabase mock provided by tests/setup.ts

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-activity-id-123'),
}))

// ============================================================================
// 2️⃣ Import modules AFTER mocks
// ============================================================================
import { createFixRewardAction } from '@/app/actions/post-actions'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createMockSession } from '@/tests/mocks'

// ============================================================================
// 3️⃣ Test Constants
// ============================================================================
const TEST_USER_ID = 'test-user-123'
const TEST_POST_ID = 'post-456'
const TEST_REWARD_AMOUNT = 1000
const TEST_POST_TITLE = 'Test Post Title'

const MOCK_PROFILE = {
  id: TEST_USER_ID,
  balance: 5000,
  pet_coins: 3000,
  fixed_issues_count: 5,
  email: 'user@example.com',
  username: 'testuser',
  created_at: new Date().toISOString(),
}

const MOCK_TRANSACTION = {
  id: 'transaction-789',
  user_id: TEST_USER_ID,
  type: 'internal',
  amount: TEST_REWARD_AMOUNT,
  status: 'completed',
  created_at: new Date().toISOString(),
}

// ============================================================================
// 4️⃣ Helper Functions
// ============================================================================

/**
 * Creates a comprehensive mock Supabase client with all necessary chains
 */
function createCompleteMockClient(options: {
  hasSession?: boolean
  isConnectedAccount?: boolean
  profileData?: any
  profileError?: any
  transactionError?: any
  balanceUpdateError?: any
  activityError?: any
} = {}) {
  const {
    hasSession = true,
    isConnectedAccount = false,
    profileData = MOCK_PROFILE,
    profileError = null,
    transactionError = null,
    balanceUpdateError = null,
    activityError = null,
  } = options

  const mockClient: any = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { 
          session: hasSession ? createMockSession(TEST_USER_ID) : null 
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { 
          user: hasSession ? { id: TEST_USER_ID, email: 'test@example.com' } : null 
        },
        error: hasSession ? null : { message: 'Not authenticated' },
      }),
    },
    from: vi.fn((table: string) => {
      // Mock connected_accounts query
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

      // Mock posts query (for email notification)
      if (table === 'posts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: TEST_POST_ID, user_id: 'post-owner-id', title: TEST_POST_TITLE },
                error: null,
              }),
            })),
          })),
        }
      }

      // Mock profiles query (for fetching balance or email notification)
      if (table === 'profiles' && !profileError && !balanceUpdateError) {
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

      // Mock profiles with error
      if (table === 'profiles' && (profileError || balanceUpdateError)) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: profileError ? null : profileData,
                error: profileError,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: balanceUpdateError,
            }),
          })),
        }
      }

      // Mock transactions insert
      if (table === 'transactions') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: transactionError ? null : MOCK_TRANSACTION,
                error: transactionError,
              }),
            })),
          })),
        }
      }

      // Mock activities insert
      if (table === 'activities') {
        return {
          insert: vi.fn().mockResolvedValue({
            data: activityError ? null : { id: 'activity-id' },
            error: activityError,
          }),
        }
      }

      return mockClient
    }),
  }

  return mockClient
}

/**
 * Sets up the Supabase mock to return different clients for regular and admin calls
 */
function setupSupabaseMock(regularClient: any, adminClient?: any) {
  const actualAdminClient = adminClient || regularClient
  
  vi.mocked(createServerSupabaseClient).mockImplementation((options?: any) => {
    // If supabaseKey is provided, return admin client
    if (options?.supabaseKey) {
      return actualAdminClient
    }
    // Otherwise return regular client
    return regularClient
  })
}

// ============================================================================
// 5️⃣ Test Suite
// ============================================================================

describe('createFixRewardAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Success Cases
  // --------------------------------------------------------------------------

  describe('Successful Fix Reward Creation', () => {
    it('should successfully create fix reward with valid parameters', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
        postTitle: TEST_POST_TITLE,
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe(MOCK_TRANSACTION.id)
      expect(result.newBalance).toBe(MOCK_PROFILE.balance + TEST_REWARD_AMOUNT)
    })

    it('should work without postTitle parameter', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBeDefined()
    })

    it('should increment fixed_issues_count', async () => {
      const mockClient = createCompleteMockClient()
      const updateSpy = vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }))
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'profiles' && mockClient.from.mock.calls.filter((c: any) => c[0] === 'profiles').length > 1) {
          return { update: updateSpy }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(updateSpy).toHaveBeenCalled()
    })

    it('should update pet_coins along with balance', async () => {
      const mockClient = createCompleteMockClient()
      const updateSpy = vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }))
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: MOCK_PROFILE,
                  error: null,
                }),
              })),
            })),
            update: updateSpy,
          }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(true)
    })

    it('should create activity record for the fix', async () => {
      const mockClient = createCompleteMockClient()
      const activityInsertSpy = vi.fn().mockResolvedValue({ data: {}, error: null })
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'activities') {
          return { insert: activityInsertSpy }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
        postTitle: TEST_POST_TITLE,
      })

      expect(activityInsertSpy).toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // Authentication & Authorization
  // --------------------------------------------------------------------------

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const mockClient = createCompleteMockClient({ hasSession: false })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Not authenticated')
    })

    it('should allow connected accounts to receive rewards', async () => {
      const mockClient = createCompleteMockClient({ isConnectedAccount: true })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: 'different-user-id',
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(true)
    })

    it('should reject attempts to credit another user without connection', async () => {
      const mockClient = createCompleteMockClient({ isConnectedAccount: false })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: 'different-user-id',
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY ALERT'),
        expect.any(Object)
      )
      
      consoleErrorSpy.mockRestore()
    })
  })

  // --------------------------------------------------------------------------
  // Post Owner Closing Flow
  // --------------------------------------------------------------------------

  describe('Post Owner Closing Flow (isPostOwnerClosing)', () => {
    it('should allow post owner to close issue and transfer reward to any user', async () => {
      const postOwnerId = TEST_USER_ID
      const fixerId = 'different-fixer-id'
      
      const mockClient = createCompleteMockClient()
      
      // Mock the post query to return post owned by TEST_USER_ID
      mockClient.from = vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: TEST_POST_ID, user_id: postOwnerId, title: TEST_POST_TITLE },
                  error: null,
                }),
              })),
            })),
          }
        }
        
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...MOCK_PROFILE, id: fixerId },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
            })),
          }
        }
        
        if (table === 'transactions') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...MOCK_TRANSACTION, user_id: fixerId },
                  error: null,
                }),
              })),
            })),
          }
        }
        
        if (table === 'activities') {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }
        }
        
        return mockClient
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: fixerId,
        reward: TEST_REWARD_AMOUNT,
        postTitle: TEST_POST_TITLE,
        isPostOwnerClosing: true,
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBeDefined()
    })

    it('should reject when non-owner tries to use isPostOwnerClosing', async () => {
      const postOwnerId = 'actual-post-owner-id'
      const nonOwnerId = TEST_USER_ID // Session user is different from post owner
      const fixerId = 'some-fixer-id'
      
      const mockClient = createCompleteMockClient()
      
      // Mock the post query to return post owned by someone else
      mockClient.from = vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: TEST_POST_ID, user_id: postOwnerId, title: TEST_POST_TITLE },
                  error: null,
                }),
              })),
            })),
          }
        }
        return createCompleteMockClient().from(table)
      })
      
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: fixerId,
        reward: TEST_REWARD_AMOUNT,
        isPostOwnerClosing: true,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY ALERT'),
        expect.objectContaining({
          isPostOwnerClosing: true,
        })
      )
      
      consoleErrorSpy.mockRestore()
    })

    it('should handle post not found error when isPostOwnerClosing is true', async () => {
      const mockClient = createCompleteMockClient()
      
      // Mock the post query to return not found
      mockClient.from = vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Post not found' },
                }),
              })),
            })),
          }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: 'non-existent-post',
        userId: 'some-user',
        reward: TEST_REWARD_AMOUNT,
        isPostOwnerClosing: true,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Post not found')
    })

    it('should log authorization message when post owner closes issue', async () => {
      const postOwnerId = TEST_USER_ID
      const fixerId = 'fixer-user-id'
      
      const mockClient = createCompleteMockClient()
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: TEST_POST_ID, user_id: postOwnerId, group_id: null, title: TEST_POST_TITLE },
                  error: null,
                }),
              })),
            })),
          }
        }
        
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...MOCK_PROFILE, id: fixerId },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
            })),
          }
        }
        
        if (table === 'transactions') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...MOCK_TRANSACTION, user_id: fixerId },
                  error: null,
                }),
              })),
            })),
          }
        }
        
        if (table === 'activities') {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }
        }
        
        return mockClient
      })
      
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: fixerId,
        reward: TEST_REWARD_AMOUNT,
        isPostOwnerClosing: true,
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Post owner or group admin closing issue - authorized to transfer reward to any user'
      )
      
      consoleLogSpy.mockRestore()
    })

    it('should not bypass validation when isPostOwnerClosing is true', async () => {
      const mockClient = createCompleteMockClient()
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: TEST_POST_ID, user_id: TEST_USER_ID, title: TEST_POST_TITLE },
                  error: null,
                }),
              })),
            })),
          }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // Test with invalid reward amount
      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: 'some-fixer',
        reward: 0, // Invalid
        isPostOwnerClosing: true,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid parameters')
    })
  })

  // --------------------------------------------------------------------------
  // Input Validation
  // --------------------------------------------------------------------------

  describe('Input Validation', () => {
    it('should reject empty postId', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: '',
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid parameters')
    })

    it('should reject empty userId', async () => {
      const mockClient = createCompleteMockClient()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: '',
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      // Empty userId triggers authorization check first (not matching authenticated user)
      expect(result.error).toContain('Unauthorized')
      
      consoleErrorSpy.mockRestore()
    })

    it('should reject zero reward amount', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: 0,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid parameters')
    })

    it('should reject negative reward amount', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: -100,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid parameters')
    })

    it('should accept large reward amounts', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: 1500000, // 1.5M sats
      })

      expect(result.success).toBe(true)
    })

    it('should accept minimum valid reward (1 sat)', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: 1,
      })

      expect(result.success).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Profile Handling
  // --------------------------------------------------------------------------

  describe('Profile Handling', () => {
    it('should reject when user profile not found', async () => {
      const mockClient = createCompleteMockClient({
        profileData: null,
        profileError: { message: 'Profile not found' },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('User profile not found')
    })

    it('should handle null balance in profile', async () => {
      const mockClient = createCompleteMockClient({
        profileData: { ...MOCK_PROFILE, balance: null, pet_coins: null, fixed_issues_count: null },
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(true)
      expect(result.newBalance).toBe(TEST_REWARD_AMOUNT) // 0 + reward
    })
  })

  // --------------------------------------------------------------------------
  // Transaction Handling
  // --------------------------------------------------------------------------

  describe('Transaction Handling', () => {
    it('should create transaction with correct type and status', async () => {
      const mockClient = createCompleteMockClient()
      const insertSpy = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: MOCK_TRANSACTION,
            error: null,
          }),
        })),
      }))
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'transactions') {
          return { insert: insertSpy }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
        postTitle: TEST_POST_TITLE,
      })

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER_ID,
          type: 'internal',
          amount: TEST_REWARD_AMOUNT,
          status: 'completed',
        })
      )
    })

    it('should handle transaction creation failure', async () => {
      const mockClient = createCompleteMockClient({
        transactionError: { message: 'Transaction insert failed' },
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to create transaction')
      expect(consoleErrorSpy).toHaveBeenCalled()
      
      consoleErrorSpy.mockRestore()
    })

    it('should include post title in transaction memo', async () => {
      const mockClient = createCompleteMockClient()
      const insertSpy = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: MOCK_TRANSACTION,
            error: null,
          }),
        })),
      }))
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'transactions') {
          return { insert: insertSpy }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
        postTitle: TEST_POST_TITLE,
      })

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memo: `Fix reward earned: ${TEST_POST_TITLE}`,
        })
      )
    })

    it('should use fallback memo when postTitle not provided', async () => {
      const mockClient = createCompleteMockClient()
      const insertSpy = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: MOCK_TRANSACTION,
            error: null,
          }),
        })),
      }))
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'transactions') {
          return { insert: insertSpy }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          memo: 'Fix reward earned: Issue fixed',
        })
      )
    })
  })

  // --------------------------------------------------------------------------
  // Balance Update Handling
  // --------------------------------------------------------------------------

  describe('Balance Update Handling', () => {
    it('should calculate correct new balance', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(true)
      expect(result.newBalance).toBe(MOCK_PROFILE.balance + TEST_REWARD_AMOUNT)
    })

    it('should handle balance update failure after transaction creation', async () => {
      const mockClient = createCompleteMockClient({
        balanceUpdateError: { message: 'Balance update failed' },
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Transaction created but balance update failed')
      expect(consoleErrorSpy).toHaveBeenCalled()
      
      consoleErrorSpy.mockRestore()
    })

    it('should update balance, pet_coins, and fixed_issues_count atomically', async () => {
      const mockClient = createCompleteMockClient()
      const updateSpy = vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }))
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: MOCK_PROFILE,
                  error: null,
                }),
              })),
            })),
            update: updateSpy,
          }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: MOCK_PROFILE.balance + TEST_REWARD_AMOUNT,
          pet_coins: MOCK_PROFILE.pet_coins + TEST_REWARD_AMOUNT,
          fixed_issues_count: MOCK_PROFILE.fixed_issues_count + 1,
        })
      )
    })
  })

  // --------------------------------------------------------------------------
  // Activity Logging
  // --------------------------------------------------------------------------

  describe('Activity Logging', () => {
    it('should create activity with correct structure', async () => {
      const mockClient = createCompleteMockClient()
      const activityInsertSpy = vi.fn().mockResolvedValue({ data: {}, error: null })
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'activities') {
          return { insert: activityInsertSpy }
        }
        return createCompleteMockClient().from(table)
      })
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
        postTitle: TEST_POST_TITLE,
      })

      expect(activityInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER_ID,
          type: 'fix',
          related_id: TEST_POST_ID,
          related_table: 'posts',
        })
      )
    })

    it('should continue even if activity creation fails', async () => {
      const mockClient = createCompleteMockClient({
        activityError: { message: 'Activity insert failed' },
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      // Should still succeed even if activity logging fails
      expect(result.success).toBe(true)
      
      consoleErrorSpy.mockRestore()
    })
  })

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      const mockClient = createCompleteMockClient()
      mockClient.auth.getUser.mockRejectedValue(new Error('Unexpected error'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      
      consoleErrorSpy.mockRestore()
    })
  })

  // --------------------------------------------------------------------------
  // Return Value Structure
  // --------------------------------------------------------------------------

  describe('Return Value Structure', () => {
    it('should return correct success structure', async () => {
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('transactionId')
      expect(result).toHaveProperty('newBalance')
      expect(result).not.toHaveProperty('error')
    })

    it('should return correct error structure', async () => {
      const mockClient = createCompleteMockClient({ hasSession: false })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const result = await createFixRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD_AMOUNT,
      })

      expect(result).toHaveProperty('success', false)
      expect(result).toHaveProperty('error')
      expect(typeof result.error).toBe('string')
      expect(result.error).not.toBe('')
    })
  })
})
