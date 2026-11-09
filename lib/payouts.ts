/**
 * Server-only payout helpers.
 *
 * NOT a "use server" module: nothing here is callable from the browser.
 * Server actions/routes do their own authentication and authorization, then
 * use these helpers so that amounts come from the database and every reward
 * is paid at most once.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto"
import { createServerSupabaseClient } from "@/lib/supabase"
import { AUTO_APPROVE_CONFIDENCE, verifyFixImages, type FixVerification } from "@/lib/verify-fix"
import { payInvoice } from "@/lib/lightning"
import { extractInvoiceAmount, validateLightningInvoice } from "@/lib/lightning-validation"
import { sendRewardOnHoldAlert } from "@/lib/security-alerts"

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
 * - Any post with a post_funding_overrides row covering its reward
 *   (funding verified out of band; server-only table).
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

  // Funding verified out of band (server-only table, no browser access)
  const { data: override } = await admin
    .from("post_funding_overrides")
    .select("amount")
    .eq("post_id", post.id)
    .maybeSingle()
  if (override && Number(override.amount) >= post.reward) return true

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

/* ------------------------------------------------------------------ */
/* Funding-invoice provenance                                         */
/* ------------------------------------------------------------------ */

/** Memo prefix of invoices from createPostFundingInvoiceAction. */
export const POST_FUNDING_MEMO_PREFIX = "Fund anonymous post on Ganamos!"
/** Marker in the memo of L402 invoices issued by POST /api/posts. */
export const AGENT_POST_MEMO_MARKER = " to post job on Ganamos ("

/**
 * Was this node invoice issued to fund a post? Every invoice the node
 * creates has a server-chosen memo, so this tells funding invoices apart
 * from deposits, donations, orders and other L402 fees (whose settled
 * payments are already credited elsewhere and must not fund a post too).
 */
export function isPostFundingInvoiceMemo(memo: string | null | undefined): boolean {
  if (!memo || typeof memo !== "string") return false
  return memo.startsWith(POST_FUNDING_MEMO_PREFIX) || (memo.startsWith("Pay ") && memo.includes(AGENT_POST_MEMO_MARKER))
}

/* ------------------------------------------------------------------ */
/* Lightning payouts of anonymous / agent rewards                     */
/* ------------------------------------------------------------------ */

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"

/**
 * Turn a payout target (BOLT11 invoice or Lightning address) into an
 * invoice for exactly `amount` sats. Amountless invoices and invoices for
 * any other amount are refused.
 */
