/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useParams, useRouter } from 'next/navigation'
import PostDetailPage from '@/app/post/[id]/page'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { createTestPostData, TEST_USER_IDS } from '@/tests/shared'

/**
 * Unit Tests: PostDetailPage - Report Metadata Visibility Handler
 * 
 * Tests the conditional rendering and interactive display of AI-generated
 * report metadata, including confidence scores and analysis text with
 * expand/collapse functionality.
 * 
 * Key Functionality Tested:
 * - Conditional rendering based on under_review and submitted_fix_image_url flags
 * - Text expansion/collapse toggle via showFullAnalysis state
 * - Text truncation at 150 characters with "see more"/"Show less" buttons
 * - Confidence score display formatting (X/10)
 * - AI analysis text rendering
 */

// Mock Next.js navigation hooks
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation')
  return {
    ...actual,
    useParams: vi.fn(),
    useRouter: vi.fn(),
    usePathname: vi.fn(() => '/post/test-id'),
  }
})

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} alt={alt} {...props} />
  },
}))

// Mock dynamic components
vi.mock('next/dynamic', () => ({
  default: (fn: any) => {
    return fn
  },
}))

// Mock external modules and components
vi.mock('@/components/camera-capture', () => ({
  CameraCapture: () => <div>CameraCapture</div>,
}))

vi.mock('@/components/bitcoin-logo', () => ({
  BitcoinLogo: () => <div>BitcoinLogo</div>,
}))

vi.mock('@/components/post-detail-skeleton', () => ({
  default: () => <div>Loading...</div>,
}))

vi.mock('@/components/static-map-widget', () => ({
  StaticMapWidget: () => <div>StaticMapWidget</div>,
}))

vi.mock('@/components/lightning-invoice-modal', () => ({
  LightningInvoiceModal: () => <div>LightningInvoiceModal</div>,
}))

// Mock utility modules
vi.mock('@/lib/mock-location', () => ({
  getCurrentLocation: vi.fn(() => ({ lat: 0, lng: 0 })),
}))

vi.mock('@/lib/geocoding', () => ({
  reverseGeocode: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  uploadImage: vi.fn(),
  generateImagePath: vi.fn(),
  isBase64Image: vi.fn(),
}))

vi.mock('@/lib/transaction-emails', () => ({
  sendIssueFixedEmail: vi.fn(),
}))

vi.mock('@/app/actions/post-actions', () => ({
  markPostFixedAnonymouslyAction: vi.fn(),
  submitAnonymousFixForReviewAction: vi.fn(),
}))

// @/lib/supabase mock provided by tests/setup.ts

// Mock auth context
vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(() => ({
    user: { id: TEST_USER_IDS.PRIMARY },
    profile: { name: 'Test User' },
    activeUserId: TEST_USER_IDS.PRIMARY,
    updateBalance: vi.fn(),
    refreshProfile: vi.fn(),
  })),
}))

// Mock toast notifications (Sonner)
vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

