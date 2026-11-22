"use client"

/**
 * Fixes waiting on the signed-in user's review (their posts, plus posts in
 * groups they admin), and the fixes they submitted that are waiting on someone
 * else. Polls while the app is visible and re-checks when it comes back to the
 * foreground (the PWA resuming), then:
 *  - shows a toast when a new fix arrives for review, with a View button
 *  - shows a toast to the fixer when their fix is approved or sent back
 *  - powers the review counter + "To review" list on the home feed
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ClipboardCheck, PawPrint, User } from "lucide-react"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "@/components/ui/toast"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatSatsValue } from "@/lib/utils"
import { reminderAvailability, waitLabel, REMINDER_MAX } from "@/lib/review-reminders"
import { sendReviewReminderAction } from "@/app/actions/review-reminder-actions"

const POLL_MS = 30_000

export type PendingReview = {
  id: string
  title: string | null
  description: string | null
  reward: number
  image_url: string | null
  user_id: string | null
  group_id: string | null
  submitted_fix_by_id: string | null
  submitted_fix_by_name: string | null
  submitted_fix_by_avatar: string | null
  submitted_fix_at: string | null
  submitted_fix_note: string | null
  submitted_fix_image_url: string | null
  submitted_fix_proof_text: string | null
  review_reminder_last_at: string | null
}

/** A fix this viewer submitted that's waiting on someone else's review */
export type WaitingFix = {
  id: string
  title: string | null
  description: string | null
  reward: number
  image_url: string | null
  created_by: string | null
  submitted_fix_at: string | null
  review_reminder_count: number | null
  review_reminder_last_at: string | null
}

type PendingReviewsContextValue = {
  reviews: PendingReview[]
  /** False until the first check for this viewer has finished */
  loaded: boolean
  /** Ids that left review since this viewer's session began: approved or sent back */
  resolved: Map<string, "approved" | "rejected">
  /** Fixes awaiting my review */
  count: number
  /** My submitted fixes awaiting someone else's review */
  waiting: WaitingFix[]
  openList: () => void
  refresh: () => void
}

const PendingReviewsContext = createContext<PendingReviewsContextValue>({
  reviews: [],
  loaded: false,
  resolved: new Map(),
  count: 0,
  waiting: [],
  openList: () => {},
  refresh: () => {},
})

export const usePendingReviews = () => useContext(PendingReviewsContext)

/** Ask the review counter to re-check now (e.g. right after approving). */
export const PENDING_REVIEWS_REFRESH_EVENT = "ganamos:pending-reviews-refresh"
export function refreshPendingReviews() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PENDING_REVIEWS_REFRESH_EVENT))
}

const REVIEW_FIELDS =
  "id, title, description, reward, image_url, user_id, group_id, submitted_fix_by_id, submitted_fix_by_name, submitted_fix_by_avatar, submitted_fix_at, submitted_fix_note, submitted_fix_image_url, submitted_fix_proof_text, review_reminder_last_at"
const WAITING_FIELDS =
  "id, title, description, reward, image_url, created_by, submitted_fix_at, review_reminder_count, review_reminder_last_at"

function readMap(key: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as Record<string, string>)
  } catch {
    return null
  }
}

function readIds(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : new Set(JSON.parse(raw) as string[])
  } catch {
    return null
  }
}

function writeIds(key: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {}
}

