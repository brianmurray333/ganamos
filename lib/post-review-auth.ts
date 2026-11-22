/**
 * Who may review a post's fix (approve & pay, or send it back), and close it.
 *
 * The rule, mirrored in SQL by public.ganamos_can_review_post:
 *   1. the post's owner,
 *   2. an approved admin of the post's group,
 *   3. a parent acting for a connected child account that is (1) or (2).
 *
 * SECURITY
 * - `userId` must be the id of the *verified session user* (auth.getUser()),
 *   never an id supplied by the client (e.g. the account the app is "viewing
 *   as"). The child is derived server-side from connected_accounts, which only
 *   the service role can write (rows are created when a parent creates a
 *   child account), so a user can't link themselves to someone else.
 * - Only direct children count (one hop); a child's own children don't.
 * - Children whose profile isn't active (suspended / deleted) don't count.
 * - `admin` must be a service-role client so these reads aren't narrowed by
 *   RLS; any query error denies (fails closed).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type PostReviewAccess =
  | { allowed: false }
  | {
      allowed: true
      via: "owner" | "group_admin" | "parent_of_owner" | "parent_of_group_admin"
      /** The child account the parent is acting for (parent_* only) */
      actingForUserId?: string
    }

const DENY: PostReviewAccess = { allowed: false }

export async function authorizePostReview(
  admin: SupabaseClient,
  userId: string | null | undefined,
  post: { user_id: string | null; group_id: string | null }
): Promise<PostReviewAccess> {
  if (!userId) return DENY

  if (post.user_id && post.user_id === userId) return { allowed: true, via: "owner" }

  if (post.group_id) {
    const { data, error } = await admin
      .from("group_members")
      .select("role")
      .eq("group_id", post.group_id)
      .eq("user_id", userId)
      .eq("status", "approved")
      .eq("role", "admin")
      .limit(1)
    if (error) return DENY
    if (data && data.length > 0) return { allowed: true, via: "group_admin" }
  }

  // Direct, active children of the session user
  const { data: links, error: linksError } = await admin
    .from("connected_accounts")
    .select("connected_user_id")
    .eq("primary_user_id", userId)
  if (linksError || !links?.length) return DENY
  const linkedIds = [...new Set(links.map((l: { connected_user_id: string }) => l.connected_user_id))].filter(
    (id) => id && id !== userId
  )
  if (!linkedIds.length) return DENY

  const { data: activeChildren, error: childrenError } = await admin
    .from("profiles")
    .select("id")
    .in("id", linkedIds)
    .eq("status", "active")
  if (childrenError || !activeChildren?.length) return DENY
  const childIds = activeChildren.map((c: { id: string }) => c.id)

  if (post.user_id && childIds.includes(post.user_id)) {
    return { allowed: true, via: "parent_of_owner", actingForUserId: post.user_id }
  }

  if (post.group_id) {
    const { data: childAdmins, error } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", post.group_id)
      .in("user_id", childIds)
      .eq("status", "approved")
      .eq("role", "admin")
      .limit(1)
    if (error) return DENY
    if (childAdmins && childAdmins.length > 0) {
      return { allowed: true, via: "parent_of_group_admin", actingForUserId: childAdmins[0].user_id }
    }
  }

  return DENY
}

/** Audit trail when a parent reviews/closes a post on a child's behalf. */
export function logParentReview(
  sessionUserId: string,
  access: PostReviewAccess,
  post: { id?: string; user_id: string | null; group_id: string | null }
) {
  if (!access.allowed || (access.via !== "parent_of_owner" && access.via !== "parent_of_group_admin")) return
  console.log("AUDIT: Parent reviewing post on behalf of connected account", {
    action: "PARENT_REVIEW_FOR_CHILD",
    via: access.via,
    parentUserId: sessionUserId,
    childUserId: access.actingForUserId,
    postId: post.id,
    postOwnerId: post.user_id,
    postGroupId: post.group_id,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Self-dealing guard: a reviewer whose authority comes from administering the
 * group (directly, or through an admin child) must not pay a post owner's
 * reward to themselves or to one of their own children. Owners (and parents
 * acting for the owning child) are spending their own family's reward, so they
 * may approve anyone. Mirrored in SQL by public.ganamos_review_is_self_dealing.
 * Fails closed: returns true (conflict) on any lookup error.
 */
export async function isSelfDealingReview(
  admin: SupabaseClient,
  sessionUserId: string,
  access: PostReviewAccess,
  fixerId: string | null | undefined
): Promise<boolean> {
  if (!access.allowed) return true
  if (access.via === "owner" || access.via === "parent_of_owner") return false
  if (!fixerId) return false
  if (fixerId === sessionUserId) return true
  const { data, error } = await admin
    .from("connected_accounts")
    .select("connected_user_id")
    .eq("primary_user_id", sessionUserId)
    .eq("connected_user_id", fixerId)
    .limit(1)
  if (error) return true
  return !!data?.length
}
