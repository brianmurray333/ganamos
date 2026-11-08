/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

/**
 * New-post submit should feel instant: pressing Post navigates to /post/[id]
 * right away and the caps check / upload / create run in the background
 * (lib/pending-post-store). A failure keeps the draft for /post/new.
 */

const mockRouter = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/post/new',
}))

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: any) => <img {...props} />,
}))

vi.mock('next/dynamic', () => ({
  default: () => (props: any) => (
    <button type="button" onClick={props.onSkip}>
      Skip photo
    </button>
  ),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))

const refreshProfile = vi.fn()
// Stable object: the page has effects keyed on `user`.
const mockAuth = {
  user: { id: 'user-1' },
  profile: { name: 'Test User', avatar_url: null, balance: 10000 },
  activeUserId: 'user-1',
  updateBalance: vi.fn(),
  refreshProfile,
}
vi.mock('@/components/auth-provider', () => ({
  useAuth: () => mockAuth,
}))

const checkPostSafetyCapsAction = vi.fn()
const createPostWithRewardAction = vi.fn()
vi.mock('@/app/actions/post-actions', () => ({
  checkPostSafetyCapsAction: (...args: any[]) => checkPostSafetyCapsAction(...args),
  createPostWithRewardAction: (...args: any[]) => createPostWithRewardAction(...args),
  createPostFundingInvoiceAction: vi.fn(),
  checkPostFundingStatusAction: vi.fn(),
  createFundedAnonymousPostAction: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  uploadImage: vi.fn(async () => ({ url: 'https://cdn/img.jpg', error: null })),
  deleteImage: vi.fn(async () => ({ success: true, error: null })),
  generateImagePath: vi.fn(() => 'posts/user-1/x.jpg'),
  isBase64Image: (s: string) => s.startsWith('data:image'),
}))

vi.mock('@/lib/geocoding', () => ({
  getCurrentLocationWithName: vi.fn(async () => null),
  getPlaceLabel: vi.fn(async () => 'Somewhere'),
}))
vi.mock('@/lib/google-maps-loader', () => ({ loadGoogleMaps: vi.fn(async () => {}) }))
vi.mock('@/components/location-editor-modal', () => ({ LocationEditorModal: () => null }))
vi.mock('@/components/create-group-dialog', () => ({ CreateGroupDialog: () => null }))
vi.mock('@/components/share-group-modal', () => ({ ShareGroupModal: () => null }))
vi.mock('@/components/qr-code', () => ({ default: () => null }))

import NewPostPage from '@/app/post/new/page'
import { uploadImage } from '@/lib/storage'
import {
  getPendingPost,
  peekDraftToRestore,
  startPendingPost,
  watchPendingPost,
  __resetPendingPostStore,
} from '@/lib/pending-post-store'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  __resetPendingPostStore()
  mockRouter.push.mockReset()
  mockRouter.replace.mockReset()
  mockRouter.prefetch.mockReset()
  checkPostSafetyCapsAction.mockReset()
  createPostWithRewardAction.mockReset()
  refreshProfile.mockReset()
  vi.mocked(uploadImage).mockClear()
  global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as any
})

describe('NewPostPage submit', () => {
  it('navigates to the post page immediately and creates the post in the background', async () => {
    const caps = deferred<{ allowed: boolean }>()
    checkPostSafetyCapsAction.mockReturnValue(caps.promise)
    createPostWithRewardAction.mockResolvedValue({ success: true })

    render(<NewPostPage />)
    fireEvent.click(screen.getByText('Skip photo'))

    // Entering details prefetches the (pre-generated) post page
    await waitFor(() => expect(mockRouter.prefetch).toHaveBeenCalled())
    const prefetched = mockRouter.prefetch.mock.calls[0][0] as string
    expect(prefetched).toMatch(/^\/post\/[0-9a-f-]{36}$/)

    fireEvent.change(screen.getByPlaceholderText('Describe the issue...'), { target: { value: 'Broken bench' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    // Navigation happens before any server work finishes
    expect(mockRouter.push).toHaveBeenCalledWith(prefetched)
    expect(createPostWithRewardAction).not.toHaveBeenCalled()
    const postId = prefetched.split('/').pop()!
    watchPendingPost(postId) // stands in for the mounted /post/[id] page
    expect(getPendingPost(postId)?.status).toBe('pending')

    await act(async () => {
      caps.resolve({ allowed: true })
    })
    await waitFor(() => expect(getPendingPost(postId)?.status).toBe('success'))
    expect(createPostWithRewardAction).toHaveBeenCalledWith(
      expect.objectContaining({ postId, userId: 'user-1', description: 'Broken bench', imageUrl: null, hasImage: false })
    )
    expect(refreshProfile).toHaveBeenCalled()
    expect(peekDraftToRestore()).toBeNull()
  })

  it('keeps the draft when creation fails, and restores it on the next visit', async () => {
    checkPostSafetyCapsAction.mockResolvedValue({ allowed: true })
    createPostWithRewardAction.mockResolvedValue({ success: false, error: 'Insufficient balance' })

    const { unmount } = render(<NewPostPage />)
    fireEvent.click(screen.getByText('Skip photo'))
    fireEvent.change(await screen.findByPlaceholderText('Describe the issue...'), { target: { value: 'Graffiti' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    const postId = (mockRouter.push.mock.calls[0][0] as string).split('/').pop()!
    watchPendingPost(postId) // stands in for the mounted /post/[id] page

    await waitFor(() => expect(getPendingPost(postId)?.status).toBe('error'))
    expect(getPendingPost(postId)?.error).toBe('Insufficient balance')
    expect(peekDraftToRestore()).toMatchObject({ description: 'Graffiti', reward: 2000 })
    unmount()

    render(<NewPostPage />)
    // Straight to the details step with the text restored
    expect(screen.getByPlaceholderText('Describe the issue...')).toHaveValue('Graffiti')
    await waitFor(() => expect(peekDraftToRestore()).toBeNull())
  })

  it('awaits the photo upload started on the details step instead of uploading again', async () => {
    // Seed a failed submission whose draft has a photo, so the page opens on details with it
    await startPendingPost(
      'old',
      {
        description: 'Fallen tree',
        reward: 2000,
        image: 'data:image/jpeg;base64,AAAA',
        location: null,
        selectedGroupId: null,
        assignedTo: null,
        assignedToProfile: null,
      },
      async () => ({ success: false, error: 'x' })
    )
    checkPostSafetyCapsAction.mockResolvedValue({ allowed: true })
    createPostWithRewardAction.mockResolvedValue({ success: true })

    render(<NewPostPage />)
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    const postId = (mockRouter.push.mock.calls[0][0] as string).split('/').pop()!
    watchPendingPost(postId) // stands in for the mounted /post/[id] page
    await waitFor(() => expect(getPendingPost(postId)?.status).toBe('success'))

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(createPostWithRewardAction).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'https://cdn/img.jpg', hasImage: true })
    )
  })
})
