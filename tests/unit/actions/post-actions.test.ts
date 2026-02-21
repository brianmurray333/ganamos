import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Next.js cookies (MUST be at top level before imports)
const mockCookies = vi.fn(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'default-test-uuid'),
}))

// Mock global fetch for Nostr/Sphinx publishing
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: async () => ({}),
} as Response))

// Mock safety-caps module
vi.mock('@/lib/safety-caps', () => ({
  checkPostRewardCap: vi.fn().mockResolvedValue({ allowed: true, capLevel: 'none', message: null }),
  checkLivePostsCap: vi.fn().mockResolvedValue({ allowed: true, currentCount: 0, limitValue: 200, violationId: null }),
  checkPostSafetyCaps: vi.fn().mockResolvedValue({ allowed: true }),
}))

// Mock sms-alerts module
vi.mock('@/lib/sms-alerts', () => ({
  alertLargePostBounty: vi.fn().mockResolvedValue(undefined),
}))

// @/lib/supabase mock provided by tests/setup.ts

import { createFundedAnonymousPostAction, createPostWithRewardAction, updatePostExpirationAction } from '@/app/actions/post-actions'
import { createServerSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'
import { createMockPostData } from '@/tests/unit/helpers/posts-api-mocks'
import { mockSupabaseClient } from '@/tests/setup'

// Test constants
const TEST_POST_ID = 'test-post-123'
const TEST_ACTIVITY_ID = 'test-activity-456'
const MOCK_TIMESTAMP = '2024-01-01T00:00:00.000Z'

describe('createFundedAnonymousPostAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock Date for consistent timestamps
    vi.useFakeTimers()
    vi.setSystemTime(new Date(MOCK_TIMESTAMP))
    
    // Mock UUID generation
    vi.mocked(uuidv4).mockReturnValueOnce(TEST_POST_ID as any)
    vi.mocked(uuidv4).mockReturnValueOnce(TEST_ACTIVITY_ID as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Successful Post Creation', () => {
    it('should create anonymous post with all required fields', async () => {
      // ARRANGE
      const postData = createMockPostData({
        description: 'Fix broken streetlight on Main St',
        reward: 1000,
        funding_r_hash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
        funding_payment_request: 'lnbc10n1pj9x7xmpp5abc123def456',
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        location: 'Main Street',
        image_url: 'https://example.com/image.jpg'
      })

      // Mock successful post insertion
      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      // Mock successful activity insertion
      let capturedActivityInsert: any = null
      const activityQueryBuilder = {
        insert: vi.fn((data) => {
          capturedActivityInsert = data
          return activityQueryBuilder
        })
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT - Success response
      expect(result.success).toBe(true)
      expect(result.postId).toBe(TEST_POST_ID)
      expect(result.error).toBeUndefined()

      // ASSERT - Post data structure
      expect(capturedPostInsert).toBeDefined()
      expect(capturedPostInsert).toMatchObject({
        id: TEST_POST_ID,
        user_id: null,
        created_by: 'Anonymous',
        created_by_avatar: null,
        title: postData.description.substring(0, 50),
        description: postData.description,
        image_url: postData.image_url,
        location: postData.location,
        latitude: postData.latitude,
        longitude: postData.longitude,
        reward: postData.reward,
        claimed: false,
        fixed: false,
        created_at: MOCK_TIMESTAMP,
        group_id: null,
        city: postData.city,
        is_anonymous: true,
        funding_r_hash: postData.funding_r_hash,
        funding_payment_request: postData.funding_payment_request,
        funding_status: 'paid'
      })

      // ASSERT - Activity log created
      expect(capturedActivityInsert).toBeDefined()
      expect(capturedActivityInsert).toMatchObject({
        id: TEST_ACTIVITY_ID,
        user_id: null,
        type: 'post',
        related_id: TEST_POST_ID,
        related_table: 'posts',
        timestamp: MOCK_TIMESTAMP,
        metadata: { title: postData.description.substring(0, 50) }
      })

      // ASSERT - Database calls
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts')
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('activities')
      expect(postQueryBuilder.insert).toHaveBeenCalledTimes(1)
      expect(activityQueryBuilder.insert).toHaveBeenCalledTimes(1)
    })

    it('should handle null image_url with placeholder', async () => {
      // ARRANGE
      const postData = createMockPostData({
        description: 'Test post',
        reward: 500,
        image_url: null
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.image_url).toBe('/placeholder.jpg')
    })

    it('should use provided image_url when not null', async () => {
      // ARRANGE
      const postData = createMockPostData({
        description: 'Test post',
        reward: 500,
        image_url: 'https://example.com/custom.jpg'
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.image_url).toBe('https://example.com/custom.jpg')
    })

    it('should truncate long descriptions for title (max 50 chars)', async () => {
      // ARRANGE
      const longDescription = 'A'.repeat(100)
      const postData = createMockPostData({
        description: longDescription,
        reward: 1000
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.title).toBe('A'.repeat(50))
      expect(capturedPostInsert.title.length).toBe(50)
      expect(capturedPostInsert.description).toBe(longDescription)
    })

    it('should generate unique UUIDs for post and activity', async () => {
      // ARRANGE
      const postId1 = 'post-uuid-1'
      const activityId1 = 'activity-uuid-1'
      const postId2 = 'post-uuid-2'
      const activityId2 = 'activity-uuid-2'
      
      vi.mocked(uuidv4)
        .mockReturnValueOnce(postId1 as any)
        .mockReturnValueOnce(activityId1 as any)
        .mockReturnValueOnce(postId2 as any)
        .mockReturnValueOnce(activityId2 as any)

      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn()
          .mockResolvedValueOnce({ data: { id: postId1 }, error: null })
          .mockResolvedValueOnce({ data: { id: postId2 }, error: null })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result1 = await createFundedAnonymousPostAction(postData)
      const result2 = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.postId).toBe(postId1)
      expect(result2.postId).toBe(postId2)
      expect(result1.postId).not.toBe(result2.postId)
      expect(uuidv4).toHaveBeenCalledTimes(4) // 2 posts + 2 activities
    })
  })

  describe('Database Error Handling', () => {
    it('should handle post insertion database error', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database constraint violation', code: 'PGRST116' }
        })
      }

      mockSupabaseClient.from.mockReturnValue(postQueryBuilder)

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Database constraint violation')
      expect(result.postId).toBeUndefined()
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts')
    })

    it('should handle database connection timeout', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockRejectedValue(new Error('Connection timeout'))
      }

      mockSupabaseClient.from.mockReturnValue(postQueryBuilder)

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection timeout')
      expect(result.postId).toBeUndefined()
    })

    it('should handle unexpected error types', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockRejectedValue('String error')
      }

      mockSupabaseClient.from.mockReturnValue(postQueryBuilder)

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('An unexpected error occurred.')
      expect(result.postId).toBeUndefined()
    })
  })

  describe('Async Publishing (Fire-and-Forget)', () => {
    it('should not fail if Nostr publishing fails', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // Mock fetch to fail for Nostr
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Nostr API down'))

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT - Should still succeed despite Nostr failure
      expect(result.success).toBe(true)
      expect(result.postId).toBe(TEST_POST_ID)
    })

    it('should not fail if Sphinx publishing fails', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // Mock fetch to succeed for Nostr, fail for Sphinx
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockRejectedValueOnce(new Error('Sphinx API down'))

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT - Should still succeed despite Sphinx failure
      expect(result.success).toBe(true)
      expect(result.postId).toBe(TEST_POST_ID)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large reward amounts', async () => {
      // ARRANGE - 10 million sats
      const postData = createMockPostData({
        description: 'Large reward post',
        reward: 10_000_000
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.reward).toBe(10_000_000)
    })

    it('should handle special characters in description', async () => {
      // ARRANGE
      const postData = createMockPostData({
        description: 'Special chars: <script>alert("XSS")</script> & "quotes" \'apostrophes\' émojis 🎉',
        reward: 1000
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.description).toBe(postData.description)
    })

    it('should handle Unicode characters in location fields', async () => {
      // ARRANGE
      const postData = createMockPostData({
        description: 'Test post',
        reward: 1000,
        city: '北京', // Beijing in Chinese
        location: '天安门广场' // Tiananmen Square
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.city).toBe('北京')
      expect(capturedPostInsert.location).toBe('天安门广场')
    })

    it('should handle extreme valid coordinates', async () => {
      // ARRANGE - North Pole
      const postData = createMockPostData({
        description: 'North Pole post',
        reward: 1000,
        latitude: 90.0,
        longitude: 0.0
      })

      let capturedPostInsert: any = null
      const postQueryBuilder = {
        insert: vi.fn((data) => {
          capturedPostInsert = data
          return postQueryBuilder
        }),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedPostInsert.latitude).toBe(90.0)
      expect(capturedPostInsert.longitude).toBe(0.0)
    })
  })

  describe('Response Structure Validation', () => {
    it('should return correct success response structure', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: { id: TEST_POST_ID },
          error: null
        })
      }

      const activityQueryBuilder = {
        insert: vi.fn()
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      })

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('postId')
      expect(result.success).toBe(true)
      expect(result.postId).toBe(TEST_POST_ID)
      expect(result.error).toBeUndefined()
    })

    it('should return correct error response structure', async () => {
      // ARRANGE
      const postData = createMockPostData({ reward: 1000 })

      const postQueryBuilder = {
        insert: vi.fn(() => postQueryBuilder),
        select: vi.fn(() => postQueryBuilder),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        })
      }

      mockSupabaseClient.from.mockReturnValue(postQueryBuilder)

      // ACT
      const result = await createFundedAnonymousPostAction(postData)

      // ASSERT
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('error')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Database error')
      expect(typeof result.error).toBe('string')
      expect(result.postId).toBeUndefined()
    })
  })
})

