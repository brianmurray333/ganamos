/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { useParams, useRouter } from 'next/navigation'
import PostDetailPage from '@/app/post/[id]/page'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { createTestPostData, TEST_USER_IDS } from '@/tests/mocks'

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
// Stable object (like the real provider): the page has effects keyed on `user`.
const mockAuth = vi.hoisted(() => ({
  user: { id: '' },
  profile: { name: 'Test User' },
  activeUserId: '',
  updateBalance: () => {},
  refreshProfile: () => {},
}))
vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(() => mockAuth),
}))

// Mock toast notifications
vi.mock('@/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))
import { toast } from '@/components/ui/toast'
import { startPendingPost, getPendingPost, __resetPendingPostStore } from '@/lib/pending-post-store'

/**
 * /post/[id] right after pressing Post on /post/new: the post is still being
 * created in the background (lib/pending-post-store). The page must show the
 * skeleton (never "Post not found"), toast success once the post is loaded,
 * or toast the error and go back to /post/new on failure.
 */

const draft = {
  description: 'Pothole',
  reward: 2000,
  image: null,
  location: null,
  selectedGroupId: null,
  assignedTo: null,
  assignedToProfile: null,
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

mockAuth.user.id = TEST_USER_IDS.PRIMARY
mockAuth.activeUserId = TEST_USER_IDS.PRIMARY

describe('PostDetailPage - pending submission', () => {
  let mockSupabaseClient: any
  let mockRouter: any

  beforeEach(() => {
    __resetPendingPostStore()
    mockRouter = { push: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }
    vi.mocked(useRouter).mockReturnValue(mockRouter)
    vi.mocked(useParams).mockReturnValue({ id: 'new-post-1' })
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: TEST_USER_IDS.PRIMARY } }, error: null }) },
    }
    vi.mocked(createBrowserSupabaseClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the skeleton while pending, then loads the post and toasts success', async () => {
    const task = deferred<{ success: true }>()
    startPendingPost('new-post-1', draft, () => task.promise)

    render(<PostDetailPage params={{ id: 'new-post-1' }} />)
    await new Promise((r) => setTimeout(r, 20))
    // Not fetched (the row may not exist yet) and never "not found"
    expect(mockSupabaseClient.single).not.toHaveBeenCalled()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Post not found')).not.toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()

    const post = createTestPostData(TEST_USER_IDS.PRIMARY, { title: 'Pothole' })
    mockSupabaseClient.single.mockResolvedValueOnce({ data: { ...post, id: 'new-post-1' }, error: null })
    await act(async () => {
      task.resolve({ success: true })
    })

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    expect(screen.getAllByText('Pothole').length).toBeGreaterThan(0)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe('🎉 Post created!')
    expect(getPendingPost('new-post-1')).toBeUndefined()
  })

  it('toasts the error and returns to /post/new on failure, without a not-found flash', async () => {
    const task = deferred<{ success: false; error: string }>()
    startPendingPost('new-post-1', draft, () => task.promise)

    render(<PostDetailPage params={{ id: 'new-post-1' }} />)
    await act(async () => {
      task.resolve({ success: false, error: 'Post Limit Reached' })
    })

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/post/new'))
    expect(toast.error).toHaveBeenCalledWith('Post not created', { description: 'Post Limit Reached' })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockSupabaseClient.single).not.toHaveBeenCalled()
    expect(screen.queryByText('Post not found')).not.toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does not toast when opening a post with no pending submission', async () => {
    const post = createTestPostData(TEST_USER_IDS.PRIMARY, { title: 'Old post' })
    mockSupabaseClient.single.mockResolvedValueOnce({ data: { ...post, id: 'new-post-1' }, error: null })
    render(<PostDetailPage params={{ id: 'new-post-1' }} />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    expect(toast.success).not.toHaveBeenCalled()
  })
})
