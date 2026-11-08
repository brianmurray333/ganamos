/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useParams, useRouter } from 'next/navigation'
import PostDetailPage from '@/app/post/[id]/page'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { createTestPostData, TEST_USER_IDS } from '@/tests/mocks'

/**
 * Unit Tests: PostDetailPage - AI Review metadata card
 *
 * Tests the conditional rendering of the AI-generated fix review card
 * ("AI Review", analysis text, "Confidence Score: X/10") on the post detail page.
 *
 * Visibility rule in app/post/[id]/page.tsx: the card renders only when the post
 * is NOT fixed, is under_review, has a submitted fix (image OR proof text), has
 * ai_analysis, and the viewer is the post owner (user.id / activeUserId) or a
 * group admin.
 *
 * Note: an earlier version of this file also tested a 150-character
 * "see more"/"Show less" truncation toggle (showFullAnalysis) and an
 * "AI analysis is not available" fallback message. Neither exists anywhere in
 * the app's git history (the file never ran: it imported the nonexistent
 * '@/tests/shared'), so those cases were replaced with tests of the current
 * behavior (full text is rendered; no card without ai_analysis).
 */

// Mock Next.js navigation hooks
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation')
  return {
    ...actual,
    useParams: vi.fn(),
    useRouter: vi.fn(),
    useSearchParams: vi.fn(() => new URLSearchParams()),
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

// Mock auth context: the viewer is TEST_USER_IDS.PRIMARY
vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(() => ({
    user: { id: TEST_USER_IDS.PRIMARY },
    profile: { name: 'Test User' },
    activeUserId: TEST_USER_IDS.PRIMARY,
    updateBalance: vi.fn(),
    refreshProfile: vi.fn(),
  })),
}))