// ============================================================================
// createPostWithRewardAction Tests
// ============================================================================

describe('createPostWithRewardAction', () => {
  const TEST_USER_ID = 'test-user-123'
  const TEST_POST_ID = 'test-post-456'
  const TEST_REWARD = 1000
  const TEST_MEMO = 'Test post reward'
  const TEST_TX_ID = 'tx-789'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Admin Client Usage (Critical for RLS bypass)', () => {
    it('should use admin client with service role key for transaction and balance operations', async () => {
      // ARRANGE - Create separate mock clients for user session and admin
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { 
              session: { 
                user: { id: TEST_USER_ID, email: 'test@example.com' },
                access_token: 'test-token',
                refresh_token: 'test-refresh',
              } 
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                })),
              })),
            }
          }
          throw new Error(`User client should not access table: ${table}`)
        }),
      }

      const mockAdminClient: any = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ 
                    data: { balance: 5000 }, 
                    error: null 
                  }),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            }
          }
          if (table === 'transactions') {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ 
                    data: { id: TEST_TX_ID }, 
                    error: null 
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
          throw new Error(`Unexpected table: ${table}`)
        }),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)  // First call: user session for auth
        .mockReturnValueOnce(mockAdminClient) // Second call: admin client for DB ops

      // ACT
      const result = await createPostWithRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD,
        memo: TEST_MEMO,
      })

      // ASSERT
      expect(result.success).toBe(true)
      expect(result.transactionId).toBe(TEST_TX_ID)

      // Verify createServerSupabaseClient was called twice
      expect(createServerSupabaseClient).toHaveBeenCalledTimes(2)

      // First call should be with cookie store (user session for auth check)
      expect(createServerSupabaseClient).toHaveBeenNthCalledWith(1, expect.any(Object))

      // Second call should be with service role key (admin client for DB operations)
      expect(createServerSupabaseClient).toHaveBeenNthCalledWith(2, {
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })

      // Verify admin client was used for sensitive operations
      expect(mockAdminClient.from).toHaveBeenCalledWith('profiles')
      expect(mockAdminClient.from).toHaveBeenCalledWith('transactions')
      expect(mockAdminClient.from).toHaveBeenCalledWith('activities')
    })

    it('should reject if user is not authenticated', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: { message: 'Not authenticated' },
          }),
        },
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await createPostWithRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD,
      })

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should reject if user tries to deduct from another account', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { 
              session: { 
                user: { id: 'different-user-id', email: 'other@example.com' },
              } 
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await createPostWithRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD,
      })

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('should reject if insufficient balance', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { 
              session: { 
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              } 
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      }

      const mockAdminClient: any = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ 
                    data: { balance: 500 }, // Less than reward
                    error: null 
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await createPostWithRewardAction({
        postId: TEST_POST_ID,
        userId: TEST_USER_ID,
        reward: TEST_REWARD, // 1000 > 500
      })

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Insufficient balance')
    })
  })
})