describe('PostDetailPage - Metadata Visibility Handler', () => {
  let mockSupabaseClient: any
  let mockRouter: any

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Setup router mock
    mockRouter = {
      push: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn(),
    }
    vi.mocked(useRouter).mockReturnValue(mockRouter)

    // Setup default params mock
    vi.mocked(useParams).mockReturnValue({ id: 'test-post-123' })

    // Setup Supabase client mock with chainable methods
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: TEST_USER_IDS.PRIMARY } },
          error: null,
        }),
      },
    }
    vi.mocked(createBrowserSupabaseClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Conditional Rendering - Visibility Logic', () => {
    it('should render metadata card when under_review is true AND submitted_fix_image_url exists', async () => {
      // Arrange: Create post with metadata visible conditions met
      const postWithMetadata = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue with Metadata',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 8,
        ai_analysis: 'The submitted fix appears to adequately address the reported issue based on visual comparison.',
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithMetadata, id: 'test-post-123' },
        error: null,
      })

      // Act: Render component
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Metadata card should be visible
      await waitFor(() => {
        expect(screen.getByText('AI Review')).toBeInTheDocument()
        expect(screen.getByText(/The submitted fix appears to adequately address/)).toBeInTheDocument()
        expect(screen.getByText(/Confidence Score: 8\/10/)).toBeInTheDocument()
      })
    })

    it('should NOT render metadata card when under_review is false', async () => {
      // Arrange: Post not under review
      const postNotUnderReview = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Not Under Review',
        under_review: false,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 8,
        ai_analysis: 'Some analysis text',
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postNotUnderReview, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Metadata card should NOT be visible
      await waitFor(() => {
        expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
      })
    })

    it('should NOT render metadata card when submitted_fix_image_url is null', async () => {
      // Arrange: Under review but no fix image submitted
      const postWithoutFixImage = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Without Fix Image',
        under_review: true,
        submitted_fix_image_url: null,
        ai_confidence_score: 8,
        ai_analysis: 'Some analysis text',
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithoutFixImage, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Metadata card should NOT be visible
      await waitFor(() => {
        expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
      })
    })

    it('should NOT render metadata card when both conditions are false', async () => {
      // Arrange: Neither under review nor has fix image
      const postWithoutMetadata = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Without Metadata',
        under_review: false,
        submitted_fix_image_url: null,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithoutMetadata, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Metadata card should NOT be visible
      await waitFor(() => {
        expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
      })
    })
  })

  describe('Text Expansion Toggle - showFullAnalysis State', () => {
    it('should initially display truncated text (first 150 chars) with "see more" button when analysis exceeds 150 chars', async () => {
      // Arrange: Long analysis text (200+ characters)
      const longAnalysis = 'This is a comprehensive AI analysis that exceeds 150 characters in length. The submitted fix demonstrates clear evidence of the issue being resolved through proper repair techniques and materials. Additional observations include proper cleanup and restoration of the affected area.'

      const postWithLongAnalysis = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue with Long Analysis',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 9,
        ai_analysis: longAnalysis,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithLongAnalysis, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Should show truncated text and "see more" button
      await waitFor(() => {
        const displayedText = screen.getByText(/This is a comprehensive AI analysis/)
        expect(displayedText).toBeInTheDocument()
        // Verify text is truncated (not showing the full analysis)
        expect(displayedText.textContent).not.toContain('Additional observations include proper cleanup')
        expect(screen.getByText(/see more/i)).toBeInTheDocument()
      })
    })

    it('should expand to full text and show "Show less" button after clicking "see more"', async () => {
      // Arrange: Long analysis text
      const longAnalysis = 'This is a comprehensive AI analysis that exceeds 150 characters in length. The submitted fix demonstrates clear evidence of the issue being resolved through proper repair techniques and materials. Additional observations include proper cleanup and restoration of the affected area.'

      const postWithLongAnalysis = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue for Expansion',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 9,
        ai_analysis: longAnalysis,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithLongAnalysis, id: 'test-post-123' },
        error: null,
      })

      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Wait for initial truncated state
      await waitFor(() => {
        expect(screen.getByText(/see more/i)).toBeInTheDocument()
      })

      // Act: Click "see more" button
      const seeMoreButton = screen.getByText(/see more/i)
      fireEvent.click(seeMoreButton)

      // Assert: Full text should be visible with "Show less" button
      await waitFor(() => {
        expect(screen.getByText(longAnalysis)).toBeInTheDocument()
        expect(screen.getByText(/Show less/i)).toBeInTheDocument()
        expect(screen.queryByText(/see more/i)).not.toBeInTheDocument()
      })
    })

    it('should collapse back to truncated text after clicking "Show less"', async () => {
      // Arrange: Long analysis text
      const longAnalysis = 'This is a comprehensive AI analysis that exceeds 150 characters in length. The submitted fix demonstrates clear evidence of the issue being resolved through proper repair techniques and materials. Additional observations include proper cleanup and restoration of the affected area.'

      const postWithLongAnalysis = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue for Collapse',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 9,
        ai_analysis: longAnalysis,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithLongAnalysis, id: 'test-post-123' },
        error: null,
      })

      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      await waitFor(() => {
        expect(screen.getByText(/see more/i)).toBeInTheDocument()
      })

      // Expand first
      const seeMoreButton = screen.getByText(/see more/i)
      fireEvent.click(seeMoreButton)

      await waitFor(() => {
        expect(screen.getByText(/Show less/i)).toBeInTheDocument()
      })

      // Act: Click "Show less" button
      const showLessButton = screen.getByText(/Show less/i)
      fireEvent.click(showLessButton)

      // Assert: Should return to truncated state
      await waitFor(() => {
        expect(screen.getByText(/see more/i)).toBeInTheDocument()
        expect(screen.queryByText(/Show less/i)).not.toBeInTheDocument()
      })
    })

    it('should display full text without toggle buttons when analysis is 150 chars or less', async () => {
      // Arrange: Short analysis text (under 150 chars)
      const shortAnalysis = 'This is a short AI analysis that does not exceed the 150 character limit for truncation.'

      const postWithShortAnalysis = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue with Short Analysis',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 7,
        ai_analysis: shortAnalysis,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithShortAnalysis, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Full text visible, no toggle buttons
      await waitFor(() => {
        expect(screen.getByText(shortAnalysis)).toBeInTheDocument()
        expect(screen.queryByText(/see more/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Show less/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Display Formatting - Confidence Score and Analysis', () => {
    it('should display confidence score in "X/10" format', async () => {
      // Arrange: Test various confidence scores
      const testScores = [1, 5, 7, 10]

      for (const score of testScores) {
        vi.clearAllMocks()

        const postWithScore = createTestPostData(TEST_USER_IDS.PRIMARY, {
          title: `Test Issue Score ${score}`,
          under_review: true,
          submitted_fix_image_url: 'https://example.com/fix-image.jpg',
          ai_confidence_score: score,
          ai_analysis: 'Test analysis',
        })

        mockSupabaseClient.single.mockResolvedValueOnce({
          data: { ...postWithScore, id: 'test-post-123' },
          error: null,
        })

        // Act
        const { unmount } = render(<PostDetailPage params={{ id: 'test-post-123' }} />)

        // Assert: Score displayed as "X/10"
        await waitFor(() => {
          expect(screen.getByText(`Confidence Score: ${score}/10`)).toBeInTheDocument()
        })

        unmount()
      }
    })

    it('should render AI analysis text correctly', async () => {
      // Arrange: Post with specific analysis text
      const analysisText = 'The fix demonstrates proper resolution of the reported drainage issue with appropriate materials and workmanship.'

      const postWithAnalysis = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue with Specific Analysis',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 8,
        ai_analysis: analysisText,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithAnalysis, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Analysis text rendered correctly
      await waitFor(() => {
        expect(screen.getByText(analysisText)).toBeInTheDocument()
      })
    })

    it('should display fallback message when ai_analysis is missing', async () => {
      // Arrange: Post with no AI analysis
      const postWithoutAnalysis = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Without Analysis',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 6,
        ai_analysis: undefined,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithoutAnalysis, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Fallback message displayed
      await waitFor(() => {
        expect(screen.getByText('The AI analysis is not available for this submission.')).toBeInTheDocument()
      })
    })

    it('should apply correct styling classes to metadata card', async () => {
      // Arrange: Post with metadata
      const postWithMetadata = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue for Styling',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 8,
        ai_analysis: 'Test analysis for styling verification',
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithMetadata, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Verify blue background styling classes on the parent container
      await waitFor(() => {
        const aiReviewText = screen.getByText('AI Review')
        // The styling is on the grandparent div (parent of parent)
        const aiReviewCard = aiReviewText.closest('.bg-blue-50')
        expect(aiReviewCard).toBeInTheDocument()
        expect(aiReviewCard).toHaveClass('bg-blue-50')
      })
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing confidence score gracefully', async () => {
      // Arrange: Post with analysis but no confidence score
      const postWithoutScore = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Without Score',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: undefined,
        ai_analysis: 'Analysis without confidence score',
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithoutScore, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Analysis visible, confidence score section not rendered or shows fallback
      await waitFor(() => {
        expect(screen.getByText('AI Review')).toBeInTheDocument()
        expect(screen.getByText('Analysis without confidence score')).toBeInTheDocument()
        // Confidence score section should not cause errors
      })
    })

    it('should handle exactly 150 character analysis text boundary', async () => {
      // Arrange: Analysis text exactly 150 characters
      const exactlyOneFiftyChars = 'A'.repeat(150)

      const postWithBoundaryText = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Boundary Case',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 7,
        ai_analysis: exactlyOneFiftyChars,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithBoundaryText, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Should display without truncation or with minimal UI
      await waitFor(() => {
        const displayedText = screen.getByText(exactlyOneFiftyChars)
        expect(displayedText).toBeInTheDocument()
        // At boundary, behavior depends on implementation (> 150 vs >= 150)
        // Test should verify no crash occurs
      })
    })

    it('should handle special characters in analysis text', async () => {
      // Arrange: Analysis with special characters, emojis, and unicode
      const specialCharsAnalysis = 'Fix verified! ✅ Issue resolved with 100% accuracy. The repair includes: \n• New materials\n• Proper cleanup\n• Quality assurance 🎯'

      const postWithSpecialChars = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Issue Special Chars',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 10,
        ai_analysis: specialCharsAnalysis,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postWithSpecialChars, id: 'test-post-123' },
        error: null,
      })

      // Act
      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Special characters render correctly
      await waitFor(() => {
        expect(screen.getByText(/Fix verified! ✅/)).toBeInTheDocument()
        expect(screen.getByText(/Quality assurance 🎯/)).toBeInTheDocument()
      })
    })
  })

  describe('User Interaction Flows', () => {
    it('should allow multiple expand/collapse cycles without state corruption', async () => {
      // Arrange: Long analysis for toggle testing
      const longAnalysis = 'This is a comprehensive AI analysis that exceeds 150 characters in length. The submitted fix demonstrates clear evidence of the issue being resolved. Testing multiple toggle cycles for state integrity.'

      const postForToggleTesting = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Test Multiple Toggles',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 8,
        ai_analysis: longAnalysis,
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...postForToggleTesting, id: 'test-post-123' },
        error: null,
      })

      render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Act & Assert: Perform multiple toggle cycles
      for (let i = 0; i < 3; i++) {
        // Expand
        await waitFor(() => expect(screen.getByText(/see more/i)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/see more/i))
        await waitFor(() => expect(screen.getByText(/Show less/i)).toBeInTheDocument())

        // Collapse
        fireEvent.click(screen.getByText(/Show less/i))
        await waitFor(() => expect(screen.getByText(/see more/i)).toBeInTheDocument())
      }

      // Final state check: should be collapsed
      expect(screen.getByText(/see more/i)).toBeInTheDocument()
      expect(screen.queryByText(/Show less/i)).not.toBeInTheDocument()
    })

    it('should maintain metadata visibility when other post data updates', async () => {
      // Arrange: Initial post with metadata
      const initialPost = createTestPostData(TEST_USER_IDS.PRIMARY, {
        title: 'Initial Title',
        under_review: true,
        submitted_fix_image_url: 'https://example.com/fix-image.jpg',
        ai_confidence_score: 7,
        ai_analysis: 'Initial analysis text',
      })

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...initialPost, id: 'test-post-123' },
        error: null,
      })

      const { rerender } = render(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Verify initial metadata visibility
      await waitFor(() => {
        expect(screen.getByText('AI Review')).toBeInTheDocument()
      })

      // Act: Simulate post update (e.g., title change)
      const updatedPost = {
        ...initialPost,
        title: 'Updated Title',
      }

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...updatedPost, id: 'test-post-123' },
        error: null,
      })

      rerender(<PostDetailPage params={{ id: 'test-post-123' }} />)

      // Assert: Metadata still visible after update
      await waitFor(() => {
        expect(screen.getByText('AI Review')).toBeInTheDocument()
        expect(screen.getByText('Initial analysis text')).toBeInTheDocument()
      })
    })
  })
})