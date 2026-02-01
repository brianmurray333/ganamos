// Mock dependencies BEFORE imports (required for proper mocking)
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn()
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore))
}))

// Mock email functions
vi.mock('@/lib/transaction-emails', () => ({
  sendFixSubmittedForReviewEmail: vi.fn().mockResolvedValue(undefined),
  sendIssueFixedEmail: vi.fn().mockResolvedValue(undefined)
}))

// Supabase is auto-mocked by tests/setup.ts

// Import after mocks
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { submitAnonymousFixForReviewAction } from '@/app/actions/post-actions'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendFixSubmittedForReviewEmail } from '@/lib/transaction-emails'

// Type definitions for better type safety
interface MockClientOptions {
  postData?: any
  postError?: any
  updateError?: any
  ownerProfileData?: any
  ownerProfileError?: any
  rpcResult?: any
  rpcError?: any
}

/**
 * Creates a complete mock Supabase client with chainable methods
 * Handles both regular and admin client scenarios
 */
function createCompleteMockClient(options: MockClientOptions = {}) {
  const {
    postData = null,
    postError = null,
    updateError = null,
    ownerProfileData = null,
    ownerProfileError = null,
    rpcResult = { success: true, job_id: 'test-post-123', submitted_at: new Date().toISOString() },
    rpcError = null
  } = options

  // Create mock for the update chain
  const updateChain = {
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: updateError || null
    })
  }

  // Create mock for posts table that handles both update and select
  const postsChain = {
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: postData,
      error: postError
    })
  }

  const profilesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: ownerProfileData,
      error: ownerProfileError
    })
  }

  // Create mock for activities table (insert chain)
  const activitiesChain = {
    insert: vi.fn().mockResolvedValue({ data: null, error: null })
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'posts') {
        return postsChain
      }
      
      if (table === 'profiles') {
        return profilesChain
      }

      if (table === 'activities') {
        return activitiesChain
      }
      
      return {
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      }
    }),
    // Mock the rpc call for atomic_claim_job
    rpc: vi.fn().mockResolvedValue({
      data: rpcResult,
      error: rpcError
    })
  } as any
}

/**
 * Creates a mock post with default values for testing
 */
function createTestPost(overrides = {}) {
  return {
    id: 'test-post-123',
    title: 'Fix pothole on Main St',
    description: 'Large pothole needs repair',
    reward: 5000,
    user_id: 'owner-user-123',
    image_url: 'https://example.com/before.jpg',
    fixed: false,
    fixed_at: null,
    fixed_by: null,
    fixed_by_is_anonymous: false,
    under_review: false,
    submitted_fix_by_id: null,
    submitted_fix_by_name: null,
    submitted_fix_by_avatar: null,
    submitted_fix_at: null,
    submitted_fix_image_url: null,
    submitted_fix_note: null,
    ai_confidence_score: null,
    ai_analysis: null,
    ...overrides
  }
}

/**
 * Creates a mock owner profile
 */
function createTestOwnerProfile(overrides = {}) {
  return {
    id: 'owner-user-123',
    email: 'owner@example.com',
    name: 'Post Owner',
    ...overrides
  }
}

describe('submitAnonymousFixForReviewAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Priority 1: Core Functionality - Success Scenarios', () => {
    it('successfully submits anonymous fix for review with all valid fields', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const testOwner = createTestOwnerProfile()
      
      // Mock regular client (first call)
      const mockRegularClient = createCompleteMockClient({
        postData: testPost,
        postError: null
      })
      
      // Mock admin client (second call for email)
      const mockAdminClient = createCompleteMockClient({
        ownerProfileData: testOwner,
        ownerProfileError: null
      })
      
      // First call returns regular client, second returns admin client
      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockRegularClient)
        .mockReturnValueOnce(mockAdminClient)

      const postId = 'test-post-123'
      const fixImageUrl = 'https://example.com/fix-image.jpg'
      const fixerNote = 'Fixed the pothole with asphalt'
      const aiConfidence = 6.5
      const aiAnalysis = 'Medium confidence - review needed'

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        postId,
        fixImageUrl,
        fixerNote,
        aiConfidence,
        aiAnalysis
      )

      // ASSERT
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      
      // Verify atomic claim was called with correct parameters
      expect(mockRegularClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_job_id: postId,
          p_fixer_id: null,
          p_fixer_name: 'Anonymous Fixer (Pending Review)',
          p_fixer_avatar: null,
          p_fix_note: fixerNote,
          p_fix_image_url: fixImageUrl,
          p_lightning_address: null,
          p_ai_confidence: aiConfidence,
          p_ai_analysis: aiAnalysis
        })
      )
      
      // Verify post data was fetched for email notifications
      expect(mockRegularClient.from).toHaveBeenCalledWith('posts')
      
      // Verify email was sent
      expect(sendFixSubmittedForReviewEmail).toHaveBeenCalledWith({
        toEmail: testOwner.email,
        userName: testOwner.name,
        issueTitle: testPost.title,
        fixerName: 'Anonymous Fixer',
        date: expect.any(Date),
        postId: postId,
        aiAnalysis: aiAnalysis,
        beforeImageUrl: testPost.image_url || undefined,
        afterImageUrl: fixImageUrl
      })
    })

    it('calls atomic_claim_job RPC for atomic claiming', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT - verify atomic RPC was called (timestamp is set by the database function)
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_job_id: 'test-post-123',
          p_fixer_id: null,
          p_fixer_name: 'Anonymous Fixer (Pending Review)',
          p_fix_image_url: 'https://example.com/fix.jpg',
          p_fix_note: 'Fixed',
          p_ai_confidence: 6.0,
          p_ai_analysis: 'Analysis'
        })
      )
    })

    it('successfully handles null optional fields (fixerNote, aiConfidence, aiAnalysis)', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        null,
        null as any,
        null
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fix_image_url: 'https://example.com/fix.jpg',
          p_fix_note: null,
          p_ai_confidence: null,
          p_ai_analysis: null
        })
      )
    })
  })

  describe('Priority 2: Input Validation', () => {
    it('returns error when postId is missing', async () => {
      // ARRANGE & ACT
      const result = await submitAnonymousFixForReviewAction(
        '',
        'https://example.com/fix.jpg',
        'Fixed it',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Post ID')
    })

    it('returns error when fixImageUrl is missing', async () => {
      // ARRANGE & ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        '',
        'Fixed it',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Image URL')
    })

    it('handles null postId parameter', async () => {
      // ARRANGE & ACT
      const result = await submitAnonymousFixForReviewAction(
        null as any,
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('handles undefined parameters', async () => {
      // ARRANGE & ACT
      const result = await submitAnonymousFixForReviewAction(
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

  describe('Priority 3: Database Operations', () => {
    it('handles post not found error from atomic claim', async () => {
      // ARRANGE - atomic claim returns "Job not found" error
      const mockClient = createCompleteMockClient({
        postData: null,
        rpcResult: { success: false, error: 'Job not found' }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'non-existent-post',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toBe('Post not found.')
    })

    it('handles database RPC errors gracefully', async () => {
      // ARRANGE - RPC call itself fails
      // Note: Must provide valid postData so security check passes, then RPC error is tested
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost,
        rpcError: {
          message: 'Database connection failed',
          code: 'CONNECTION_ERROR'
        }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toBe('Database connection failed')
    })

    it('handles unexpected database errors', async () => {
      // ARRANGE
      // Note: Must provide valid postData so security check passes, then RPC error is tested
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost,
        postError: null
      })
      
      // Make rpc throw an unexpected error
      mockClient.rpc.mockRejectedValueOnce(new Error('Unexpected database error'))
      
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Unexpected database error')
    })

    it('handles job already claimed error (race condition)', async () => {
      // ARRANGE - atomic claim returns "already claimed" error
      // Note: Must provide valid postData so security check passes, then RPC error is tested
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost,
        rpcResult: { success: false, error: 'Job is no longer available', reason: 'already_claimed' }
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toBe('This job has already been claimed by someone else.')
    })
  })

  describe('Priority 4: Email Notifications', () => {
    it('sends email notification to post owner', async () => {
      // ARRANGE
      const testPost = createTestPost({
        user_id: 'owner-user-123',
        title: 'Fix pothole on Main St',
        reward: 5000
      })
      const testOwner = createTestOwnerProfile({
        email: 'owner@example.com',
        name: 'Post Owner'
      })
      
      const mockRegularClient = createCompleteMockClient({
        postData: testPost
      })
      
      const mockAdminClient = createCompleteMockClient({
        ownerProfileData: testOwner
      })
      
      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockRegularClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed the pothole',
        6.5,
        'Medium confidence'
      )

      // ASSERT
      expect(sendFixSubmittedForReviewEmail).toHaveBeenCalledWith({
        toEmail: 'owner@example.com',
        userName: 'Post Owner',
        issueTitle: 'Fix pothole on Main St',
        fixerName: 'Anonymous Fixer',
        date: expect.any(Date),
        postId: 'test-post-123',
        aiAnalysis: 'Medium confidence',
        beforeImageUrl: testPost.image_url || undefined,
        afterImageUrl: 'https://example.com/fix.jpg'
      })
    })

    it('rejects low-confidence fixes for anonymous posts (no owner to review)', async () => {
      // ARRANGE
      const testPost = createTestPost({
        user_id: null  // Anonymous post - no owner to review
      })
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT - Low confidence (< 7) should be rejected for anonymous posts
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,  // Low confidence
        'Analysis'
      )

      // ASSERT - Should fail because anonymous posts require high AI confidence
      expect(result.success).toBe(false)
      expect(result.error).toContain('higher AI confidence')
      expect(sendFixSubmittedForReviewEmail).not.toHaveBeenCalled()
    })

    it('allows high-confidence fixes for anonymous posts', async () => {
      // ARRANGE
      const testPost = createTestPost({
        user_id: null  // Anonymous post
      })
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT - High confidence (>= 7) should be allowed for anonymous posts
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        7.0,  // High confidence
        'Analysis'
      )

      // ASSERT - Should succeed (though in real usage, high-confidence fixes auto-approve via different action)
      expect(result.success).toBe(true)
      // No email sent because there's no owner
      expect(sendFixSubmittedForReviewEmail).not.toHaveBeenCalled()
    })

    it('does not send email to ganamos.app internal emails', async () => {
      // ARRANGE
      const testPost = createTestPost({
        user_id: 'owner-user-123'
      })
      const testOwner = createTestOwnerProfile({
        email: 'internal@ganamos.app'  // Internal email
      })
      
      const mockRegularClient = createCompleteMockClient({
        postData: testPost
      })
      
      const mockAdminClient = createCompleteMockClient({
        ownerProfileData: testOwner
      })
      
      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockRegularClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(sendFixSubmittedForReviewEmail).not.toHaveBeenCalled()
    })

    it('continues execution when email sending fails (silent failure)', async () => {
      // ARRANGE
      const testPost = createTestPost({
        user_id: 'owner-user-123'
      })
      const testOwner = createTestOwnerProfile()
      
      const mockRegularClient = createCompleteMockClient({
        postData: testPost
      })
      
      const mockAdminClient = createCompleteMockClient({
        ownerProfileData: testOwner
      })
      
      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockRegularClient)
        .mockReturnValueOnce(mockAdminClient)
      
      // Make email sending fail
      vi.mocked(sendFixSubmittedForReviewEmail).mockRejectedValueOnce(
        new Error('Email service unavailable')
      )

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      // Main operation should succeed even if email fails
      expect(result.success).toBe(true)
    })
  })

  describe('Priority 5: Edge Cases', () => {
    it('handles very long fixerNote strings', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const longNote = 'A'.repeat(10000) // 10,000 characters

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        longNote,
        6.0,
        'Analysis'
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fix_note: longNote
        })
      )
    })

    it('handles extreme AI confidence values (0, 10, negative)', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })

      // Test with 0
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)
      let result = await submitAnonymousFixForReviewAction(
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
      result = await submitAnonymousFixForReviewAction(
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
      result = await submitAnonymousFixForReviewAction(
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
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        specialUrl,
        specialNote,
        6.0,
        specialAnalysis
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fix_image_url: specialUrl,
          p_fix_note: specialNote,
          p_ai_analysis: specialAnalysis
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
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        unicodeNote,
        6.5,
        unicodeAnalysis
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fix_note: unicodeNote,
          p_ai_analysis: unicodeAnalysis
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
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        '',
        0,
        ''
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fix_note: '',
          p_ai_confidence: 0,
          p_ai_analysis: ''
        })
      )
    })

    it('handles whitespace-only strings in optional fields', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      const result = await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        '   ',
        6.0,
        '\n\t  '
      )

      // ASSERT
      expect(result.success).toBe(true)
      
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fix_note: '   ',
          p_ai_analysis: '\n\t  '
        })
      )
    })
  })

  describe('Priority 6: Data Integrity', () => {
    it('ensures all required post fields are set correctly via atomic claim', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.5,
        'Analysis'
      )

      // ASSERT - atomic claim sets all these fields in the database function
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_job_id: 'test-post-123',
          p_fixer_id: null,
          p_fixer_name: 'Anonymous Fixer (Pending Review)',
          p_fixer_avatar: null,
          p_fix_image_url: 'https://example.com/fix.jpg',
          p_fix_note: 'Fixed',
          p_ai_confidence: 6.5,
          p_ai_analysis: 'Analysis'
        })
      )
    })

    it('atomic claim function handles fixed status in database', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT - The atomic_claim_job function in the database sets:
      // - under_review = true
      // - fixed = false
      // - fixed_by_is_anonymous = false
      // We verify the RPC was called correctly
      expect(mockClient.rpc).toHaveBeenCalledWith('atomic_claim_job', expect.any(Object))
    })

    it('uses admin client with service role key for owner profile lookup', async () => {
      // ARRANGE
      const testPost = createTestPost({
        user_id: 'owner-user-123'
      })
      const testOwner = createTestOwnerProfile()
      
      const mockRegularClient = createCompleteMockClient({
        postData: testPost
      })
      
      const mockAdminClient = createCompleteMockClient({
        ownerProfileData: testOwner
      })
      
      // Clear any previous mocks
      vi.clearAllMocks()
      
      vi.mocked(createServerSupabaseClient)
        .mockReturnValueOnce(mockRegularClient)
        .mockReturnValueOnce(mockAdminClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT
      // Verify createServerSupabaseClient was called twice
      expect(createServerSupabaseClient).toHaveBeenCalledTimes(2)
      
      // First call is with cookie store (regular client)
      expect(createServerSupabaseClient).toHaveBeenNthCalledWith(1, expect.any(Object))
      
      // Second call should be with service role key for admin operations
      expect(createServerSupabaseClient).toHaveBeenNthCalledWith(2, {
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY
      })
    })
  })

  describe('Priority 7: Business Logic', () => {
    it('correctly identifies submission as anonymous with null p_fixer_id', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        6.0,
        'Analysis'
      )

      // ASSERT - verify anonymous indicators via RPC call
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_fixer_id: null,
          p_fixer_name: 'Anonymous Fixer (Pending Review)',
          p_fixer_avatar: null
        })
      )
    })

    it('preserves AI analysis data for manual review decision', async () => {
      // ARRANGE
      const testPost = createTestPost()
      const mockClient = createCompleteMockClient({
        postData: testPost
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockClient)

      const aiConfidence = 6.2
      const aiAnalysis = 'Low confidence - manual review recommended'

      // ACT
      await submitAnonymousFixForReviewAction(
        'test-post-123',
        'https://example.com/fix.jpg',
        'Fixed',
        aiConfidence,
        aiAnalysis
      )

      // ASSERT
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'atomic_claim_job',
        expect.objectContaining({
          p_ai_confidence: aiConfidence,
          p_ai_analysis: aiAnalysis
        })
      )
    })
  })
})
