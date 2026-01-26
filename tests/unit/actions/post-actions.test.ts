import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  v4: vi.fn(),
}))

// Mock global fetch for Nostr/Sphinx publishing
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: async () => ({}),
} as Response))

// @/lib/supabase mock provided by tests/setup.ts

import { createFundedAnonymousPostAction } from '@/app/actions/post-actions'
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
    vi.mocked(uuidv4)
      .mockReturnValueOnce(TEST_POST_ID)
      .mockReturnValueOnce(TEST_ACTIVITY_ID)
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
        .mockReturnValueOnce(postId1)
        .mockReturnValueOnce(activityId1)
        .mockReturnValueOnce(postId2)
        .mockReturnValueOnce(activityId2)

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
