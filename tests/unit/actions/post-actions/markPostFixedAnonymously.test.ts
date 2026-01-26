// Mock dependencies BEFORE imports (required for proper mocking)
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn()
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore))
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123')
}))

// Supabase is auto-mocked by tests/setup.ts

// Import after mocks
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { markPostFixedAnonymouslyAction } from '@/app/actions/post-actions'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createMockPostData } from '@/tests/unit/helpers/posts-api-mocks'

// Type definitions for better type safety
interface MockClientOptions {
  postData?: any
  postError?: any
  activityError?: any
  updateError?: any
}

interface ChainableMock {
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
}

/**
 * Creates a complete mock Supabase client with chainable methods
 * Follows the pattern from create-fix-reward-action.test.ts
 */
function createCompleteMockClient(options: MockClientOptions = {}) {
  const {
    postData = null,
    postError = null,
    activityError = null,
    updateError = null
  } = options

  // Create mock for the update chain that returns eq directly
  const updateChain = {
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: updateError || null
    })
  }

  // Create mock for posts table that handles both update and select
  const postsChain = {
    update: vi.fn().mockReturnValue(updateChain),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: postData,
      error: postError
    }),
    insert: vi.fn()
  }

  const activitiesChain = {
    insert: vi.fn().mockResolvedValue({
      data: {},
      error: activityError
    })
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'posts') {
        return postsChain
      }
      
      if (table === 'activities') {
        return activitiesChain
      }
      
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
      }
    })
  } as any
}

/**
 * Creates a mock post with default values for testing
 */
function createTestPost(overrides = {}) {
  return createMockPostData({
    id: 'test-post-123',
    title: 'Fix pothole on Main St',
    reward: 5000,
    fixed: false,
    fixed_at: null,
    fixed_by: null,
    fixed_by_is_anonymous: false,
    fixed_image_url: null,
    fixer_note: null,
    ai_confidence_score: null,
    ai_analysis: null,
    under_review: false,
    submitted_fix_by_id: null,
    submitted_fix_by_name: null,
    submitted_fix_by_avatar: null,
    submitted_fix_at: null,
    ...overrides
  })
}

describe('markPostFixedAnonymouslyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Priority 1: Core Functionality', () => {
    it('successfully marks post as fixed with all valid fields', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: { ...testPost, fixed: true }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const postId = 'test-post-123'
      const fixImageUrl = 'https://example.com/fix-image.jpg'
      const fixerNote = 'Fixed the pothole with asphalt'
      const aiConfidence = 8.5
      const aiAnalysis = 'High confidence repair detection'

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        postId,
        fixImageUrl,
        fixerNote,
        aiConfidence,
        aiAnalysis
      )

      // ASSERT
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      
      // Verify post update was called
      expect(mockClient.from).toHaveBeenCalledWith('posts')
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixed: true,
          fixed_by: null,
          fixed_by_is_anonymous: true,
          fixed_image_url: fixImageUrl,
          fixer_note: fixerNote,
          ai_confidence_score: aiConfidence,
          ai_analysis: aiAnalysis,
          under_review: false,
          submitted_fix_by_id: null,
          submitted_fix_by_name: null,
          submitted_fix_by_avatar: null,
          submitted_fix_at: null
        })
      )
      expect(postsChain.eq).toHaveBeenCalledWith('id', postId)
      
      // Verify activity log was created
      expect(mockClient.from).toHaveBeenCalledWith('activities')
    })

    it('returns error when postId is missing', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        '',
        'https://example.com/fix.jpg',
        'Fixed it',
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Post ID')
      
      // Verify no database operations were attempted
      expect(mockClient.from).not.toHaveBeenCalled()
    })

    it('returns error when fixImageUrl is missing', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        '',
        'Fixed it',
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Image URL')
      
      // Verify no database operations were attempted
      expect(mockClient.from).not.toHaveBeenCalled()
    })

    it('successfully handles null optional fields (fixerNote, aiConfidence, aiAnalysis)', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        null,
        null as any,
        null
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixed: true,
          fixed_image_url: 'https://example.com/fix.jpg',
          fixer_note: null,
          ai_confidence_score: null,
          ai_analysis: null
        })
      )
    })

    it('sets correct post fields for anonymous fix', async () => {
      // ARRANGE
      const testPost = createTestPost({
        // Simulate a post that was previously under review
        under_review: true,
        submitted_fix_by_id: 'user-123',
        submitted_fix_by_name: 'Test User',
        submitted_fix_by_avatar: 'https://example.com/avatar.jpg',
        submitted_fix_at: '2024-01-01T00:00:00Z'
      })
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        9.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixed: true,
          fixed_by: null,
          fixed_by_is_anonymous: true,
          under_review: false,
          // Verify previous submission fields are cleared
          submitted_fix_by_id: null,
          submitted_fix_by_name: null,
          submitted_fix_by_avatar: null,
          submitted_fix_at: null
        })
      )
    })
  })

  describe('Priority 2: Database Operations', () => {
    it('updates post with correct timestamp (fixed_at)', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const beforeTimestamp = new Date().toISOString()

      // ACT
      await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      const afterTimestamp = new Date().toISOString()

      // ASSERT
      const postsChain = mockClient.from('posts')
      const updateCall = postsChain.update.mock.calls[0][0]
      
      expect(updateCall.fixed_at).toBeDefined()
      expect(new Date(updateCall.fixed_at).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTimestamp).getTime()
      )
      expect(new Date(updateCall.fixed_at).getTime()).toBeLessThanOrEqual(
        new Date(afterTimestamp).getTime()
      )
    })

    it('clears previous review fields (submitted_fix_by_*)', async () => {
      // ARRANGE
      const testPost = createTestPost({
        submitted_fix_by_id: 'user-456',
        submitted_fix_by_name: 'Previous User',
        submitted_fix_by_avatar: 'https://example.com/old-avatar.jpg',
        submitted_fix_at: '2024-01-01T00:00:00Z'
      })
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          submitted_fix_by_id: null,
          submitted_fix_by_name: null,
          submitted_fix_by_avatar: null,
          submitted_fix_at: null
        })
      )
    })

    it('creates activity log with correct type and metadata', async () => {
      // ARRANGE
      const testPost = createTestPost({
        title: 'Fix pothole on Main St',
        reward: 5000
      })
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed the pothole',
        8.5,
        'High confidence'
      )

      // ASSERT
      expect(mockClient.from).toHaveBeenCalledWith('activities')
      const activitiesChain = mockClient.from('activities')
      expect(activitiesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-123',
          user_id: null,
          type: 'fix',
          related_id: 'test-post-123',
          related_table: 'posts',
          metadata: expect.objectContaining({
            title: 'Fix pothole on Main St',
            reward: 5000,
            fixed: true,
            fixImageUrl: 'https://example.com/fix.jpg',
            fixerNote: 'Fixed the pothole',
            aiConfidence: 8.5,
            aiAnalysis: 'High confidence'
          })
        })
      )
    })

    it('handles database update errors gracefully', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient({
        updateError: {
          message: 'Database connection failed',
          code: 'CONNECTION_ERROR'
        }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toBe('Database connection failed')
    })
  })

  describe('Priority 3: Edge Cases', () => {
    it('handles very long fixerNote strings', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const longNote = 'A'.repeat(10000) // 10,000 characters

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        longNote,
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixer_note: longNote
        })
      )
    })

    it('handles extreme AI confidence values (0, 10, negative)', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // Test with 0
      let result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        0,
        'Zero confidence'
      )
      expect(result.success).toBe(true)

      vi.clearAllMocks()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // Test with 10
      result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        10,
        'Perfect confidence'
      )
      expect(result.success).toBe(true)

      vi.clearAllMocks()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // Test with negative
      result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        -5,
        'Negative confidence'
      )
      expect(result.success).toBe(true)
    })

    it('handles special characters in URLs and text', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const specialUrl = 'https://example.com/fix?query=test&param=value#fragment'
      const specialNote = 'Fixed! @#$%^&*()_+-={}[]|\\:";\'<>?,./~`'
      const specialAnalysis = 'Analysis with émojis 🎉 and spëcial çharacters'

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        specialUrl,
        specialNote,
        8.0,
        specialAnalysis
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixed_image_url: specialUrl,
          fixer_note: specialNote,
          ai_analysis: specialAnalysis
        })
      )
    })

    it('handles empty string vs null distinction for optional fields', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT - Test with empty strings
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        '',
        0,
        ''
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixer_note: '',
          ai_confidence_score: 0,
          ai_analysis: ''
        })
      )
    })
  })

  describe('Priority 4: Integration Points', () => {
    it('verifies activity log includes post title and reward', async () => {
      // ARRANGE
      const testPost = createTestPost({
        title: 'Critical Infrastructure Repair',
        reward: 15000
      })
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Completed repair',
        9.2,
        'Excellent work'
      )

      // ASSERT
      const activitiesChain = mockClient.from('activities')
      expect(activitiesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            title: 'Critical Infrastructure Repair',
            reward: 15000
          })
        })
      )
    })

    it('handles case where post does not exist', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient({
        updateError: {
          message: 'Post not found',
          code: 'PGRST116'
        }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'non-existent-post',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toBe('Post not found')
    })

    it('continues execution when activity logging fails (silent failure)', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost,
        activityError: {
          message: 'Activity insert failed',
          code: 'ACTIVITY_ERROR'
        }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT
      // Main operation should succeed even if activity logging fails
      expect(result.success).toBe(true)
      
      // Verify post update was successful
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalled()
      
      // Verify activity logging was attempted
      expect(mockClient.from).toHaveBeenCalledWith('activities')
    })
  })

  describe('Additional Coverage: Data Validation', () => {
    it('handles invalid URL formats gracefully', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const invalidUrls = [
        'not-a-url',
        'ftp://example.com/file.jpg',
        'javascript:alert(1)',
        '../../../etc/passwd'
      ]

      // ACT & ASSERT - Function should accept any string as URL
      // URL validation should be done at API/UI level
      for (const url of invalidUrls) {
        vi.clearAllMocks()
        vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)
        
        const result = await markPostFixedAnonymouslyAction(
          'test-post-123',
          url,
          'Fixed',
          8.0,
          'Analysis'
        )
        
        expect(result.success).toBe(true)
      }
    })

    it('handles whitespace-only strings in optional fields', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        '   ',
        8.0,
        '\n\t  '
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixer_note: '   ',
          ai_analysis: '\n\t  '
        })
      )
    })

    it('handles unicode and multi-byte characters correctly', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const unicodeNote = '修复了坑洞 🚧 مُصلَح'
      const unicodeAnalysis = 'Análisis completo: résultats très bons ✓'

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        unicodeNote,
        8.5,
        unicodeAnalysis
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      const postsChain = mockClient.from('posts')
      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixer_note: unicodeNote,
          ai_analysis: unicodeAnalysis
        })
      )
    })
  })

  describe('Error Handling: Boundary Conditions', () => {
    it('handles Supabase client creation failure', async () => {
      // ARRANGE
      vi.mocked(createServerSupabaseClient).mockReturnValue(null as any)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT - Function catches the error and returns it
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain("Cannot read properties of null")
    })

    it('handles malformed post data in response', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient({
        postData: {
          // Missing expected fields
          id: 'test-post-123'
          // title and reward are undefined
        }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(true)
      // Activity log should handle undefined values gracefully
      const activitiesChain = mockClient.from('activities')
      expect(activitiesChain.insert).toHaveBeenCalled()
    })

    it('handles null post ID parameter', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        null as any,
        'https://example.com/fix.jpg',
        'Fixed',
        8.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('handles undefined parameters', async () => {
      // ARRANGE
      const mockClient = createCompleteMockClient()
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await markPostFixedAnonymouslyAction(
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
