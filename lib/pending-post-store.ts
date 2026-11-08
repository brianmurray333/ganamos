/**
 * Module-level store for new-post submissions that are still in flight.
 *
 * The new-post page starts the (slow) submission here and navigates to
 * /post/[id] right away. Because the store lives at module scope it survives
 * the new-post page unmounting; the post detail page subscribes to it to show
 * a skeleton while the post is being created, then a success toast, or, on
 * failure, an error toast and a trip back to /post/new with the draft restored.
 */

import { useSyncExternalStore } from "react"

export interface PostDraftPerson {
  id: string
  name: string
  username: string
  avatar_url?: string
}

/** Everything the user entered on /post/new, so a failed submit loses nothing. */
export interface PostDraft {
  description: string
  reward: number
  /** Base64 data URL (or remote URL) of the photo, or null for no photo. */
  image: string | null
  location: { name: string; lat: number; lng: number; displayName?: string } | null
  selectedGroupId: string | null
  assignedTo: string | null
  assignedToProfile: PostDraftPerson | null
}

export type PendingPostStatus = "pending" | "success" | "error"

export type PendingPostResult = { success: true } | { success: false; error: string }

export interface PendingPost {
  postId: string
  status: PendingPostStatus
  error?: string
  /** A failure has been reported to the user (see claimFailedPendingPost). */
  handled?: boolean
  draft: PostDraft
  promise: Promise<PendingPostResult>
}

const pendingPosts = new Map<string, PendingPost>()
const listeners = new Set<() => void>()
/** Number of mounted views currently watching each post id. */
const watchers = new Map<string, number>()
let draftToRestore: PostDraft | null = null

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Resolvers waiting for a view to start watching a post id. */
const watchWaiters = new Map<string, Array<() => void>>()

/**
 * Resolves once a view watches `postId` (i.e. /post/[id] has mounted, so the
 * navigation has committed), or after `timeoutMs` as a fallback.
 */
function waitForWatcher(postId: string, timeoutMs: number): Promise<void> {
  if (isPendingPostWatched(postId)) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      const list = watchWaiters.get(postId)
      if (list) {
        const rest = list.filter((fn) => fn !== done)
        if (rest.length) watchWaiters.set(postId, rest)
        else watchWaiters.delete(postId)
      }
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    watchWaiters.set(postId, [...(watchWaiters.get(postId) ?? []), done])
  })
}

export interface StartPendingPostOptions {
  /**
   * Hold `task` until /post/[id] is mounted (falling back after this many ms).
   *
   * Next.js runs server actions and navigations as React transitions, and a
   * navigation can't commit while a server action dispatched alongside it is
   * still pending. Calling server actions only once the post page is on screen
   * keeps the navigation instant.
   */
  waitForWatcherMs?: number
}

/**
 * Start a submission in the background. `task` resolves to `{ success }` or
 * `{ success: false, error }`; a thrown error counts as a failure. On failure
 * the draft is kept so /post/new can restore it.
 */
export function startPendingPost(
  postId: string,
  draft: PostDraft,
  task: () => Promise<PendingPostResult>,
  options: StartPendingPostOptions = {}
): Promise<PendingPostResult> {
  // Drop failures that were already reported; they only exist to keep
  // /post/[id] from fetching a post that was never created.
  pendingPosts.forEach((entry, id) => {
    if (entry.status === "error" && entry.handled) pendingPosts.delete(id)
  })
  const gate = options.waitForWatcherMs != null ? waitForWatcher(postId, options.waitForWatcherMs) : Promise.resolve()
  const promise = gate
    .then(task)
    .catch((err: unknown): PendingPostResult => ({
      success: false,
      error: err instanceof Error && err.message ? err.message : "There was an error creating your post.",
    }))
    .then((result) => {
      const current = pendingPosts.get(postId)
      if (current && current.promise === promise) {
        pendingPosts.set(postId, {
          ...current,
          status: result.success ? "success" : "error",
          error: result.success ? undefined : result.error,
        })
        if (!result.success) draftToRestore = draft
        emit()
      }
      return result
    })

  pendingPosts.set(postId, { postId, status: "pending", draft, promise })
  emit()
  return promise
}

export function getPendingPost(postId: string): PendingPost | undefined {
  return pendingPosts.get(postId)
}

/**
 * Remove a settled entry. Returns the entry the first time and undefined after,
 * so callers can use it to show a toast exactly once.
 */
export function consumePendingPost(postId: string): PendingPost | undefined {
  const entry = pendingPosts.get(postId)
  if (!entry || entry.status === "pending") return undefined
  pendingPosts.delete(postId)
  emit()
  return entry
}

/**
 * Claim a failed entry so its error is reported exactly once. The entry stays
 * in the store (status "error") so the post page keeps treating the id as a
 * post that doesn't exist rather than fetching it. Returns undefined if the
 * entry isn't a failure or was already claimed.
 */
export function claimFailedPendingPost(postId: string): PendingPost | undefined {
  const entry = pendingPosts.get(postId)
  if (!entry || entry.status !== "error" || entry.handled) return undefined
  entry.handled = true
  return entry
}

/** Mark a post id as being shown by a mounted view (returns the unwatch fn). */
export function watchPendingPost(postId: string): () => void {
  watchers.set(postId, (watchers.get(postId) ?? 0) + 1)
  watchWaiters.get(postId)?.slice().forEach((fn) => fn())
  return () => {
    const n = (watchers.get(postId) ?? 1) - 1
    if (n <= 0) watchers.delete(postId)
    else watchers.set(postId, n)
  }
}

export function isPendingPostWatched(postId: string): boolean {
  return (watchers.get(postId) ?? 0) > 0
}

/** The draft of the last failed submission, if /post/new hasn't restored it yet. */
export function peekDraftToRestore(): PostDraft | null {
  return draftToRestore
}

export function clearDraftToRestore() {
  draftToRestore = null
}

/** React hook: the pending submission for `postId` (re-renders on changes). */
export function usePendingPost(postId: string | undefined): PendingPost | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (postId ? pendingPosts.get(postId) : undefined),
    () => undefined
  )
}

/** Test helper. */
export function __resetPendingPostStore() {
  pendingPosts.clear()
  watchers.clear()
  watchWaiters.clear()
  draftToRestore = null
  emit()
}
