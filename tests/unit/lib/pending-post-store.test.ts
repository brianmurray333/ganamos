import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/storage', () => ({
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  generateImagePath: vi.fn((userId: string) => `posts/${userId}/x.jpg`),
}))

import { uploadImage, deleteImage } from '@/lib/storage'
import {
  startPendingPost,
  getPendingPost,
  consumePendingPost,
  claimFailedPendingPost,
  peekDraftToRestore,
  clearDraftToRestore,
  watchPendingPost,
  isPendingPostWatched,
  __resetPendingPostStore,
  type PostDraft,
} from '@/lib/pending-post-store'
import {
  primeImageUpload,
  takeImageUpload,
  discardImageUpload,
  __peekImageUploadSlot,
} from '@/lib/early-image-upload'

const draft: PostDraft = {
  description: 'Pothole on Main St',
  reward: 2000,
  image: 'data:image/jpeg;base64,AAAA',
  location: { name: 'Main St', lat: 1, lng: 2 },
  selectedGroupId: 'group-1',
  assignedTo: null,
  assignedToProfile: null,
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('pending-post-store', () => {
  beforeEach(() => {
    __resetPendingPostStore()
  })

  it('tracks a submission as pending, then success, without keeping the draft', async () => {
    const d = deferred<{ success: true }>()
    const p = startPendingPost('post-1', draft, () => d.promise)

    expect(getPendingPost('post-1')?.status).toBe('pending')
    // Pending entries can't be consumed yet
    expect(consumePendingPost('post-1')).toBeUndefined()

    d.resolve({ success: true })
    await expect(p).resolves.toEqual({ success: true })

    expect(getPendingPost('post-1')?.status).toBe('success')
    expect(peekDraftToRestore()).toBeNull()

    // Consumed exactly once
    expect(consumePendingPost('post-1')?.status).toBe('success')
    expect(consumePendingPost('post-1')).toBeUndefined()
    expect(getPendingPost('post-1')).toBeUndefined()
  })

  it('keeps the draft for restoring when the task reports failure', async () => {
    const result = await startPendingPost('post-2', draft, async () => ({ success: false, error: 'Post Limit Reached' }))

    expect(result).toEqual({ success: false, error: 'Post Limit Reached' })
    const entry = getPendingPost('post-2')
    expect(entry?.status).toBe('error')
    expect(entry?.error).toBe('Post Limit Reached')
    expect(peekDraftToRestore()).toEqual(draft)

    clearDraftToRestore()
    expect(peekDraftToRestore()).toBeNull()
  })

  it('reports a failure once but keeps the entry until the next submission', async () => {
    await startPendingPost('post-x', draft, async () => ({ success: false, error: 'nope' }))
    expect(claimFailedPendingPost('post-x')?.error).toBe('nope')
    expect(claimFailedPendingPost('post-x')).toBeUndefined()
    // Still known as failed, so /post/[id] won't fetch it
    expect(getPendingPost('post-x')?.status).toBe('error')

    startPendingPost('post-y', draft, async () => ({ success: true }))
    expect(getPendingPost('post-x')).toBeUndefined()
  })

  it('treats a thrown error as a failure and keeps the draft', async () => {
    const result = await startPendingPost('post-3', draft, async () => {
      throw new Error('network down')
    })
    expect(result).toEqual({ success: false, error: 'network down' })
    expect(getPendingPost('post-3')?.status).toBe('error')
    expect(peekDraftToRestore()).toEqual(draft)
  })

  it('holds the task until the post page watches the id (so server actions do not block navigation)', async () => {
    const task = vi.fn(async () => ({ success: true as const }))
    const p = startPendingPost('post-gate', draft, task, { waitForWatcherMs: 10_000 })
    await new Promise((r) => setTimeout(r, 10))
    expect(task).not.toHaveBeenCalled()
    expect(getPendingPost('post-gate')?.status).toBe('pending')

    const unwatch = watchPendingPost('post-gate')
    await expect(p).resolves.toEqual({ success: true })
    expect(task).toHaveBeenCalledTimes(1)
    unwatch()
  })

  it('starts the held task after the fallback timeout if no page ever watches', async () => {
    vi.useFakeTimers()
    try {
      const task = vi.fn(async () => ({ success: true as const }))
      const p = startPendingPost('post-gate-2', draft, task, { waitForWatcherMs: 4000 })
      await vi.advanceTimersByTimeAsync(3999)
      expect(task).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await expect(p).resolves.toEqual({ success: true })
      expect(task).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts watchers per post id', () => {
    expect(isPendingPostWatched('post-4')).toBe(false)
    const a = watchPendingPost('post-4')
    const b = watchPendingPost('post-4')
    a()
    expect(isPendingPostWatched('post-4')).toBe(true)
    b()
    expect(isPendingPostWatched('post-4')).toBe(false)
  })
})

describe('early-image-upload', () => {
  beforeEach(() => {
    discardImageUpload()
    vi.mocked(uploadImage).mockReset()
    vi.mocked(deleteImage).mockReset().mockResolvedValue({ success: true, error: null })
  })

  it('reuses the primed upload when submitting the same image', async () => {
    vi.mocked(uploadImage).mockResolvedValue({ url: 'https://cdn/a.jpg', error: null })

    const primed = primeImageUpload('data:image/jpeg;base64,AAA', 'user-1')
    // Priming again for the same image is a no-op
    expect(primeImageUpload('data:image/jpeg;base64,AAA', 'user-1')).toBe(primed)

    const taken = takeImageUpload('data:image/jpeg;base64,AAA', 'user-1')
    expect(taken).toBe(primed)
    await expect(taken).resolves.toEqual({ url: 'https://cdn/a.jpg', error: null })
    expect(uploadImage).toHaveBeenCalledTimes(1)
    // Slot is emptied, so a later discard can't delete the post's image
    expect(__peekImageUploadSlot()).toBeNull()
    discardImageUpload()
    await Promise.resolve()
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it('discards (and cleans up) the old upload when the photo changes', async () => {
    vi.mocked(uploadImage)
      .mockResolvedValueOnce({ url: 'https://cdn/old.jpg', error: null })
      .mockResolvedValueOnce({ url: 'https://cdn/new.jpg', error: null })

    const old = primeImageUpload('data:image/jpeg;base64,OLD', 'user-1')
    const fresh = primeImageUpload('data:image/jpeg;base64,NEW', 'user-1')
    expect(fresh).not.toBe(old)

    await old
    await new Promise((r) => setTimeout(r, 0))
    expect(deleteImage).toHaveBeenCalledWith('https://cdn/old.jpg')

    await expect(takeImageUpload('data:image/jpeg;base64,NEW', 'user-1')).resolves.toEqual({
      url: 'https://cdn/new.jpg',
      error: null,
    })
    expect(uploadImage).toHaveBeenCalledTimes(2)
  })

  it('starts a fresh upload at submit time when nothing was primed (or the image differs)', async () => {
    vi.mocked(uploadImage).mockResolvedValue({ url: 'https://cdn/b.jpg', error: null })
    primeImageUpload('data:image/jpeg;base64,ONE', 'user-1')
    discardImageUpload()
    expect(__peekImageUploadSlot()).toBeNull()

    const taken = takeImageUpload('data:image/jpeg;base64,TWO', 'user-1')
    await expect(taken).resolves.toEqual({ url: 'https://cdn/b.jpg', error: null })
    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadImage).mock.calls[1][0]).toBe('data:image/jpeg;base64,TWO')
  })

  it('surfaces upload errors through the taken promise', async () => {
    vi.mocked(uploadImage).mockResolvedValue({ url: null, error: new Error('quota') })
    primeImageUpload('data:image/jpeg;base64,X', 'user-1')
    const res = await takeImageUpload('data:image/jpeg;base64,X', 'user-1')
    expect(res.url).toBeNull()
    expect(res.error?.message).toBe('quota')
  })
})
