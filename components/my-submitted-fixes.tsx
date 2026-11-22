"use client"

/**
 * Profile card: fixes this account submitted that are waiting on the poster,
 * plus ones approved in the last two weeks. Hidden when there are none.
 * The last result is kept per account so it shows instantly on return visits.
 */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { formatSatsValue } from "@/lib/utils"
import { PENDING_REVIEWS_REFRESH_EVENT } from "@/components/pending-reviews"

type SubmittedFix = {
  id: string
  title: string | null
  description: string | null
  reward: number
  image_url: string | null
  created_by: string | null
  fixed: boolean
  fixed_at: string | null
  submitted_fix_at: string | null
}

const FIELDS = "id, title, description, reward, image_url, created_by, fixed, fixed_at, submitted_fix_at"
const RECENT_DAYS = 14
const MAX_ROWS = 5

const cacheKey = (userId: string) => `ganamos_my_submitted_fixes_${userId}`

function readCache(userId: string | null): SubmittedFix[] | null {
  if (!userId || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    return raw ? (JSON.parse(raw) as SubmittedFix[]) : null
  } catch {
    return null
  }
}

function firstName(name: string | null) {
  return name ? name.split(" ")[0] : "the poster"
}

export function MySubmittedFixes({ userId, className }: { userId: string | null; className?: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [fixes, setFixes] = useState<SubmittedFix[] | null>(() => readCache(userId))
  // Ease in only when the card arrives after first paint (not from cache)
  const [animate] = useState(() => readCache(userId) === null)

  useEffect(() => {
    setFixes(readCache(userId))
    if (!userId) return
    let cancelled = false

    const load = async () => {
      const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const [pending, approved] = await Promise.all([
        supabase
          .from("posts")
          .select(FIELDS)
          .eq("submitted_fix_by_id", userId)
          .eq("under_review", true)
          .eq("fixed", false)
          .is("deleted_at", null)
          .order("submitted_fix_at", { ascending: false })
          .limit(MAX_ROWS),
        supabase
          .from("posts")
          .select(FIELDS)
          .eq("fixed_by", userId)
          .eq("fixed", true)
          .gte("fixed_at", since)
          .is("deleted_at", null)
          .order("fixed_at", { ascending: false })
          .limit(MAX_ROWS),
      ])
      if (cancelled || pending.error || approved.error) return
      const rows = [...((pending.data || []) as SubmittedFix[]), ...((approved.data || []) as SubmittedFix[])].slice(0, MAX_ROWS)
      setFixes(rows)
      try {
        localStorage.setItem(cacheKey(userId), JSON.stringify(rows))
      } catch {}
    }

    load()
    const onVisible = () => {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener(PENDING_REVIEWS_REFRESH_EVENT, load)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener(PENDING_REVIEWS_REFRESH_EVENT, load)
    }
  }, [userId, supabase])

  if (!fixes?.length) return null

  return (
    <Card className={`${className ?? ""} ${animate ? "animate-in fade-in duration-500 ease-out" : ""}`}>
      <CardContent className="p-4">
        <h2 className="mb-3 text-base font-semibold">Your submitted fixes</h2>
        <ul className="space-y-2">
          {fixes.map((fix) => (
            <li key={fix.id}>
              <button
                type="button"
                onClick={() => router.push(`/post/${fix.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted dark:border-gray-700/50"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {fix.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fix.image_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{fix.title || fix.description || "Untitled"}</p>
                  {fix.fixed ? (
                    <p className="truncate text-[13px] font-medium text-green-700 dark:text-green-400">
                      Approved · paid {formatSatsValue(fix.reward || 0)}
                    </p>
                  ) : (
                    <p className="truncate text-[13px] font-medium text-amber-700 dark:text-amber-400">
                      Waiting on {firstName(fix.created_by)} · {formatSatsValue(fix.reward || 0)}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