// Mock toast notifications
vi.mock('@/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))

describe('PostDetailPage - AI Review metadata card', () => {
  let mockSupabaseClient: any
  let mockRouter: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockRouter = {
      push: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
    }
    vi.mocked(useRouter).mockReturnValue(mockRouter)
    vi.mocked(useParams).mockReturnValue({ id: 'test-post-123' })

    // Chainable Supabase client mock; .single() is primed per test with the post
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
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

  /** Render the page with the given post and wait until the post has actually loaded. */
  async function renderWithPost(post: Record<string, any>) {
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { ...post, id: 'test-post-123' },
      error: null,
    })
    const utils = render(<PostDetailPage params={{ id: 'test-post-123' }} />)
    // Wait until the post has loaded so negative assertions are not vacuous
    // (they would otherwise pass trivially while the page is still loading):
    // the skeleton is replaced by real content only after a successful fetch.
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    if (!post.fixed) {
      // The open-issue layout shows the title; the fixed layout does not.
      expect(screen.getAllByText(post.title).length).toBeGreaterThan(0)
    }
    return utils
  }

  const underReview = (overrides: Record<string, any> = {}) =>
    createTestPostData(TEST_USER_IDS.PRIMARY, {
      title: 'Test Issue Under Review',
      under_review: true,
      submitted_fix_image_url: 'https://example.com/fix-image.jpg',
      ai_confidence_score: 8,
      ai_analysis:
        'The submitted fix appears to adequately address the reported issue based on visual comparison.',
      ...overrides,
    })

  describe('Conditional Rendering - Visibility Logic', () => {
    it('renders the card when under_review is true AND submitted_fix_image_url exists', async () => {
      await renderWithPost(underReview())

      expect(screen.getByText('AI Review')).toBeInTheDocument()
      expect(screen.getByText(/The submitted fix appears to adequately address/)).toBeInTheDocument()
      expect(screen.getByText(/Confidence Score: 8\/10/)).toBeInTheDocument()
    })

    it('renders the card when the fix was submitted as proof text instead of an image', async () => {
      await renderWithPost({
        ...underReview({ title: 'Text Proof Fix', submitted_fix_image_url: null }),
        submitted_fix_proof_text: 'Picked up all the litter',
      })

      expect(screen.getByText('AI Review')).toBeInTheDocument()
    })

    it('does NOT render the card when under_review is false', async () => {
      await renderWithPost(underReview({ title: 'Not Under Review', under_review: false }))
      expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
    })

    it('does NOT render the card when no fix (image or proof text) was submitted', async () => {
      await renderWithPost(underReview({ title: 'No Fix Submitted', submitted_fix_image_url: null }))
      expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
    })

    it('does NOT render the card when both conditions are false', async () => {
      await renderWithPost(
        createTestPostData(TEST_USER_IDS.PRIMARY, {
          title: 'No Metadata',
          under_review: false,
          submitted_fix_image_url: null,
        })
      )
      expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
    })

    it('does NOT render the card when ai_analysis is missing', async () => {
      await renderWithPost(underReview({ title: 'No Analysis', ai_analysis: undefined }))
      expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
    })

    it('does NOT render the card once the post is fixed', async () => {
      await renderWithPost(underReview({ title: 'Already Fixed', fixed: true }))
      expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
    })
  })

  describe('Authorization - only the post owner (or group admin) sees the AI review', () => {
    it('does NOT render the card for a viewer who does not own the post', async () => {
      // Post owned by SECONDARY; the authenticated viewer is PRIMARY and the post has no group
      await renderWithPost({
        ...underReview({ title: 'Someone Elses Post' }),
        user_id: TEST_USER_IDS.SECONDARY,
      })

      expect(screen.queryByText('AI Review')).not.toBeInTheDocument()
      expect(screen.queryByText(/The submitted fix appears to adequately address/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Confidence Score/)).not.toBeInTheDocument()
    })
  })

  describe('Display Formatting - Confidence Score and Analysis', () => {
    it('displays the confidence score in "X/10" format', async () => {
      for (const score of [1, 5, 7, 10]) {
        const { unmount } = await renderWithPost(
          underReview({ title: `Score ${score}`, ai_confidence_score: score, ai_analysis: 'Test analysis' })
        )
        expect(screen.getByText(`Confidence Score: ${score}/10`)).toBeInTheDocument()
        unmount()
      }
    })

    it('renders the AI analysis text exactly', async () => {
      const analysisText =
        'The fix demonstrates proper resolution of the reported drainage issue with appropriate materials and workmanship.'
      await renderWithPost(underReview({ title: 'Specific Analysis', ai_analysis: analysisText }))
      expect(screen.getByText(analysisText)).toBeInTheDocument()
    })

    it('renders long analysis text in full (no truncation)', async () => {
      const longAnalysis =
        'This is a comprehensive AI analysis that exceeds 150 characters in length. The submitted fix demonstrates clear evidence of the issue being resolved through proper repair techniques and materials. Additional observations include proper cleanup and restoration of the affected area.'
      await renderWithPost(underReview({ title: 'Long Analysis', ai_analysis: longAnalysis }))
      expect(screen.getByText(longAnalysis)).toBeInTheDocument()
    })

    it('applies the blue card styling', async () => {
      await renderWithPost(underReview({ title: 'Styling' }))
      const card = screen.getByText('AI Review').closest('.bg-blue-50')
      expect(card).toBeInTheDocument()
      expect(card).toHaveClass('bg-blue-50')
    })
  })

  describe('Edge Cases', () => {
    it('omits the confidence score line when ai_confidence_score is missing', async () => {
      await renderWithPost(
        underReview({
          title: 'No Score',
          ai_confidence_score: undefined,
          ai_analysis: 'Analysis without confidence score',
        })
      )
      expect(screen.getByText('AI Review')).toBeInTheDocument()
      expect(screen.getByText('Analysis without confidence score')).toBeInTheDocument()
      expect(screen.queryByText(/Confidence Score/)).not.toBeInTheDocument()
    })

    it('renders special characters and emoji in the analysis', async () => {
      const specialCharsAnalysis =
        'Fix verified! ✅ Issue resolved with 100% accuracy. The repair includes: \n• New materials\n• Proper cleanup\n• Quality assurance 🎯'
      await renderWithPost(
        underReview({ title: 'Special Chars', ai_confidence_score: 10, ai_analysis: specialCharsAnalysis })
      )
      expect(screen.getByText(/Fix verified! ✅/)).toBeInTheDocument()
      expect(screen.getByText(/Quality assurance 🎯/)).toBeInTheDocument()
    })

    it('keeps the card visible across a re-render', async () => {
      const { rerender } = await renderWithPost(
        underReview({ title: 'Initial Title', ai_confidence_score: 7, ai_analysis: 'Initial analysis text' })
      )
      expect(screen.getByText('AI Review')).toBeInTheDocument()

      rerender(<PostDetailPage params={{ id: 'test-post-123' }} />)

      await waitFor(() => {
        expect(screen.getByText('AI Review')).toBeInTheDocument()
        expect(screen.getByText('Initial analysis text')).toBeInTheDocument()
      })
    })
  })
})
