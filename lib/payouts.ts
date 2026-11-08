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

/**
 * Was this post's reward actually funded? Posts by registered users are funded
 * by a negative internal transaction from the owner whose memo mentions the
 * post; anonymous web posts by a verified funding invoice; L402/API posts by a
 * completed deposit at least the reward size.
 */
export async function isPostRewardFunded(
  admin: SupabaseClient,
  post: {
    id: string
    user_id: string | null
    reward: number | null
    funding_status?: string | null
    funding_r_hash?: string | null
  }
): Promise<boolean> {
  if (!post.reward || post.reward <= 0) return true // nothing to fund

  // Anonymous web posts: funded by a Lightning invoice that the server
  // verified as settled when creating the post (createFundedAnonymousPostAction).
  // funding_status can't be changed by browser sessions (DB trigger).
  if (!post.user_id && post.funding_status === "paid" && post.funding_r_hash) return true
  const memoMatch = `%${post.id.substring(0, 8)}%`

  if (post.user_id) {
    const { data: fundingTx } = await admin
      .from("transactions")
      .select("id")
      .eq("user_id", post.user_id)
      .eq("type", "internal")
      .eq("status", "completed")
      .lt("amount", 0)
      .ilike("memo", memoMatch)
      .limit(1)
    if (fundingTx && fundingTx.length > 0) return true
  }

  const { data: l402Tx } = await admin
    .from("transactions")
    .select("id")
    .eq("type", "deposit")
    .eq("status", "completed")
    .gte("amount", post.reward)
    .ilike("memo", memoMatch)
    .limit(1)
  return !!(l402Tx && l402Tx.length > 0)
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