describe('createFundedAnonymousPostAction with expires_at', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(MOCK_TIMESTAMP))
    vi.mocked(uuidv4).mockReturnValueOnce(TEST_POST_ID as any)
    vi.mocked(uuidv4).mockReturnValueOnce(TEST_ACTIVITY_ID as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should persist expires_at when provided', async () => {
    // ARRANGE
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString() // 1 day from now
    const postData = createMockPostData({
      description: 'Test post with expiration',
      reward: 1000,
      funding_r_hash: 'test-hash',
      funding_payment_request: 'lnbc10n1test',
      expires_at: expiresAt,
    })

    let capturedPostInsert: any = null
    const postQueryBuilder = {
      insert: vi.fn((data) => {
        capturedPostInsert = data
        return postQueryBuilder
      }),
      select: vi.fn(() => postQueryBuilder),
      single: vi.fn().mockResolvedValue({
        data: { id: TEST_POST_ID },
        error: null
      })
    }

    const activityQueryBuilder = {
      insert: vi.fn(() => activityQueryBuilder),
    }

    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        return {}
      }),
    }

    vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    // ACT
    const result = await createFundedAnonymousPostAction(postData)

    // ASSERT
    expect(result.success).toBe(true)
    expect(capturedPostInsert).toBeDefined()
    expect(capturedPostInsert.expires_at).toBe(expiresAt)
  })

  it('should set expires_at to null when not provided', async () => {
    // ARRANGE
    const postData = createMockPostData({
      description: 'Test post without expiration',
      reward: 1000,
      funding_r_hash: 'test-hash',
      funding_payment_request: 'lnbc10n1test',
      // expires_at not provided
    })

    let capturedPostInsert: any = null
    const postQueryBuilder = {
      insert: vi.fn((data) => {
        capturedPostInsert = data
        return postQueryBuilder
      }),
      select: vi.fn(() => postQueryBuilder),
      single: vi.fn().mockResolvedValue({
        data: { id: TEST_POST_ID },
        error: null
      })
    }

    const activityQueryBuilder = {
      insert: vi.fn(() => activityQueryBuilder),
    }

    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'posts') return postQueryBuilder
        if (table === 'activities') return activityQueryBuilder
        return {}
      }),
    }

    vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

    // ACT
    const result = await createFundedAnonymousPostAction(postData)

    // ASSERT
    expect(result.success).toBe(true)
    expect(capturedPostInsert).toBeDefined()
    expect(capturedPostInsert.expires_at).toBeNull()
  })
})