export async function resolvePayoutInvoice(
  target: string,
  amount: number
): Promise<{ ok: true; invoice: string } | { ok: false; error: string }> {
  if (!target || typeof target !== "string") return { ok: false, error: "A payout invoice or Lightning address is required." }
  const trimmed = target.trim()
  let invoice = trimmed

  const isAddress = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)
  if (isAddress) {
    try {
      const [user, domain] = trimmed.toLowerCase().split("@")
      const lookup = await fetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`)
      if (!lookup.ok) return { ok: false, error: "Failed to look up Lightning address." }
      const lookupData = await lookup.json()
      if (!lookupData?.callback) return { ok: false, error: "Invalid Lightning address response." }
      const callbackUrl = new URL(lookupData.callback)
      if (callbackUrl.protocol !== "https:") return { ok: false, error: "Invalid Lightning address callback." }
      callbackUrl.searchParams.set("amount", String(amount * 1000))
      const invoiceResponse = await fetch(callbackUrl.toString())
      if (!invoiceResponse.ok) return { ok: false, error: "Failed to get an invoice from the Lightning address." }
      const invoiceData = await invoiceResponse.json()
      if (!invoiceData?.pr || typeof invoiceData.pr !== "string") return { ok: false, error: "Invalid invoice from the Lightning address." }
      invoice = invoiceData.pr.trim()
    } catch (error) {
      console.error("[resolvePayoutInvoice] Lightning address lookup failed:", error)
      return { ok: false, error: "Failed to resolve the Lightning address." }
    }
  }

  if (!validateLightningInvoice(invoice)) return { ok: false, error: "Invalid Lightning invoice." }
  const invoiceAmount = extractInvoiceAmount(invoice)
  if (invoiceAmount !== amount) {
    return {
      ok: false,
      error: `The invoice must be for exactly ${amount} sats (got ${invoiceAmount === null ? "no amount" : `${invoiceAmount} sats`}).`,
    }
  }
  return { ok: true, invoice }
}

export type LightningRewardPayoutResult =
  | { success: true; paymentHash: string | null; amount: number }
  | { success: false; error: string; code: "not_available" | "unfunded" | "invalid_invoice" | "payment_failed" | "on_hold" | "record_failed" }

/**
 * Pay a fixed post's reward to an anonymous / agent fixer over Lightning,
 * at most once. The caller must already have authorized the payout.
 *
 * - The post must be fixed with no registered fixer, funded, not deleted,
 *   unpaid and unlocked; a lock is taken atomically before anything is paid.
 * - The amount always comes from the post; the invoice must match it exactly.
 * - A definitive LND payment_error releases the lock (nothing was sent).
 *   Any other failure may have paid: the lock is kept, the admin is alerted,
 *   and no retry can pay again until someone reconciles it.
 */
export async function payAnonymousRewardViaLightning(
  admin: SupabaseClient,
  params: { postId: string; target: string; source: string; requireAnonymousFixer?: boolean }
): Promise<LightningRewardPayoutResult> {
  const { postId, target, source } = params

  // Without node credentials nothing can be sent: fail before locking.
  if (!process.env.LND_REST_URL || !process.env.LND_ADMIN_MACAROON) {
    return { success: false, error: "Lightning payment system is currently unavailable.", code: "not_available" }
  }

  if (!(await isPostRewardFunded(admin, { id: postId }))) {
    console.error("SECURITY: Lightning payout attempted for unfunded post", { postId, source })
    return { success: false, error: "This post's reward was never funded.", code: "unfunded" }
  }

  const lockId = randomUUID()
  let lockQuery = admin
    .from("posts")
    .update({ anonymous_reward_payment_lock: lockId })
    .eq("id", postId)
    .eq("fixed", true)
    .is("fixed_by", null)
    .is("deleted_at", null)
    .is("reward_paid_at", null)
    .is("anonymous_reward_paid_at", null)
    .is("anonymous_reward_payment_lock", null)
  if (params.requireAnonymousFixer) lockQuery = lockQuery.eq("fixed_by_is_anonymous", true)
  const { data: locked, error: lockError } = await lockQuery.select("id, reward, title")
  const post = Array.isArray(locked) ? locked[0] : null
  if (lockError || !post) {
    return { success: false, error: "Reward unavailable, already paid, or being processed.", code: "not_available" }
  }

  const releaseLock = async () => {
    await admin
      .from("posts")
      .update({ anonymous_reward_payment_lock: null })
      .eq("id", postId)
      .eq("anonymous_reward_payment_lock", lockId)
  }

  const reward = Number(post.reward)
  if (!Number.isInteger(reward) || reward <= 0) {
    await releaseLock()
    return { success: false, error: "This post has no reward to pay.", code: "not_available" }
  }

  const resolved = await resolvePayoutInvoice(target, reward)
  if (!resolved.ok) {
    await releaseLock()
    return { success: false, error: resolved.error, code: "invalid_invoice" }
  }

  let paymentResult: any
  try {
    paymentResult = await payInvoice(resolved.invoice)
  } catch (error) {
    paymentResult = { success: false, error: error instanceof Error ? error.message : String(error) }
  }

  if (!paymentResult?.success) {
    if (paymentResult?.details?.payment_error) {
      await releaseLock()
      return { success: false, error: "Lightning payment failed. Try a different invoice.", code: "payment_failed" }
    }
    console.error("SECURITY: Lightning reward payout outcome uncertain; keeping lock", { postId, lockId, source })
    await sendRewardOnHoldAlert({ postId, amount: reward, source, error: String(paymentResult?.error ?? "unknown") })
    return {
      success: false,
      error: "The payment could not be confirmed. The reward is on hold; please contact support.",
      code: "on_hold",
    }
  }

  const paymentHash: string | null = paymentResult.paymentHash || paymentResult.paymentPreimage || null
  const now = new Date().toISOString()
  // The lock stays set; anonymous_reward_paid_at is the permanent marker.
  const { error: markError } = await admin
    .from("posts")
    .update({ anonymous_reward_paid_at: now, anonymous_reward_payment_hash: paymentHash })
    .eq("id", postId)
    .eq("anonymous_reward_payment_lock", lockId)
  if (markError) {
    console.error("CRITICAL: reward paid but not recorded", { postId, lockId, markError })
    await sendRewardOnHoldAlert({ postId, amount: reward, source, error: `paid, not recorded: ${markError.message}` })
    return { success: false, error: "Payment was sent but our records could not be updated. Please contact support.", code: "record_failed" }
  }

  await admin.from("activities").insert({
    id: randomUUID(),
    user_id: null,
    type: "reward",
    related_id: postId,
    related_table: "posts",
    timestamp: now,
    metadata: { amount: reward, payment_hash: paymentHash, payment_method: "lightning", is_anonymous: true },
  })
  const { error: txError } = await admin.from("transactions").insert({
    id: randomUUID(),
    user_id: SYSTEM_USER_ID,
    type: "internal",
    amount: reward,
    status: "completed",
    payment_hash: paymentHash,
    memo: `Anonymous fix reward payout for post ${postId}`,
    created_at: now,
    updated_at: now,
  })
  if (txError) console.error("Error creating anonymous reward audit transaction:", txError)

  return { success: true, paymentHash, amount: reward }
}

/**
 * Record an agent fixer's L402 payment hash (their credential for status
 * polling and claims) and optional payout target on a fix they just
 * submitted. Server-only: call after verifying the L402 token.
 */
export async function recordAgentFixPayoutDetails(
  admin: SupabaseClient,
  params: { postId: string; paymentHash: string; payoutInvoice?: string | null }
): Promise<boolean> {
  const update: Record<string, string> = { submitted_fix_payment_hash: params.paymentHash }
  if (params.payoutInvoice) update.submitted_fix_payout_invoice = params.payoutInvoice.trim()
  const { data, error } = await admin
    .from("posts")
    .update(update)
    .eq("id", params.postId)
    .eq("under_review", true)
    .is("submitted_fix_by_id", null)
    .is("submitted_fix_payment_hash", null)
    .select("id")
  if (error) console.error("[recordAgentFixPayoutDetails] failed:", error)
  return !error && !!data?.length
}
