/**
 * Server-only payout helpers.
 *
 * NOT a "use server" module: nothing here is callable from the browser.
 * Server actions/routes do their own authentication and authorization, then
 * use these helpers so that amounts come from the database and every reward
 * is paid at most once.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto"
import { createServerSupabaseClient } from "@/lib/supabase"
import { AUTO_APPROVE_CONFIDENCE, verifyFixImages, type FixVerification } from "@/lib/verify-fix"

export { AUTO_APPROVE_CONFIDENCE }

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

export function createAdminClient(): SupabaseClient {
  return createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
}

/** Posts created before this used a different funding record (see below). */
const FUNDING_LINK_CUTOFF = "2026-11-08T00:00:00Z"

/**
 * Was this post's reward actually funded? Always re-reads the post's funding
 * fields from the database (callers' copies aren't trusted).
 *
 * - Registered users' posts: posts.funding_transaction_id, set by
 *   create_post_atomic in the same transaction that deducted the reward,
 *   must point to the owner's completed internal deduction.
 * - Older posts without that link: an unlinked deduction of exactly the
 *   reward by the owner within 2 minutes of the post's creation.
 * - Anonymous web/API posts: funding_status 'paid' with a funding invoice,
 *   verified as settled when the post was created.
 * Browser sessions can't set any of these fields (DB triggers).
 */
export async function isPostRewardFunded(
  admin: SupabaseClient,
  postRef: { id: string }
): Promise<boolean> {
  const { data: post } = await admin
    .from("posts")
    .select("id, user_id, reward, original_reward, created_at, funding_transaction_id, funding_status, funding_r_hash")
    .eq("id", postRef.id)
    .single()
  if (!post) return false
  if (!post.reward || post.reward <= 0) return true // nothing to fund

  if (!post.user_id) {
    return post.funding_status === "paid" && !!post.funding_r_hash
  }

  if (post.funding_transaction_id) {
    const { data: tx } = await admin
      .from("transactions")
      .select("id, user_id, type, status, amount")
      .eq("id", post.funding_transaction_id)
      .single()
    return !!tx && tx.user_id === post.user_id && tx.type === "internal" && tx.status === "completed" && tx.amount < 0
  }

  // Legacy posts (no funding link)
  if (!post.created_at || new Date(post.created_at) >= new Date(FUNDING_LINK_CUTOFF)) return false
  const created = new Date(post.created_at).getTime()
  const amounts = Array.from(new Set([post.reward, post.original_reward].filter((a): a is number => !!a && a > 0)))
  const { data: candidates } = await admin
    .from("transactions")
    .select("id")
    .eq("user_id", post.user_id)
    .eq("type", "internal")
    .eq("status", "completed")
    .in("amount", amounts.map((a) => -a))
    .gte("created_at", new Date(created - 2 * 60_000).toISOString())
    .lte("created_at", new Date(created + 2 * 60_000).toISOString())
    .limit(5)
  for (const c of candidates ?? []) {
    const { data: linked } = await admin.from("posts").select("id").eq("funding_transaction_id", c.id).limit(1)
    if (!linked || linked.length === 0) return true
  }
  return false
}

export type PayFixRewardResult =
  | { success: true; transactionId: string; amount: number; newBalance: number }
  | { success: false; error: string; code?: string }

const PAYOUT_ERRORS: Record<string, string> = {
  reward_already_paid: "This reward has already been paid.",
  post_not_found: "Post not found.",
  post_deleted: "Post has been deleted.",
  no_reward: "This post has no reward to pay.",
  fixer_not_found: "Fixer profile not found.",
}

/**
 * Credit the post's stored reward to `fixerId`, exactly once (atomic in the
 * database via pay_fix_reward). The caller must already have authorized the
 * payout and verified the fix.
 */
export async function payFixReward(
  admin: SupabaseClient,
  params: { postId: string; fixerId: string; memo: string }
): Promise<PayFixRewardResult> {
  const { data, error } = await admin.rpc("pay_fix_reward", {
    p_post_id: params.postId,
    p_fixer_id: params.fixerId,
    p_memo: params.memo,
  })

  if (error) {
    const code = Object.keys(PAYOUT_ERRORS).find((k) => error.message?.includes(k))
    if (!code) console.error("[payFixReward] RPC error:", error)
    return { success: false, error: code ? PAYOUT_ERRORS[code] : "Failed to pay reward.", code }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { success: false, error: "Failed to pay reward." }
  return {
    success: true,
    transactionId: row.transaction_id,
    amount: row.amount,
    newBalance: row.new_balance,
  }
}

/* ------------------------------------------------------------------ */
/* Anonymous fixer claim tokens                                       */
/* ------------------------------------------------------------------ */

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** New secret for an anonymous fixer; store only the hash on the post. */
export function generateClaimToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex")
  return { token, hash: hashClaimToken(token) }
}

/** Constant-time check of a presented token against the stored hash. */
export function verifyClaimToken(storedHash: string | null | undefined, token: string | null | undefined): boolean {
  if (!storedHash || !token || typeof token !== "string") return false
  const a = Buffer.from(hashClaimToken(token), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

/* ------------------------------------------------------------------ */
/* Server-side fix verification                                       */
/* ------------------------------------------------------------------ */

/**
 * Re-run AI verification on the server using the post's stored "before" image.
 * Returns null if the post has no image (needs human review) or the model
 * call fails.
 */
export async function verifyFixForPost(
  post: { image_url?: string | null; title?: string | null; description?: string | null },
  fixImageUrl: string
): Promise<FixVerification | null> {
  if (!post.image_url || !fixImageUrl) return null
  try {
    return await verifyFixImages({
      beforeImage: post.image_url,
      afterImage: fixImageUrl,
      title: post.title,
      description: post.description || post.title || "",
    })
  } catch (error) {
    console.error("[verifyFixForPost] AI verification failed:", error)
    return null
  }
}