describe('updatePostExpirationAction', () => {
  const TEST_USER_ID = 'test-user-123'
  const TEST_POST_ID = 'test-post-456'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Success Path', () => {
    it('should update expires_at and reset expiry_warning_sent_at', async () => {
      // ARRANGE
      const expiresAt = new Date(Date.now() + 3 * 24 * 3600_000).toISOString() // 3 days from now

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      let capturedUpdate: any = null
      const mockAdminClient: any = {
        from: vi.fn(() => ({
          update: vi.fn((data) => {
            capturedUpdate = data
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          }),
        })),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, expiresAt)

      // ASSERT
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(capturedUpdate).toEqual({
        expires_at: expiresAt,
        expiry_warning_sent_at: null,
      })
    })

    it('should clear expires_at when null is provided', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      let capturedUpdate: any = null
      const mockAdminClient: any = {
        from: vi.fn(() => ({
          update: vi.fn((data) => {
            capturedUpdate = data
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          }),
        })),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(true)
      expect(capturedUpdate).toEqual({
        expires_at: null,
        expiry_warning_sent_at: null,
      })
    })

    it('should allow connected account to update expiration', async () => {
      // ARRANGE
      const CONNECTED_USER_ID = 'connected-user-789'
      const expiresAt = new Date(Date.now() + 2 * 3600_000).toISOString() // 2 hours from now

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'parent@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'connection-123' }, // Connection exists
                      error: null
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: CONNECTED_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      const mockAdminClient: any = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, CONNECTED_USER_ID, expiresAt)

      // ASSERT
      expect(result.success).toBe(true)
    })
  })

  describe('Authorization Failures', () => {
    it('should reject unauthenticated requests', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: { message: 'Not authenticated' },
          }),
        },
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should reject if user is not post owner or connected account', async () => {
      // ARRANGE
      const OTHER_USER_ID = 'other-user-999'

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, OTHER_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })

    it('should reject if post not found', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: null,
                    error: { message: 'Post not found' },
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Post not found')
    })

    it('should reject if post belongs to different user', async () => {
      // ARRANGE
      const OTHER_USER_ID = 'other-user-999'

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: OTHER_USER_ID, // Different owner
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Only the original poster can update post expiration')
    })
  })

  describe('Post State Rejections', () => {
    it('should reject if post is fixed', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: true, // Fixed
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot update expiration for a post that has been marked as fixed')
    })

    it('should reject if post is under review', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: true, // Under review
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot update expiration for a post that is under review')
    })

    it('should reject if post is deleted', async () => {
      // ARRANGE
      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: '2024-01-01T00:00:00.000Z', // Deleted
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, null)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot update expiration for a deleted post')
    })
  })

  describe('Date Validation', () => {
    it('should reject expiration date in the past', async () => {
      // ARRANGE
      const pastDate = new Date(Date.now() - 3600_000).toISOString() // 1 hour ago

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, pastDate)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Expiration date must be at least 1 hour in the future')
    })

    it('should reject expiration date less than 1 hour in the future', async () => {
      // ARRANGE
      const tooSoon = new Date(Date.now() + 30 * 60_000).toISOString() // 30 minutes from now

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, tooSoon)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Expiration date must be at least 1 hour in the future')
    })

    it('should reject expiration date more than 1 year in the future', async () => {
      // ARRANGE
      const tooFar = new Date(Date.now() + 366 * 24 * 3600_000).toISOString() // 366 days from now

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, tooFar)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Expiration date cannot be more than 1 year in the future')
    })

    it('should reject invalid date format', async () => {
      // ARRANGE
      const invalidDate = 'not-a-date'

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockUserClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, invalidDate)

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid expiration date format')
    })

    it('should accept valid date exactly 1 hour in the future', async () => {
      // ARRANGE
      const validDate = new Date(Date.now() + 3600_000 + 1000).toISOString() // 1 hour + 1 second

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      const mockAdminClient: any = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, validDate)

      // ASSERT
      expect(result.success).toBe(true)
    })

    it('should accept valid date exactly 1 year in the future', async () => {
      // ARRANGE
      const validDate = new Date(Date.now() + 365 * 24 * 3600_000 - 1000).toISOString() // 1 year - 1 second

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      const mockAdminClient: any = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, validDate)

      // ASSERT
      expect(result.success).toBe(true)
    })
  })

  describe('Admin Client Usage', () => {
    it('should use admin client to update expiration and reset warning flag', async () => {
      // ARRANGE
      const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()

      const mockUserClient: any = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                user: { id: TEST_USER_ID, email: 'test@example.com' },
              }
            },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'connected_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                    data: {
                      id: TEST_POST_ID,
                      user_id: TEST_USER_ID,
                      fixed: false,
                      under_review: false,
                      deleted_at: null,
                    },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return {}
        }),
      }

      const mockAdminClient: any = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      }

      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockUserClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      const result = await updatePostExpirationAction(TEST_POST_ID, TEST_USER_ID, expiresAt)

      // ASSERT
      expect(result.success).toBe(true)

      // Verify admin client was created with service role key
      expect(createServerSupabaseClient).toHaveBeenCalledTimes(2)
      expect(createServerSupabaseClient).toHaveBeenNthCalledWith(2, {
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })

      // Verify admin client was used for update
      expect(mockAdminClient.from).toHaveBeenCalledWith('posts')
    })
  })
})
