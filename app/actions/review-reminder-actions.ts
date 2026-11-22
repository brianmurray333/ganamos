"use server"

/**
 * A fixer reminds the reviewers (post owner, or a parent if the owner is a
 * child account, and the group's admins) that their fix is waiting.
 *
 * SECURITY
 * - The sender is the verified session user. They must be the submitter, or
 *   the parent of an active child who submitted (connected_accounts).
 * - Rate limits are enforced atomically in SQL by record_fix_review_reminder
 *   (service role only): 1h after submitting, then every 24h, max 3.
 * - Emails go only to the post's reviewers, never to an address the client
 *   supplies, and never to the sender.
 */

import { createServerSupabaseClient } from "@/lib/supabase"
import { createAdminClient } from "@/lib/payouts"
import { sendFixReviewReminderEmail } from "@/lib/transaction-emails"
import { parseDbTime } from "@/lib/review-reminders"

async function getCookieStore() {
  const { cookies } = await import("next/headers")
  return cookies()
}

const MAX_RECIPIENTS = 10

export type ReviewReminderResult =
  | { success: true; remaining: number; nextAllowedAt: string | null; emailed: number }
  | { success: false; error: string; nextAllowedAt?: string | null }

const isRealEmail = (email: string | null | undefined): email is string =>
  !!email && email.includes("@") && !email.toLowerCase().endsWith("@ganamos.app")

export async function sendReviewReminderAction(postId: string): Promise<ReviewReminderResult> {
  if (!postId || typeof postId !== "string") return { success: false, error: "Invalid post" }

  const authClient = createServerSupabaseClient({ cookieStore: await getCookieStore() })
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = createAdminClient()
  try {
    const { data: post, error: postError } = await admin
      .from("posts")
      .select("id, title, description, reward, user_id, group_id, fixed, under_review, deleted_at, submitted_fix_by_id, submitted_fix_by_name, submitted_fix_at")
      .eq("id", postId)
      .maybeSingle()
    if (postError || !post) return { success: false, error: "Post not found" }
    if (post.fixed || !post.under_review || post.deleted_at || !post.submitted_fix_by_id) {
      return { success: false, error: "This fix isn't waiting for review anymore" }
    }

    // The sender must be the submitter, or the parent of the submitting child
    const submitterId = String(post.submitted_fix_by_id)
    let allowed = submitterId === user.id
    if (!allowed) {
      const { data: link } = await admin
        .from("connected_accounts")
        .select("connected_user_id")
        .eq("primary_user_id", user.id)
        .eq("connected_user_id", submitterId)
        .limit(1)
      if (link?.length) {
        const { data: child } = await admin
          .from("profiles")
          .select("id")
          .eq("id", submitterId)
          .or("status.is.null,status.eq.active")
          .limit(1)
        allowed = !!child?.length
      }
    }
    if (!allowed) {
      console.error("SECURITY ALERT: review reminder by someone who didn't submit the fix", { postId, userId: user.id })
      return { success: false, error: "Only the person who submitted the fix can send a reminder" }
    }

    // Atomic rate limit + bookkeeping
    const { data: recorded, error: rpcError } = await admin.rpc("record_fix_review_reminder", {
      p_post_id: postId,
      p_sender_id: submitterId,
    })
    if (rpcError || !recorded) {
      console.error("[Review reminder] record failed:", rpcError)
      return { success: false, error: "Couldn't send the reminder. Please try again." }
    }
    const r = recorded as { ok: boolean; reason?: string; remaining?: number; next_allowed_at?: string | null }
    if (!r.ok) {
      if (r.reason === "too_soon") {
        return { success: false, error: "You can send another reminder later", nextAllowedAt: r.next_allowed_at ?? null }
      }
      if (r.reason === "limit_reached") return { success: false, error: "You've sent the maximum number of reminders for this fix" }
      return { success: false, error: "This fix isn't waiting for review anymore" }
    }

    // Reviewers: owner (or the owner's parents if the owner is a child
    // account without a real email) and the group's approved admins (or their
    // parents, likewise)
    const reviewerIds = new Set<string>()
    if (post.user_id) reviewerIds.add(post.user_id)
    if (post.group_id) {
      const { data: admins } = await admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", post.group_id)
        .eq("role", "admin")
        .eq("status", "approved")
      for (const a of admins || []) reviewerIds.add(a.user_id)
    }

    const ids = [...reviewerIds]
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id, name, email").in("id", ids)
      : { data: [] as Array<{ id: string; name: string | null; email: string | null }> }
    const recipients = new Map<string, string>() // email -> name
    const childIdsWithoutEmail: string[] = []
    for (const p of profiles || []) {
      if (isRealEmail(p.email)) recipients.set(p.email.toLowerCase(), p.name || "there")
      else childIdsWithoutEmail.push(p.id)
    }
    if (childIdsWithoutEmail.length) {
      const { data: parentLinks } = await admin
        .from("connected_accounts")
        .select("primary_user_id")
        .in("connected_user_id", childIdsWithoutEmail)
      const parentIds = [...new Set((parentLinks || []).map((l: { primary_user_id: string }) => l.primary_user_id))]
      if (parentIds.length) {
        const { data: parents } = await admin.from("profiles").select("id, name, email").in("id", parentIds)
        for (const p of parents || []) {
          if (isRealEmail(p.email)) recipients.set(p.email.toLowerCase(), p.name || "there")
        }
      }
    }
    // Never email the person sending the reminder
    if (user.email) recipients.delete(user.email.toLowerCase())

    const list = [...recipients.entries()].slice(0, MAX_RECIPIENTS)
    const results = await Promise.allSettled(
      list.map(([email, name]) =>
        sendFixReviewReminderEmail({
          toEmail: email,
          recipientName: name,
          issueTitle: post.title || post.description || "Your issue",
          fixerName: post.submitted_fix_by_name || "Someone",
          rewardAmount: post.reward || 0,
          submittedAt: parseDbTime(post.submitted_fix_at),
          postId,
        })
      )
    )
    const emailed = results.filter((x) => x.status === "fulfilled" && (x.value as { success?: boolean })?.success !== false).length

    return { success: true, remaining: r.remaining ?? 0, nextAllowedAt: r.next_allowed_at ?? null, emailed }
  } catch (error) {
    console.error("[Review reminder] unexpected error:", error)
    return { success: false, error: "Couldn't send the reminder. Please try again." }
  }
}