/** submitted_fix_at is stored as UTC without a zone; Safari needs one. */
export function parseSubmittedAt(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T")
  const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function firstName(name: string | null | undefined) {
  return (name || "Someone").split(" ")[0]
}

export function isDeviceSubmission(r: Pick<PendingReview, "submitted_fix_image_url" | "submitted_fix_proof_text" | "submitted_fix_note">) {
  return !r.submitted_fix_image_url && !r.submitted_fix_proof_text && r.submitted_fix_note === "Submitted via device"
}

function timeAgo(date: Date | null) {
  if (!date) return ""
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export function PendingReviewsProvider({ children }: { children: React.ReactNode }) {
  const { user, activeUserId } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const viewerId = activeUserId || user?.id || null

  const [reviews, setReviews] = useState<PendingReview[]>([])
  const [waiting, setWaiting] = useState<WaitingFix[]>([])
  const [reminding, setReminding] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [resolved, setResolved] = useState<Map<string, "approved" | "rejected">>(new Map())
  const lastReviewIds = useRef<Set<string>>(new Set())
  const [listOpen, setListOpen] = useState(false)
  // Group ids are cached per viewer; results from a viewer we've since
  // switched away from are dropped (see `stale` below)
  const adminGroupIds = useRef<{ viewer: string; ids: string[] } | null>(null)
  const inFlight = useRef<string | null>(null)
  const currentViewer = useRef(viewerId)
  currentViewer.current = viewerId

  // Viewer changed (sign-in, sign-out, account switch): start over
  useEffect(() => {
    adminGroupIds.current = null
    setReviews([])
    setWaiting([])
    setLoaded(false)
    setResolved(new Map())
    lastReviewIds.current = new Set()
  }, [viewerId])

  const check = useCallback(async () => {
    if (!viewerId || inFlight.current === viewerId) return
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    inFlight.current = viewerId
    const stale = () => currentViewer.current !== viewerId
    try {
      if (adminGroupIds.current?.viewer !== viewerId) {
        const { data } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", viewerId)
          .eq("role", "admin")
          .eq("status", "approved")
        if (stale()) return
        adminGroupIds.current = { viewer: viewerId, ids: (data || []).map((g: { group_id: string }) => g.group_id) }
      }
      const groups = adminGroupIds.current.ids
      const mineOrMyGroups = groups.length
        ? `user_id.eq.${viewerId},group_id.in.(${groups.join(",")})`
        : `user_id.eq.${viewerId}`

      const [{ data: toReview, error: reviewError }, { data: mySubmitted, error: submittedError }] = await Promise.all([
        supabase
          .from("posts")
          .select(REVIEW_FIELDS)
          .eq("under_review", true)
          .eq("fixed", false)
          .is("deleted_at", null)
          .or(mineOrMyGroups)
          .order("submitted_fix_at", { ascending: true })
          .limit(50),
        supabase
          .from("posts")
          .select(WAITING_FIELDS)
          .eq("under_review", true)
          .eq("fixed", false)
          .is("deleted_at", null)
          .eq("submitted_fix_by_id", viewerId)
          .order("submitted_fix_at", { ascending: true })
          .limit(50),
      ])

      if (stale()) return

      if (!reviewError && toReview) {
        const list = toReview as PendingReview[]
        const listIds = new Set(list.map((r) => r.id))
        const left = [...lastReviewIds.current].filter((id) => !listIds.has(id))
        lastReviewIds.current = listIds
        if (left.length) {
          const { data: outcomes } = await supabase.from("posts").select("id, fixed").in("id", left)
          if (stale()) return
          setResolved((prev) => {
            const next = new Map(prev)
            for (const o of (outcomes || []) as Array<{ id: string; fixed: boolean }>) {
              next.set(o.id, o.fixed ? "approved" : "rejected")
            }
            return next
          })
        }
        setReviews(list)
        setLoaded(true)

        // Toast fixes we haven't told this user about yet. The first run on a
        // device only records what's there, so an old backlog doesn't toast.
        const seenKey = `ganamos_seen_reviews_${viewerId}`
        const seen = readIds(seenKey)
        const fresh = seen ? list.filter((r) => !seen.has(r.id)) : []
        writeIds(seenKey, list.map((r) => r.id))
        // Reminders the fixer sent since we last looked (first run records only)
        const remindKey = `ganamos_seen_reminders_${viewerId}`
        const seenReminders = readMap(remindKey)
        const nextReminders: Record<string, string> = {}
        for (const r of list) if (r.review_reminder_last_at) nextReminders[r.id] = r.review_reminder_last_at
        try {
          localStorage.setItem(remindKey, JSON.stringify(nextReminders))
        } catch {}
        const freshIds = new Set(fresh.map((r) => r.id))
        const reminded = seenReminders
          ? list.filter((r) => r.review_reminder_last_at && seenReminders[r.id] !== r.review_reminder_last_at && !freshIds.has(r.id))
          : []
        for (const r of reminded.slice(0, 3)) {
          toast(`${firstName(r.submitted_fix_by_name)} sent a reminder`, {
            id: `reminder-${r.id}-${r.review_reminder_last_at}`,
            description: r.title || undefined,
            duration: 8000,
            action: { label: "Review", onClick: () => router.push(`/post/${r.id}`) },
          })
        }

        if (fresh.length === 1) {
          const r = fresh[0]
          toast.success(`${firstName(r.submitted_fix_by_name)} submitted a fix`, {
            id: `review-${r.id}`,
            duration: 8000,
            action: { label: "View", onClick: () => router.push(`/post/${r.id}`) },
          })
        } else if (fresh.length > 1) {
          toast.success(`${fresh.length} fixes to review`, {
            id: "reviews-batch",
            duration: 8000,
            action: { label: "View", onClick: () => setListOpen(true) },
          })
        }
      }

      if (!submittedError && mySubmitted) {
        // Fixes this user submitted that left review since we last looked:
        // approved (paid) or sent back.
        const pendingKey = `ganamos_my_pending_fixes_${viewerId}`
        const before = readIds(pendingKey)
        setWaiting(mySubmitted as WaitingFix[])
        const now = new Set((mySubmitted as { id: string }[]).map((p) => p.id))
        writeIds(pendingKey, now)
        const resolved = before ? [...before].filter((id) => !now.has(id)) : []
        if (resolved.length) {
          const { data: outcomes } = await supabase
            .from("posts")
            .select("id, title, reward, fixed, fixed_by")
            .in("id", resolved)
          if (stale()) return
          for (const p of (outcomes || []) as Array<{ id: string; title: string | null; reward: number; fixed: boolean; fixed_by: string | null }>) {
            if (p.fixed && p.fixed_by === viewerId) {
              toast.success(`Fix approved · +${formatSatsValue(p.reward || 0)}`, {
                id: `approved-${p.id}`,
                duration: 8000,
                action: { label: "View", onClick: () => router.push(`/post/${p.id}`) },
              })
            } else if (!p.fixed) {
              toast(`Fix sent back: ${p.title || "your fix"}`, {
                id: `rejected-${p.id}`,
                duration: 8000,
                action: { label: "View", onClick: () => router.push(`/post/${p.id}`) },
              })
            }
          }
        }
      }
    } catch (error) {
      console.error("[PendingReviews] check failed:", error)
    } finally {
      if (inFlight.current === viewerId) inFlight.current = null
    }
  }, [viewerId, supabase, router])

  useEffect(() => {
    if (!viewerId) return
    check()
    const interval = window.setInterval(check, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    window.addEventListener(PENDING_REVIEWS_REFRESH_EVENT, check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
      window.removeEventListener(PENDING_REVIEWS_REFRESH_EVENT, check)
    }
  }, [viewerId, check])

  const value = useMemo<PendingReviewsContextValue>(
    () => ({ reviews, loaded, resolved, count: reviews.length, waiting, openList: () => setListOpen(true), refresh: check }),
    [reviews, loaded, resolved, waiting, check]
  )

  const totalSats = reviews.reduce((sum, r) => sum + (r.reward || 0), 0)

  const remind = async (fix: WaitingFix) => {
    if (reminding) return
    setReminding(fix.id)
    try {
      const result = await sendReviewReminderAction(fix.id)
      if (result.success) {
        toast.success("Reminder sent", {
          description: result.remaining > 0 ? `You can remind again in 24h (${result.remaining} left)` : "That was your last reminder for this fix",
        })
      } else {
        const next = result.nextAllowedAt ? new Date(result.nextAllowedAt) : null
        toast.error(result.error, next ? { description: `Try again ${waitLabel(next)}` } : undefined)
      }
    } catch {
      toast.error("Couldn't send the reminder. Please try again.")
    } finally {
      setReminding(null)
      check()
    }
  }

  return (
    <PendingReviewsContext.Provider value={value}>
      {children}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-md p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-bold">{reviews.length || !waiting.length ? "To review" : "Waiting on review"}</DialogTitle>
            {reviews.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {reviews.length === 1 ? "1 fix" : `${reviews.length} fixes`} · {formatSatsValue(totalSats)}
              </p>
            )}
          </DialogHeader>
          {reviews.length === 0 && waiting.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting on you.</p>
          ) : reviews.length === 0 ? null : (
            <ul className="-mx-1 max-h-[60vh] space-y-2 overflow-y-auto px-1">
              {reviews.map((r) => {
                const device = isDeviceSubmission(r)
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setListOpen(false)
                        router.push(`/post/${r.id}`)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Avatar className="h-full w-full rounded-lg">
                            {r.submitted_fix_by_avatar && <AvatarImage src={r.submitted_fix_by_avatar} alt="" />}
                            <AvatarFallback className="rounded-lg"><User className="h-5 w-5" /></AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{r.title || r.description || "Untitled"}</p>
                        <p className="flex items-center gap-1 truncate text-[13px] text-muted-foreground">
                          {device && <PawPrint className="h-3 w-3 shrink-0" aria-hidden="true" />}
                          {firstName(r.submitted_fix_by_name)} · {device ? "from SatoshiPet" : "with proof"}
                          {r.submitted_fix_at && ` · ${timeAgo(parseSubmittedAt(r.submitted_fix_at))}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-[13px] font-bold text-amber-700 dark:text-amber-400">
                        {formatSatsValue(r.reward || 0)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {waiting.length > 0 && (
            <section aria-label="Your fixes waiting on review" className={reviews.length ? "mt-2 border-t pt-4" : ""}>
              {reviews.length > 0 && <h3 className="mb-2 text-[15px] font-bold">Waiting on review</h3>}
              <ul className="-mx-1 max-h-[50vh] space-y-2 overflow-y-auto px-1">
                {waiting.map((w) => {
                  const availability = reminderAvailability(w)
                  const busy = reminding === w.id
                  const status = availability.canRemind
                    ? availability.sent > 0
                      ? `Reminded ${availability.sent}×`
                      : "Waiting"
                    : availability.reason === "limit_reached"
                      ? `Reminded ${REMINDER_MAX}× · no more reminders`
                      : `Remind ${waitLabel(availability.nextAt)}`
                  return (
                    <li key={w.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setListOpen(false)
                          router.push(`/post/${w.id}`)
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {w.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">{w.title || w.description || "Untitled"}</p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {w.created_by ? `${firstName(w.created_by)} · ` : ""}
                            {formatSatsValue(w.reward || 0)}
                            {w.submitted_fix_at && ` · ${timeAgo(parseSubmittedAt(w.submitted_fix_at))}`}
                          </p>
                          <p className="truncate text-[12px] text-amber-700 dark:text-amber-400">{status}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => remind(w)}
                        disabled={!availability.canRemind || !!reminding}
                        className="h-10 shrink-0 rounded-lg border px-3.5 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? "Sending…" : "Remind"}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </PendingReviewsContext.Provider>
  )
}

/** Round counter button for the home header; renders nothing when empty. */
export function PendingReviewsButton({ className = "" }: { className?: string }) {
  const { count, waiting, openList } = usePendingReviews()
  const waitingCount = waiting.length
  if (!count && !waitingCount) return null
  // Red: fixes waiting on me (action needed). Amber: my fixes waiting on others.
  const badge = count || waitingCount
  const label = [
    count ? (count === 1 ? "1 fix to review" : `${count} fixes to review`) : null,
    waitingCount ? (waitingCount === 1 ? "1 of your fixes waiting on review" : `${waitingCount} of your fixes waiting on review`) : null,
  ]
    .filter(Boolean)
    .join(", ")
  return (
    <button
      type="button"
      onClick={openList}
      aria-label={label}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-transform active:scale-95 animate-in fade-in zoom-in-95 duration-300 ${className}`}
    >
      <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
      <span
        className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background px-1 text-[11px] font-bold leading-none ${
          count ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"
        }`}
      >
        {badge > 9 ? "9+" : badge}
      </span>
    </button>
  )
}
