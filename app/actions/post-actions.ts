"use server"

import { createInvoice, checkInvoice } from "@/lib/lightning"
import { v4 as uuidv4 } from "uuid" // Ensure uuid is imported if used, e.g. in createFundedAnonymousPostAction
import { createServerSupabaseClient } from "@/lib/supabase" // For createFundedAnonymousPostAction
import { validateLightningInvoice, validateInvoiceAmount } from "@/lib/lightning-validation"
import { sendRewardOnHoldAlert } from "@/lib/security-alerts"
import { sendFixSubmittedForReviewEmail, sendIssueFixedEmail, sendRewardEarnedEmail, sendGroupAdminClosedIssueEmail } from "@/lib/transaction-emails"
import { alertLargePostBounty } from "@/lib/sms-alerts"
import { checkPostRewardCap, checkLivePostsCap, checkBalanceCap } from "@/lib/safety-caps"
import { AUTO_APPROVE_CONFIDENCE, createAdminClient, generateClaimToken, isPostFundingInvoiceMemo, isPostRewardFunded, payAnonymousRewardViaLightning, payFixReward, resolvePayoutInvoice, verifyClaimToken, verifyFixForPost } from "@/lib/payouts"

async function getCookieStore() {
  const { cookies } = await import("next/headers")
  return cookies()
}

/**
 * Helper function to send fix submitted emails to all group admins
 * This enables any group admin to approve fixes, not just the post owner
 */
async function sendFixSubmittedEmailsToGroupAdmins(params: {
  adminSupabase: ReturnType<typeof createServerSupabaseClient>
  groupId: string
  postOwnerId: string
  issueTitle: string
  fixerName: string
  postId: string
  aiAnalysis?: string | null
  beforeImageUrl?: string | null
  afterImageUrl?: string | null
  proofOfCompletionText?: string | null
  fixerNote?: string | null
}): Promise<void> {
  const { adminSupabase, groupId, postOwnerId, issueTitle, fixerName, postId, aiAnalysis, beforeImageUrl, afterImageUrl, proofOfCompletionText, fixerNote } = params
  
  // Get all group admins except the post owner (they already got emailed)
  const { data: groupAdmins, error: adminsError } = await adminSupabase
    .from('group_members')
    .select(`
      user_id,
      profiles(email, name)
    `)
    .eq('group_id', groupId)
    .eq('role', 'admin')
    .eq('status', 'approved')
    .neq('user_id', postOwnerId)
  
  if (adminsError) {
    console.error('Error fetching group admins for email:', adminsError)
    return
  }
  
  // Send email to each group admin
  // IMPORTANT: Must await each email send in serverless functions
  for (const admin of groupAdmins || []) {
    const profile = admin.profiles as { email: string; name: string } | null
    if (profile?.email && !profile.email.includes('@ganamos.app')) {
      try {
        await sendFixSubmittedForReviewEmail({
          toEmail: profile.email,
          userName: profile.name || 'User',
          issueTitle: issueTitle,
          fixerName: fixerName,
          date: new Date(),
          postId: postId,
          aiAnalysis: aiAnalysis,
          beforeImageUrl: beforeImageUrl,
          afterImageUrl: afterImageUrl,
          proofOfCompletionText: proofOfCompletionText,
          fixerNote: fixerNote,
        })
        console.log(`Fix review email sent to group admin: ${profile.email}`)
      } catch (error) {
        console.error(`Error sending fix submitted email to group admin ${profile.email}:`, error)
      }
    }
  }
}

/**
 * Pays Lightning address for an approved anonymous fix submission
 * This is called when a fix is approved and the anonymous user provided a Lightning address
 */
export async function payAnonymousFixLightningAddressAction(
  postId: string,
  /** IGNORED: the payout always goes to the address the fixer submitted (stored on the post). */
  _lightningAddress?: string,
): Promise<{ success: boolean; paymentHash?: string; error?: string }> {
  if (!postId) {
    return { success: false, error: "Post ID is required." }
  }

  // SECURITY: only the post owner (or a group admin) approves and pays out.
  const cookieStore = await getCookieStore()
  const authClient = createServerSupabaseClient({ cookieStore })
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const supabase = createAdminClient()
  let lockId: string | null = null
  // Once we've tried to pay, never release the lock (a retry could pay twice)
  let paymentAttempted = false
  const releaseLock = async () => {
    if (!lockId) return
    await supabase
      .from("posts")
      .update({ anonymous_reward_payment_lock: null })
      .eq("id", postId)
      .eq("anonymous_reward_payment_lock", lockId)
  }

  try {
    // Fetch the post
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: "Post not found." }
    }

    let isAuthorized = post.user_id === user.id
    if (!isAuthorized && post.group_id) {
      const { data: membership } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", post.group_id)
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle()
      isAuthorized = membership?.role === "admin"
    }
    if (!isAuthorized) {
      console.error("SECURITY ALERT: unauthorized anonymous Lightning payout attempt", { postId, userId: user.id })
      return { success: false, error: "Only the post owner can approve this fix." }
    }

    if (post.deleted_at) {
      return { success: false, error: "Post has been deleted." }
    }

    if (post.submitted_fix_by_id !== null) {
      return { success: false, error: "This fix is not anonymous." }
    }

    if (post.fixed || !post.under_review) {
      return { success: false, error: "There is no anonymous fix awaiting approval on this post." }
    }

    const lightningAddress: string | null = post.submitted_fix_lightning_address
    if (!lightningAddress) {
      return { success: false, error: "The fixer has not provided a Lightning address." }
    }

    if (!post.reward || post.reward <= 0) {
      return { success: false, error: "This post has no reward to pay." }
    }

    if (!(await isPostRewardFunded(supabase, post))) {
      console.error("SECURITY: Attempted anonymous payout for unfunded post", { postId, approverId: user.id })
      return { success: false, error: "This post's reward was never funded. Cannot issue reward." }
    }

    // ATOMIC LOCK: one payout per post
    const newLockId = uuidv4()
    const { data: locked } = await supabase
      .from("posts")
      .update({ anonymous_reward_payment_lock: newLockId })
      .eq("id", postId)
      .is("anonymous_reward_paid_at", null)
      .is("reward_paid_at", null)
      .is("anonymous_reward_payment_lock", null)
      .select("id")
    if (!locked?.length) {
      return { success: false, error: "This reward has already been paid or is being processed." }
    }
    lockId = newLockId

    // Check Lightning configuration
    const LND_REST_URL = process.env.LND_REST_URL
    const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

    if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
      await releaseLock()
      return {
        success: false,
        error: "Lightning payment system is currently unavailable.",
      }
    }

    // Invoice for exactly the stored reward (Lightning addresses resolved).
    const resolved = await resolvePayoutInvoice(lightningAddress, post.reward)
    if (!resolved.ok) {
      await releaseLock()
      return { success: false, error: resolved.error }
    }
    const invoiceToPay = resolved.invoice

    // Pay the invoice
    const { payInvoice } = await import("@/lib/lightning")
    paymentAttempted = true
    const paymentResult = await payInvoice(invoiceToPay)

    if (!paymentResult.success) {
      console.error("Failed to pay Lightning invoice:", paymentResult.error)
      // Only a definitive LND payment_error means nothing was sent. Anything
      // else (HTTP error, timeout) may have paid: keep the lock so a retry
      // can't pay twice; reconcile manually.
      if ((paymentResult as any)?.details?.payment_error) {
        await releaseLock()
        return {
          success: false,
          error: "Failed to process Lightning payment. Please check your address and try again.",
        }
      }
      console.error("SECURITY: anonymous Lightning-address payout outcome uncertain; keeping lock", { postId, lockId })
      await sendRewardOnHoldAlert({
        postId,
        amount: post.reward,
        source: "payAnonymousFixLightningAddressAction",
        error: String((paymentResult as any)?.error ?? "unknown"),
      })
      return {
        success: false,
        error: "The payment could not be confirmed. The reward is on hold; please contact support.",
      }
    }

    // Mark as paid
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        anonymous_reward_paid_at: now,
        anonymous_reward_payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
        // Approval: browser sessions can't set fixed/fixed_by, so do it here
        fixed: true,
        fixed_at: post.fixed_at || now,
        fixed_by: null,
        fixed_by_is_anonymous: true,
        fixed_image_url: post.fixed_image_url || post.submitted_fix_image_url,
        fixer_note: post.fixer_note || post.submitted_fix_note,
        fix_proof_text: post.fix_proof_text || post.submitted_fix_proof_text || null,
        under_review: false,
      })
      .eq("id", postId)
      .eq("anonymous_reward_payment_lock", lockId)

    if (updateError) {
      console.error("Error marking anonymous fix reward as paid:", updateError)
      return {
        success: false,
        error: "Payment was sent but there was an error updating our records. Please contact support.",
      }
    }

    // Create activity for the anonymous fix payment
    await supabase.from("activities").insert({
      id: uuidv4(),
      user_id: null, // Anonymous fix
      type: "reward",
      related_id: postId,
      related_table: "posts",
      timestamp: now,
      metadata: {
        amount: post.reward,
        payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
        payment_method: "lightning",
        is_anonymous: true,
      },
    })

    // Create transaction for audit trail completeness
    // Use system user (00000000-0000-0000-0000-000000000000) to track anonymous payouts
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
    const { error: txError } = await supabase.from("transactions").insert({
      id: uuidv4(),
      user_id: SYSTEM_USER_ID,
      type: "internal",
      amount: post.reward, // Positive amount (reward disbursed)
      status: "completed",
      payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
      memo: `Anonymous fix reward payout for post ${postId}`,
      created_at: now,
      updated_at: now,
    });

    if (txError) {
      console.error("Error creating anonymous reward transaction:", txError)
      // Don't fail the payment - transaction is for audit only
    } else {
      console.log(`Created transaction for anonymous reward payout: ${post.reward} sats for post ${postId}`)
    }

    return {
      success: true,
      paymentHash: paymentResult.paymentHash || paymentResult.paymentPreimage,
    }
  } catch (error) {
    if (!paymentAttempted) await releaseLock()
    console.error("Unexpected error in payAnonymousFixLightningAddressAction:", error)
    return {
      success: false,
      error: "An unexpected error occurred while processing the payment.",
    }
  }
}

/**
 * Approves an anonymous fix that has no payout address. The fixer can later
 * claim the reward into an account (claimAnonymousRewardAction) or over
 * Lightning (payAnonymousRewardAction) with their claim token.
 *
 * SECURITY: only the post owner or an approved group admin; the post must
 * have a pending anonymous submission and a funded reward. Browser sessions
 * can't set fixed / fixed_by_is_anonymous themselves (DB trigger).
 */
export async function approveAnonymousFixAction(
  postId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!postId) return { success: false, error: "Post ID is required." }

  const authClient = createServerSupabaseClient({ cookieStore: await getCookieStore() })
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = createAdminClient()
  try {
    const { data: post, error: fetchError } = await admin
      .from("posts")
      .select("id, user_id, group_id, reward, fixed, under_review, deleted_at, submitted_fix_by_id, submitted_fix_image_url, submitted_fix_note, submitted_fix_proof_text, anonymous_claim_token_hash")
      .eq("id", postId)
      .single()
    if (fetchError || !post) return { success: false, error: "Post not found." }

    let isAuthorized = post.user_id === user.id
    if (!isAuthorized && post.group_id) {
      const { data: membership } = await admin
        .from("group_members")
        .select("role")
        .eq("group_id", post.group_id)
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle()
      isAuthorized = membership?.role === "admin"
    }
    if (!isAuthorized) {
      console.error("SECURITY ALERT: unauthorized anonymous fix approval attempt", { postId, userId: user.id })
      return { success: false, error: "Only the post owner can approve this fix." }
    }

    if (post.deleted_at) return { success: false, error: "Post has been deleted." }
    if (post.fixed || !post.under_review || post.submitted_fix_by_id !== null || !post.anonymous_claim_token_hash) {
      return { success: false, error: "There is no anonymous fix awaiting approval on this post." }
    }
    if (post.reward && post.reward > 0 && !(await isPostRewardFunded(admin, { id: postId }))) {
      console.error("SECURITY: anonymous approval attempted on unfunded post", { postId, approverId: user.id })
      return { success: false, error: "This post's reward was never funded. Cannot issue reward." }
    }

    const now = new Date().toISOString()
    const { data: approved, error } = await admin
      .from("posts")
      .update({
        fixed: true,
        fixed_at: now,
        fixed_by: null,
        fixed_by_is_anonymous: true,
        fixed_image_url: post.submitted_fix_image_url,
        fixer_note: post.submitted_fix_note,
        fix_proof_text: post.submitted_fix_proof_text || null,
        under_review: false,
      })
      .eq("id", postId)
      .eq("fixed", false)
      .eq("under_review", true)
      .is("submitted_fix_by_id", null)
      .is("deleted_at", null)
      .select("id")
    if (error) {
      console.error("Error approving anonymous fix:", error)
      return { success: false, error: "Failed to approve fix." }
    }
    if (!approved?.length) return { success: false, error: "This fix has already been handled." }
    return { success: true }
  } catch (error) {
    console.error("Unexpected error in approveAnonymousFixAction:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

/**
 * Processes Lightning invoice payment for anonymous reward claims.
 * Validates the post has an unclaimed anonymous reward, decodes the invoice,
 * pays it via Lightning, and marks the reward as claimed.
 */
export async function payAnonymousRewardAction(
  postId: string,
  lightningInvoice: string,
  claimToken?: string | null,
): Promise<{
  success: boolean
  paymentHash?: string
  error?: string
  details?: any
}> {
  if (!postId || !lightningInvoice) {
    return { success: false, error: "Post ID and Lightning invoice are required." }
  }

  const supabase = createAdminClient()

  try {
    // 0. SECURITY: only the anonymous fixer (holder of the claim token issued
    // when the fix was recorded) may choose where the reward is paid.
    const { data: tokenCheck } = await supabase
      .from("posts")
      .select("anonymous_claim_token_hash")
      .eq("id", postId)
      .single()
    if (!verifyClaimToken(tokenCheck?.anonymous_claim_token_hash, claimToken)) {
      console.error("SECURITY ALERT: anonymous reward payout attempted without a valid claim token", { postId })
      return { success: false, error: "This reward can only be claimed from the device that submitted the fix." }
    }

    // Locked, funded, once-only payout of the stored reward; the invoice must
    // be for exactly the reward. Uncertain failures keep the lock (on hold).
    const payout = await payAnonymousRewardViaLightning(supabase, {
      postId,
      target: lightningInvoice,
      source: "payAnonymousRewardAction",
      requireAnonymousFixer: true,
    })
    if (!payout.success) {
      return { success: false, error: payout.error }
    }
    return { success: true, paymentHash: payout.paymentHash || undefined }
  } catch (error) {
    console.error("Unexpected error in payAnonymousRewardAction:", error)
    return {
      success: false,
      error: "An unexpected error occurred while processing the payment.",
    }
  }
}

/**
 * Creates a Lightning invoice for funding an anonymous post.
 * This invoice is intended to be paid by the anonymous user *before* the post is created.
 */
export async function createPostFundingInvoiceAction(amount: number): Promise<{
  success: boolean
  paymentRequest?: string
  rHash?: string
  error?: string
  details?: any
}> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be greater than 0." }
  }

  // Basic check for Lightning configuration (similar to createDepositInvoice)
  const LND_REST_URL = process.env.LND_REST_URL
  const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

  if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
    console.error("Lightning configuration missing in createPostFundingInvoiceAction")
    return {
      success: false,
      error: "Lightning configuration missing. Cannot create funding invoice.",
    }
  }
  try {
    new URL(LND_REST_URL.startsWith("http") ? LND_REST_URL : `https://${LND_REST_URL}`)
  } catch (e) {
    return { success: false, error: "Invalid Lightning URL format." }
  }
  if (!/^[0-9a-fA-F]+$/.test(LND_ADMIN_MACAROON)) {
    return { success: false, error: "Invalid macaroon format." }
  }

  const memo = `Fund anonymous post on Ganamos! (${amount} sats)`

  try {
    const invoiceResult = await createInvoice(amount, memo)

    if (!invoiceResult.success || !invoiceResult.paymentRequest || !invoiceResult.rHash) {
      console.error(
        "Failed to create funding invoice via Lightning library:",
        invoiceResult.error,
        invoiceResult.details,
      )
      return {
        success: false,
        error: "Failed to create funding invoice.",
        details: invoiceResult.error || invoiceResult.details,
      }
    }

    // Convert rHash to hex string if it's a Buffer
    let rHashStr = invoiceResult.rHash
    if (typeof rHashStr === "object" && rHashStr !== null && Buffer.isBuffer(rHashStr)) {
      rHashStr = rHashStr.toString("hex")
    }

    console.log(`Funding invoice created for anonymous post: ${amount} sats, rHash: ${rHashStr}`)

    return {
      success: true,
      paymentRequest: invoiceResult.paymentRequest,
      rHash: rHashStr as string,
    }
  } catch (error) {
    console.error("Unexpected error in createPostFundingInvoiceAction:", error)
    return {
      success: false,
      error: "An unexpected error occurred while creating the funding invoice.",
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Checks the status of a funding invoice for an anonymous post.
 */
export async function checkPostFundingStatusAction(rHash: string): Promise<{
  success: boolean
  settled: boolean
  error?: string
  details?: any
}> {
  if (!rHash) {
    return { success: false, settled: false, error: "rHash is required." }
  }

  // Basic check for Lightning configuration
  const LND_REST_URL = process.env.LND_REST_URL
  const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

  if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
    console.error("Lightning configuration missing in checkPostFundingStatusAction")
    return {
      success: false,
      settled: false,
      error: "Lightning configuration missing. Cannot check invoice status.",
    }
  }

  try {
    const checkResult = await checkInvoice(rHash)
    if (!checkResult.success) {
      console.error("Failed to check invoice status:", checkResult.error, checkResult.details)
      return {
        success: false,
        settled: false,
        error: "Failed to check invoice status.",
        details: checkResult.error || checkResult.details,
      }
    }

    console.log(`Invoice status for rHash ${rHash}: settled = ${checkResult.settled}`)
    return {
      success: true,
      settled: checkResult.settled || false, // Ensure settled is boolean
    }
  } catch (error) {
    console.error("Unexpected error in checkPostFundingStatusAction:", error)
    return {
      success: false,
      settled: false,
      error: "An unexpected error occurred while checking invoice status.",
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Creates the actual post in the database AFTER an anonymous user has funded it.
 */
export async function createFundedAnonymousPostAction(postDetails: {
  description: string
  reward: number
  image_url: string | null // Renamed from image to image_url to match DB
  has_image?: boolean // Optional: whether post has an image
  location: string | null // Renamed from locationName
  latitude: number | null
  longitude: number | null
  city: string | null
  funding_r_hash: string // Renamed from fundingRHash
  funding_payment_request: string // Added this
  expires_at?: string | null
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  const admin = createAdminClient()
  const supabase = admin
  const postId = uuidv4()
  const now = new Date()

  try {
    // SAFETY: Check system-wide live posts cap (200 total)
    const livePostsCapCheck = await checkLivePostsCap()
    if (!livePostsCapCheck.allowed) {
      console.warn(`[Safety Caps] Anonymous post blocked: system at ${livePostsCapCheck.currentCount}/${livePostsCapCheck.limitValue} live posts`)
      return { 
        success: false, 
        error: livePostsCapCheck.message || 'The platform has reached its limit of active posts. Please try again later.'
      }
    }

    // SAFETY: Check reward cap for anonymous posts too
    // Note: For anonymous posts, we use 'anonymous' as userId for tracking
    const rewardCapCheck = await checkPostRewardCap('00000000-0000-0000-0000-000000000000', postDetails.reward)
    if (!rewardCapCheck.allowed) {
      console.warn(`[Safety Caps] Anonymous post reward blocked: ${postDetails.reward} sats exceeds hard cap`)
      return { success: false, error: rewardCapCheck.message || 'Post reward exceeds maximum allowed amount.' }
    }

    // SECURITY: the funding invoice must actually be paid, for at least the
    // reward, and may fund only one post.
    if (
      !postDetails.funding_r_hash ||
      !/^[0-9a-f]{64}$/i.test(postDetails.funding_r_hash) ||
      !Number.isInteger(postDetails.reward) ||
      postDetails.reward < 0
    ) {
      return { success: false, error: "Invalid funding details." }
    }
    const fundingCheck = await checkInvoice(postDetails.funding_r_hash)
    const amountPaid = Number((fundingCheck as any)?.amountPaid ?? 0)
    if (!fundingCheck.success || !(fundingCheck as any).settled || amountPaid < postDetails.reward) {
      console.error("SECURITY: Anonymous post creation without a settled funding invoice", {
        rHash: postDetails.funding_r_hash.substring(0, 16),
        reward: postDetails.reward,
        amountPaid,
      })
      return { success: false, error: "Funding payment not confirmed." }
    }
    // SECURITY: only invoices issued to fund a post count. Any other settled
    // invoice on the node (a deposit, donation, order, fee) was already
    // credited or spent elsewhere and must not also fund a reward.
    if (!isPostFundingInvoiceMemo((fundingCheck as any).memo)) {
      console.error("SECURITY: Anonymous post funding with a non-funding invoice", {
        rHash: postDetails.funding_r_hash.substring(0, 16),
      })
      return { success: false, error: "Funding payment not confirmed." }
    }
    const [{ data: asDeposit }, { data: asPayment }] = await Promise.all([
      admin.from("transactions").select("id").eq("r_hash_str", postDetails.funding_r_hash).limit(1),
      admin.from("transactions").select("id").eq("payment_hash", postDetails.funding_r_hash).limit(1),
    ])
    if ((asDeposit && asDeposit.length > 0) || (asPayment && asPayment.length > 0)) {
      return { success: false, error: "This payment has already been used." }
    }
    const { data: existingFunded } = await admin
      .from("posts")
      .select("id")
      .eq("funding_r_hash", postDetails.funding_r_hash)
      .limit(1)
    if (existingFunded && existingFunded.length > 0) {
      return { success: false, error: "This payment has already been used to fund a post." }
    }

    // Service role: funding fields are reset for browser-role inserts.
    const { data, error } = await admin
      .from("posts")
      .insert({
        id: postId,
        user_id: null, // Anonymous post
        created_by: "Anonymous",
        created_by_avatar: null,
        title: postDetails.description.substring(0, 50),
        description: postDetails.description,
        image_url: postDetails.image_url || null,
        has_image: postDetails.has_image ?? (postDetails.image_url != null && postDetails.image_url.length > 0),
        location: postDetails.location,
        latitude: postDetails.latitude,
        longitude: postDetails.longitude,
        reward: postDetails.reward,
        claimed: false,
        fixed: false,
        created_at: now.toISOString(),
        group_id: null, // Anonymous posts are public
        city: postDetails.city,
        is_anonymous: true,
        funding_r_hash: postDetails.funding_r_hash,
        funding_payment_request: postDetails.funding_payment_request,
        funding_status: "paid",
        expires_at: postDetails.expires_at ?? null,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error inserting funded anonymous post:", error)
      return { success: false, error: error.message }
    }

    console.log("Funded anonymous post created successfully:", data.id)
    
    // SECURITY: Send SMS alert for large anonymous post bounties
    alertLargePostBounty('anonymous', postDetails.reward, postDetails.description.substring(0, 50))
      .catch(err => console.error("[Security Alert] SMS for large anonymous bounty failed:", err))

    if (data && data.id) {
      await supabase.from("activities").insert({
        id: uuidv4(),
        user_id: null, // Anonymous post
        type: "post",
        related_id: data.id,
        related_table: "posts",
        timestamp: now.toISOString(),
        metadata: { title: postDetails.description.substring(0, 50) },
      });

      // Publish to Nostr asynchronously (anonymous posts are always public, so publish to Nostr)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     (process.env.NODE_ENV === 'production' ? 'https://www.ganamos.earth' : 'http://localhost:3457')
      
      fetch(`${appUrl}/api/nostr/publish-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: postDetails.description.substring(0, 50),
          description: postDetails.description,
          location: postDetails.location,
          city: postDetails.city,
          latitude: postDetails.latitude,
          longitude: postDetails.longitude,
          reward: postDetails.reward,
          postId: data.id,
          imageUrl: postDetails.image_url
        })
      }).catch(error => {
        console.error('[NOSTR] Error publishing anonymous post to Nostr:', error)
        // Don't fail the post creation if Nostr publishing fails
      })
      
      // Publish to Sphinx asynchronously (anonymous posts are always public, so publish to Sphinx)
      fetch(`${appUrl}/api/sphinx/publish-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: postDetails.description.substring(0, 50),
          description: postDetails.description,
          location: postDetails.location,
          city: postDetails.city,
          latitude: postDetails.latitude,
          longitude: postDetails.longitude,
          reward: postDetails.reward,
          postId: data.id,
          imageUrl: postDetails.image_url
        })
      }).catch(error => {
        console.error('[SPHINX] Error publishing anonymous post to Sphinx:', error)
        // Don't fail the post creation if Sphinx publishing fails
      })
    }

    return { success: true, postId: data.id }
  } catch (error) {
    console.error("Unexpected error in createFundedAnonymousPostAction:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred.",
    }
  }
}

/**
 * Marks a post as fixed by an anonymous user after successful AI verification.
 * This is typically called when AI confidence is high.
 */
export async function markPostFixedAnonymouslyAction(
  postId: string,
  fixImageUrl: string | null,
  fixerNote: string | null,
  /** IGNORED: the server verifies the fix itself. */
  _aiConfidence?: number,
  _aiAnalysis?: string | null,
  _fixProofText: string | null = null,
): Promise<{ success: boolean; error?: string; claimToken?: string }> {
  // Auto-approval needs a photo the server can verify; text proofs go to review.
  if (!postId || !fixImageUrl) {
    return { success: false, error: "Post ID and a fix photo are required." }
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, user_id, title, description, reward, image_url, fixed, deleted_at, reward_paid_at, funding_status, funding_r_hash")
      .eq("id", postId)
      .single()

    if (postError || !post) {
      return { success: false, error: "Post not found." }
    }
    if (post.deleted_at) {
      return { success: false, error: "Post has been deleted." }
    }
    if (post.fixed || post.reward_paid_at) {
      return { success: false, error: "This issue has already been fixed." }
    }
    if (!(await isPostRewardFunded(supabase, post))) {
      console.error("SECURITY: Anonymous auto-approval attempted on unfunded post", { postId })
      return { success: false, error: "This post's reward was never funded." }
    }

    // SECURITY: verify on the server against the stored "before" image;
    // never trust a client-supplied confidence.
    const verification = await verifyFixForPost(post, fixImageUrl)
    if (!verification) {
      return { success: false, error: "Could not verify the fix automatically. Please submit it for review." }
    }
    if (verification.confidence < AUTO_APPROVE_CONFIDENCE) {
      return { success: false, error: "AI confidence too low for auto-approval." }
    }

    // Secret for the anonymous fixer to later claim / route the reward
    const { token: claimToken, hash: claimTokenHash } = generateClaimToken()

    const { data: claimed, error } = await supabase
      .from("posts")
      .update({
        fixed: true,
        fixed_at: now,
        fixed_by: null, // Explicitly null for anonymous
        fixed_by_is_anonymous: true,
        fixed_image_url: fixImageUrl,
        fixer_note: fixerNote,
        under_review: false, // No longer under review if auto-approved
        ai_confidence_score: verification.confidence,
        ai_analysis: verification.reasoning,
        anonymous_claim_token_hash: claimTokenHash,
        // Clear any previous submission for review fields if they existed
        submitted_fix_by_id: null,
        submitted_fix_by_name: null,
        submitted_fix_by_avatar: null,
        submitted_fix_at: null,
      })
      .eq("id", postId)
      .eq("fixed", false)
      .is("deleted_at", null)
      .select("id")

    if (error) {
      console.error("Error in markPostFixedAnonymouslyAction:", error)
      return { success: false, error: error.message }
    }
    if (!claimed?.length) {
      return { success: false, error: "This issue has already been fixed." }
    }

    const aiConfidence = verification.confidence
    const aiAnalysis = verification.reasoning

    console.log(`Post ${postId} marked as fixed anonymously.`)
    // TODO: In a later step, we'll need to handle the reward payout mechanism for anonymous users.
    // This might involve generating a claim code or a pre-image for a LNURL-withdraw.

    {
      // Fetch the post to get title and reward for metadata
      const { data: postData } = await supabase
        .from("posts")
        .select("title, reward")
        .eq("id", postId)
        .single();
      
      await supabase.from("activities").insert({
        id: uuidv4(),
        user_id: null, // Anonymous fix
        type: "fix",
        related_id: postId,
        related_table: "posts",
        timestamp: now,
        metadata: { 
          title: postData?.title,
          reward: postData?.reward,
          fixed: true,
          fixImageUrl, 
          fixerNote, 
          aiConfidence, 
          aiAnalysis 
        },
      });
    }

    return { success: true, claimToken }
  } catch (error) {
    console.error("Unexpected error in markPostFixedAnonymouslyAction:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred.",
    }
  }
}

/**
 * Saves Lightning address for an anonymous fix submission
 * This allows anonymous users to receive rewards via Lightning when their fix is approved
 */
export async function submitAnonymousFixLightningAddressAction(
  postId: string,
  lightningAddress: string,
  claimToken?: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (!postId || !lightningAddress) {
    return { success: false, error: "Post ID and Lightning address are required." }
  }

  const supabase = createAdminClient()

  try {
    // Validate the post exists and is under review with anonymous submission
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id, under_review, submitted_fix_by_id, anonymous_claim_token_hash")
      .eq("id", postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: "Post not found." }
    }

    // SECURITY: only the anonymous fixer may set where the reward is paid
    if (!verifyClaimToken(post.anonymous_claim_token_hash, claimToken)) {
      console.error("SECURITY ALERT: payout address change without a valid claim token", { postId })
      return { success: false, error: "Only the person who submitted this fix can set the payout address." }
    }

    if (!post.under_review) {
      return { success: false, error: "This post is not under review." }
    }

    if (post.submitted_fix_by_id !== null) {
      return { success: false, error: "This fix submission is not anonymous." }
    }

    // Validate Lightning address format
    const trimmed = lightningAddress.trim().toLowerCase()
    const isValid =
      (trimmed.startsWith("lnbc") ||
        trimmed.startsWith("lntb") ||
        trimmed.startsWith("lnbcrt")) &&
      trimmed.length >= 100
        ? true
        : trimmed.includes("@") && trimmed.includes(".")

    if (!isValid) {
      return {
        success: false,
        error: "Invalid Lightning address format. Please provide a Lightning invoice (lnbc...) or Lightning address (user@domain.com).",
      }
    }

    // Update the post with Lightning address
    const { error } = await supabase
      .from("posts")
      .update({
        submitted_fix_lightning_address: lightningAddress.trim(),
      })
      .eq("id", postId)
      .is("submitted_fix_by_id", null)
      .eq("under_review", true)

    if (error) {
      console.error("Error saving Lightning address:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error in submitAnonymousFixLightningAddressAction:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred.",
    }
  }
}

/**
 * Submits an anonymous fix for manual review when AI confidence is low.
 */
export async function submitAnonymousFixForReviewAction(
  postId: string,
  fixImageUrl: string | null,
  fixerNote: string | null,
  aiConfidence: number | null,
  aiAnalysis: string | null,
  fixProofText: string | null = null,
  /** IGNORED (see note below). */
  _l402PaymentHash: string | null = null,
  /** IGNORED (see note below). */
  _payoutInvoice: string | null = null,
): Promise<{ success: boolean; error?: string; claimToken?: string }> {
  if (!postId || (!fixImageUrl && !fixProofText)) {
    return { success: false, error: "Post ID and either a fix image or proof text are required." }
  }
  const supabase = createServerSupabaseClient(await getCookieStore())

  try {
    // SECURITY: Check if this is an anonymous post BEFORE claiming
    // For anonymous posts (no owner), only high-confidence AI can approve
    // Low-confidence fixes should be rejected since there's no one to manually review them
    // EXCEPTION: Image-less posts (aiConfidence === null) are allowed for manual review
    const { data: postCheck, error: postCheckError } = await supabase
      .from("posts")
      .select("user_id, has_image")
      .eq("id", postId)
      .single()

    if (postCheckError || !postCheck) {
      console.error("Error checking post in submitAnonymousFixForReviewAction:", postCheckError)
      return { success: false, error: "Post not found." }
    }

    if (!postCheck.user_id && aiConfidence !== null && aiConfidence < 7 && postCheck.has_image !== false) {
      console.log(`[Security] Rejecting low-confidence fix for anonymous post ${postId}. AI confidence: ${aiConfidence}`)
      return {
        success: false,
        error: "For anonymous posts, we need higher AI confidence to verify fixes. Please try again with a clearer, well-lit photo showing the fix more clearly."
      }
    }

    // Use atomic claim to prevent race conditions when multiple people try to claim the same job
    const { data: claimResult, error: claimError } = await supabase.rpc(
      'atomic_claim_job',
      {
        p_job_id: postId,
        p_fixer_id: null, // Anonymous submission
        p_fixer_name: "Anonymous Fixer (Pending Review)",
        p_fixer_avatar: null,
        p_fix_note: fixerNote,
        p_fix_image_url: fixImageUrl,
        p_fix_proof_text: fixProofText,
        p_lightning_address: null,
        p_ai_confidence: aiConfidence,
        p_ai_analysis: aiAnalysis
      }
    )

    if (claimError) {
      console.error("Error in submitAnonymousFixForReviewAction (atomic claim):", claimError)
      return { success: false, error: claimError.message }
    }

    // Check if the atomic claim succeeded
    if (!claimResult?.success) {
      const errorMessage = claimResult?.error || "Job is no longer available"
      console.log(`[Anonymous Fix] Claim failed: ${errorMessage}`)
      
      if (claimResult?.error === "Job not found") {
        return { success: false, error: "Post not found." }
      }
      
      // Job was already claimed/fixed/under_review
      return { success: false, error: "This job has already been claimed by someone else." }
    }

    // Secret proving this browser/agent is the anonymous fixer (needed to add a
    // payout address, link an account or claim the reward later).
    const { token: claimToken, hash: claimTokenHash } = generateClaimToken()
    {
      const { error: tokenError } = await createAdminClient()
        .from("posts")
        .update({ anonymous_claim_token_hash: claimTokenHash })
        .eq("id", postId)
      if (tokenError) {
        console.error("Error storing anonymous claim token:", tokenError)
      }
    }

    // NOTE: l402PaymentHash / payoutInvoice are ignored here (this action is
    // callable from browsers). POST /api/fixes records them with the service
    // role after verifying the L402 token (recordAgentFixPayoutDetails).

    // Claim succeeded - now fetch post data for email notifications
    const { data: postData, error: fetchError } = await supabase
      .from("posts")
      .select("user_id, title, reward, group_id, image_url")
      .eq("id", postId)
      .single()

    if (fetchError) {
      // Job was claimed successfully but we couldn't fetch details for email
      // Don't fail - the claim already succeeded
      console.error("Error fetching post after claim in submitAnonymousFixForReviewAction:", fetchError)
    }

    // Use admin supabase to create activity and send email
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Create activity for the post owner (anonymous fixer doesn't have an account yet)
    if (postData?.user_id) {
      const now = new Date().toISOString()
      await adminSupabase.from("activities").insert({
        id: uuidv4(),
        user_id: postData.user_id,
        type: "fix_received",
        related_id: postId,
        related_table: "posts",
        timestamp: now,
        metadata: {
          title: postData.title || "Your issue",
          status: "pending_review",
          fixer_name: "Anonymous Fixer",
          is_anonymous: true,
        },
      })

      // Send email notification to post owner
      const { data: ownerProfile } = await adminSupabase
        .from("profiles")
        .select("email, name")
        .eq("id", postData.user_id)
        .single()

      if (ownerProfile?.email && !ownerProfile.email.includes('@ganamos.app')) {
        // IMPORTANT: Must await email send in serverless functions, otherwise
        // the function may terminate before the promise resolves
        console.log(`[EMAIL FLOW] Starting anonymous fix email send to: ${ownerProfile.email}`)
        const emailStartTime = Date.now()
        try {
          const emailResult = await sendFixSubmittedForReviewEmail({
            toEmail: ownerProfile.email,
            userName: ownerProfile.name || "User",
            issueTitle: postData.title || "Your issue",
            fixerName: "Anonymous Fixer",
            date: new Date(),
            postId: postId,
            aiAnalysis: aiAnalysis,
            beforeImageUrl: postData.image_url,
            afterImageUrl: fixImageUrl,
            proofOfCompletionText: fixProofText,
            fixerNote: fixerNote,
          })
          const emailDuration = Date.now() - emailStartTime
          console.log(`[EMAIL FLOW] Anonymous fix email completed in ${emailDuration}ms, result:`, JSON.stringify(emailResult))
        } catch (error) {
          const emailDuration = Date.now() - emailStartTime
          console.error(`[EMAIL FLOW] Anonymous fix email failed after ${emailDuration}ms:`, error)
        }
      }
      
      // Also send email to all other group admins (so any admin can approve)
      if (postData.group_id) {
        // IMPORTANT: Must await email send in serverless functions
        try {
          await sendFixSubmittedEmailsToGroupAdmins({
            adminSupabase,
            groupId: postData.group_id,
            postOwnerId: postData.user_id,
            issueTitle: postData.title || "Your issue",
            fixerName: "Anonymous Fixer",
            postId: postId,
            aiAnalysis: aiAnalysis,
            beforeImageUrl: postData.image_url,
            afterImageUrl: fixImageUrl,
            proofOfCompletionText: fixProofText,
            fixerNote: fixerNote,
          })
          console.log(`Fix review emails sent to group admins for group: ${postData.group_id}`)
        } catch (error) {
          console.error("Error sending fix submitted emails to group admins:", error)
        }
      }
    }

    console.log(`Anonymous fix for post ${postId} submitted for review.`)
    return { success: true, claimToken }
  } catch (error) {
    console.error("Unexpected error in submitAnonymousFixForReviewAction:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred.",
    }
  }
}

/**
 * Submits a logged-in user's fix for manual review when AI confidence is low.
 */
export async function submitLoggedInFixForReviewAction(params: {
  postId: string
  userId: string
  fixImageUrl: string | null
  fixerNote: string | null
  aiConfidence: number | null
  aiAnalysis: string | null
  fixProofText?: string | null
}): Promise<{ success: boolean; error?: string }> {
  'use server'
  
  const { postId, userId, fixImageUrl, fixerNote, aiConfidence, aiAnalysis, fixProofText } = params

  if (!postId || !userId || (!fixImageUrl && !fixProofText)) {
    return { success: false, error: "Post ID, User ID, and either a fix image or proof text are required." }
  }

  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })

    // SECURITY: Require session and verify userId matches authenticated user OR is a connected account
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' }
    }

    // SECURITY: Verify the userId parameter matches authenticated session OR is a connected account
    const isOwnAccount = session.user.id === userId
    const isConnectedAccount = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('primary_user_id', session.user.id)
      .eq('connected_user_id', userId)
      .maybeSingle()
    
    if (!isOwnAccount && !isConnectedAccount.data) {
      console.error('SECURITY ALERT: User attempted to submit fix as another user', {
        authenticatedUserId: session.user.id,
        requestedUserId: userId,
        postId,
        isOwnAccount,
        hasConnectedAccountRecord: !!isConnectedAccount.data
      })
      return { success: false, error: 'Unauthorized: Cannot submit fix as another user' }
    }

    // SECURITY: Check if this is an anonymous post BEFORE claiming
    // For anonymous posts (no owner), only high-confidence AI can approve
    // Low-confidence fixes should be rejected since there's no one to manually review them
    // EXCEPTION: Image-less posts (aiConfidence === null) are allowed for manual review
    const { data: postCheck, error: postCheckError } = await supabase
      .from('posts')
      .select('user_id, has_image')
      .eq('id', postId)
      .single()

    if (postCheckError || !postCheck) {
      console.error('Error checking post in submitLoggedInFixForReviewAction:', postCheckError)
      return { success: false, error: 'Post not found.' }
    }

    if (!postCheck.user_id && aiConfidence !== null && aiConfidence < 7 && postCheck.has_image !== false) {
      console.log(`[Security] Rejecting low-confidence fix for anonymous post ${postId}. AI confidence: ${aiConfidence}`)
      return {
        success: false,
        error: "For anonymous posts, we need higher AI confidence to verify fixes. Please try again with a clearer, well-lit photo showing the fix more clearly."
      }
    }

    // Get user profile for name and avatar
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', userId)
      .single()

    // Use atomic claim to prevent race conditions when multiple people try to claim the same job
    const { data: claimResult, error: claimError } = await supabase.rpc(
      'atomic_claim_job',
      {
        p_job_id: postId,
        p_fixer_id: userId,
        p_fixer_name: userProfile?.name || 'Unknown User',
        p_fixer_avatar: userProfile?.avatar_url || null,
        p_fix_note: fixerNote,
        p_fix_image_url: fixImageUrl,
        p_fix_proof_text: fixProofText || null,
        p_lightning_address: null,
        p_ai_confidence: aiConfidence,
        p_ai_analysis: aiAnalysis
      }
    )

    if (claimError) {
      console.error('Error in submitLoggedInFixForReviewAction (atomic claim):', claimError)
      return { success: false, error: claimError.message }
    }

    // Check if the atomic claim succeeded
    if (!claimResult?.success) {
      const errorMessage = claimResult?.error || "Job is no longer available"
      console.log(`[Logged-in Fix] Claim failed: ${errorMessage}`)
      
      if (claimResult?.error === "Job not found") {
        return { success: false, error: 'Post not found.' }
      }
      
      // Job was already claimed/fixed/under_review
      return { success: false, error: 'This job has already been claimed by someone else.' }
    }

    // Claim succeeded - now fetch post data for email notifications
    const { data: postData, error: fetchError } = await supabase
      .from('posts')
      .select('user_id, title, reward, group_id, image_url')
      .eq('id', postId)
      .single()

    if (fetchError || !postData) {
      // Job was claimed successfully but we couldn't fetch details for email
      // Don't fail - the claim already succeeded
      console.error('Error fetching post after claim in submitLoggedInFixForReviewAction:', fetchError)
      console.log(`Logged-in user fix for post ${postId} submitted for review (skipping notifications).`)
      return { success: true }
    }

    // Use admin supabase for activities (bypasses RLS for creating activities for other users)
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    const now = new Date().toISOString()

    // Create activity for the fixer
    await adminSupabase.from('activities').insert({
      id: uuidv4(),
      user_id: userId,
      type: 'fix_submitted',
      related_id: postId,
      related_table: 'posts',
      timestamp: now,
      metadata: {
        title: postData.title || 'Issue',
        status: 'pending_review',
        reward: postData.reward || 0,
      },
    })

    // Create activity for the post owner (if different from fixer)
    if (postData.user_id && postData.user_id !== userId) {
      await adminSupabase.from('activities').insert({
        id: uuidv4(),
        user_id: postData.user_id,
        type: 'fix_received',
        related_id: postId,
        related_table: 'posts',
        timestamp: now,
        metadata: {
          title: postData.title || 'Your issue',
          status: 'pending_review',
          fixer_name: userProfile?.name || 'Someone',
          fixer_id: userId,
        },
      })

      // Send email notification to post owner
      const { data: ownerProfile } = await adminSupabase
        .from('profiles')
        .select('email, name')
        .eq('id', postData.user_id)
        .single()

      if (ownerProfile?.email && !ownerProfile.email.includes('@ganamos.app')) {
        // IMPORTANT: Must await email send in serverless functions, otherwise
        // the function may terminate before the promise resolves
        console.log(`[EMAIL FLOW] Starting email send to: ${ownerProfile.email}`)
        const emailStartTime = Date.now()
        try {
          const emailResult = await sendFixSubmittedForReviewEmail({
            toEmail: ownerProfile.email,
            userName: ownerProfile.name || 'User',
            issueTitle: postData.title || 'Your issue',
            fixerName: userProfile?.name || 'Someone',
            date: new Date(),
            postId: postId,
            aiAnalysis: aiAnalysis,
            beforeImageUrl: postData.image_url,
            afterImageUrl: fixImageUrl,
            proofOfCompletionText: fixProofText,
            fixerNote: fixerNote,
          })
          const emailDuration = Date.now() - emailStartTime
          console.log(`[EMAIL FLOW] Email completed in ${emailDuration}ms, result:`, JSON.stringify(emailResult))
        } catch (error) {
          const emailDuration = Date.now() - emailStartTime
          console.error(`[EMAIL FLOW] Email failed after ${emailDuration}ms:`, error)
          // Don't fail the submission if email fails
        }
      }
      
      // Also send email to all other group admins (so any admin can approve)
      if (postData.group_id) {
        // IMPORTANT: Must await email send in serverless functions
        try {
          await sendFixSubmittedEmailsToGroupAdmins({
            adminSupabase,
            groupId: postData.group_id,
            postOwnerId: postData.user_id,
            issueTitle: postData.title || 'Your issue',
            fixerName: userProfile?.name || 'Someone',
            postId: postId,
            aiAnalysis: aiAnalysis,
            beforeImageUrl: postData.image_url,
            afterImageUrl: fixImageUrl,
            proofOfCompletionText: fixProofText,
            fixerNote: fixerNote,
          })
          console.log(`Fix review emails sent to group admins for group: ${postData.group_id}`)
        } catch (error) {
          console.error('Error sending fix submitted emails to group admins:', error)
        }
      }
    }

    console.log(`[EMAIL FLOW] All email sends complete, returning success`)
    console.log(`Logged-in user fix for post ${postId} submitted for review by user ${userId}`)
    return { success: true }
  } catch (error) {
    console.error('Unexpected error in submitLoggedInFixForReviewAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred.',
    }
  }
}

/**
 * Associate an anonymous fix submission with a new user account
 * This is called when a user creates an account after submitting an anonymous fix
 */
export async function associateAnonymousFixWithAccountAction(
  postId: string,
  userId: string,
  claimToken?: string | null,
): Promise<{ success: boolean; error?: string }> {
  'use server'
  
  try {
    // SECURITY: caller must be signed in as the account being linked
    const authClient = createServerSupabaseClient({ cookieStore: await getCookieStore() })
    const { data: { user } } = await authClient.auth.getUser()
    if (!user || user.id !== userId) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = createAdminClient()
    
    // Get the post and verify it's an anonymous fix submission under review
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, anonymous_claim_token_hash')
      .eq('id', postId)
      .eq('under_review', true)
      .is('submitted_fix_by_id', null)
      .single()
    
    if (postError || !post) {
      return { success: false, error: 'Anonymous fix submission not found or already associated' }
    }

    // SECURITY: only the anonymous fixer (claim token holder) can link it
    if (!verifyClaimToken(post.anonymous_claim_token_hash, claimToken)) {
      console.error('SECURITY ALERT: anonymous fix association without a valid claim token', { postId, userId })
      return { success: false, error: 'This fix can only be linked from the device that submitted it' }
    }
    
    // Update the post to associate with the user
    const { data: updated, error: updateError } = await supabase
      .from('posts')
      .update({
        submitted_fix_by_id: userId,
      })
      .eq('id', postId)
      .is('submitted_fix_by_id', null)
      .select('id')
    
    if (updateError || !updated?.length) {
      console.error('Error associating anonymous fix with account:', updateError)
      return { success: false, error: 'Failed to associate fix with account' }
    }
    
    console.log(`Associated anonymous fix submission ${postId} with user ${userId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in associateAnonymousFixWithAccountAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Claim an anonymous reward after user creates an account
 * This associates the anonymous fix with the new user and credits their balance
 */
export async function claimAnonymousRewardAction(
  postId: string,
  userId: string,
  claimToken?: string | null,
): Promise<{ success: boolean; error?: string; amount?: number }> {
  'use server'
  
  try {
    // SECURITY: caller must be signed in as the account being credited
    const authClient = createServerSupabaseClient({ cookieStore: await getCookieStore() })
    const { data: { user } } = await authClient.auth.getUser()
    if (!user || user.id !== userId) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = createAdminClient()
    
    // Get the post and verify it was fixed anonymously and reward not yet paid
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, title, reward, anonymous_claim_token_hash')
      .eq('id', postId)
      .eq('fixed', true) // approved (server-side) fix
      .is('fixed_by', null)
      .eq('fixed_by_is_anonymous', true)
      .is('deleted_at', null)
      .is('anonymous_reward_paid_at', null)
      .is('reward_paid_at', null)
      .single()
    
    if (postError || !post) {
      return { success: false, error: 'Anonymous reward not found or already claimed' }
    }

    // SECURITY: only the anonymous fixer (claim token holder) can claim
    if (!verifyClaimToken(post.anonymous_claim_token_hash, claimToken)) {
      console.error('SECURITY ALERT: anonymous reward claim without a valid claim token', { postId, userId })
      return { success: false, error: 'This reward can only be claimed from the device that submitted the fix' }
    }
    
    // SECURITY: never pay a reward that was not funded
    if (post.reward && post.reward > 0 && !(await isPostRewardFunded(supabase, { id: postId }))) {
      console.error('SECURITY: anonymous reward claim on unfunded post', { postId, userId })
      return { success: false, error: "This post's reward was never funded." }
    }

    // Associate the fix with the user (only while still anonymous and unpaid)
    const { data: associated, error: updatePostError } = await supabase
      .from('posts')
      .update({
        fixed_by: userId,
        fixed_by_is_anonymous: false, // Now associated with a user
      })
      .eq('id', postId)
      .eq('fixed', true)
      .is('fixed_by', null)
      .eq('fixed_by_is_anonymous', true)
      .is('anonymous_reward_paid_at', null)
      .is('anonymous_reward_payment_lock', null)
      .select('id')
    
    if (updatePostError || !associated?.length) {
      console.error('Error updating post:', updatePostError)
      return { success: false, error: 'Reward unavailable or already being processed' }
    }

    if (!post.reward || post.reward <= 0) {
      return { success: true, amount: 0 }
    }
    
    // Pay the stored reward exactly once (atomic in the database)
    const payout = await payFixReward(supabase, {
      postId,
      fixerId: userId,
      memo: `Fix reward earned: ${post.title || 'Issue fixed'}`,
    })
    
    if (!payout.success) {
      console.error('Error crediting claimed anonymous reward:', payout.error)
      if (payout.code !== 'reward_already_paid') {
        await supabase
          .from('posts')
          .update({ fixed_by: null, fixed_by_is_anonymous: true })
          .eq('id', postId)
          .eq('fixed_by', userId)
          .is('reward_paid_at', null)
      }
      return { success: false, error: 'Failed to credit reward' }
    }

    await notifyFixRewardPaid({
      postId,
      fixerId: userId,
      reward: payout.amount,
      postTitle: post.title,
      transactionId: payout.transactionId,
      isPostOwnerClosing: false,
    })
    
    console.log(`Claimed anonymous reward: ${payout.amount} sats for user ${userId}, transaction: ${payout.transactionId}`)
    return { success: true, amount: payout.amount }
  } catch (error) {
    console.error('Error in claimAnonymousRewardAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Create a transaction when a user posts an issue with a reward
 * This ensures the balance audit can correctly track post reward deductions
 */
export async function createPostWithRewardAction(params: {
  postId: string
  userId: string
  title: string
  description: string
  imageUrl?: string | null
  hasImage?: boolean
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  reward: number
  groupId?: string | null
  assignedTo?: string | null
  city?: string | null
  createdBy?: string | null
  createdByAvatar?: string | null
  expiresAt?: string | null
  memo?: string
}): Promise<{ success: boolean; error?: string; transactionId?: string; newBalance?: number }> {
  'use server'
  
  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })
    const { postId, userId, reward, memo } = params

    // SECURITY: Require session and verify userId matches authenticated user OR is a connected account
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' }
    }

    // SECURITY: Verify the userId parameter matches authenticated session OR is a connected account
    const isOwnAccount = session.user.id === userId
    const isConnectedAccount = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('primary_user_id', session.user.id)
      .eq('connected_user_id', userId)
      .maybeSingle()
    
    if (!isOwnAccount && !isConnectedAccount.data) {
      console.error('SECURITY ALERT: User attempted to deduct balance from another account', {
        authenticatedUserId: session.user.id,
        requestedUserId: userId,
        postId,
        isOwnAccount,
        hasConnectedAccountRecord: !!isConnectedAccount.data
      })
      return { success: false, error: 'Unauthorized: Cannot modify another user\'s balance' }
    }

    if (!postId || !userId || !params.title.trim() || !params.description.trim() || reward < 0) {
      return { success: false, error: 'Invalid parameters' }
    }

    const { data, error } = await supabase.rpc('create_post_atomic', {
      p_post_id: postId,
      p_user_id: userId,
      p_title: params.title,
      p_description: params.description,
      p_image_url: params.imageUrl ?? null,
      p_has_image: params.hasImage ?? Boolean(params.imageUrl),
      p_location: params.location ?? null,
      p_latitude: params.latitude ?? null,
      p_longitude: params.longitude ?? null,
      p_reward: reward,
      p_group_id: params.groupId ?? null,
      p_assigned_to: params.assignedTo ?? null,
      p_city: params.city ?? null,
      p_created_by: params.createdBy ?? null,
      p_created_by_avatar: params.createdByAvatar ?? null,
      p_expires_at: params.expiresAt ?? null,
      p_memo: memo ?? null,
    })

    if (error) {
      console.error('Atomic post creation failed:', error)
      return { success: false, error: error.message || 'Failed to create post' }
    }

    const result = data as unknown as {
      success: boolean
      transaction_id?: string | null
      new_balance?: number
    }
    
    // SECURITY: Send SMS alert for large post bounties
    if (reward > 0) alertLargePostBounty(userId, reward, memo)
      .catch(err => console.error("[Security Alert] SMS for large bounty failed:", err))
    
    return {
      success: result.success,
      transactionId: result.transaction_id ?? undefined,
      newBalance: result.new_balance,
    }
  } catch (error) {
    console.error('Error in createPostWithRewardAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Create a transaction when a user fixes an issue and earns a reward
 * This ensures the balance audit can correctly track fix reward earnings
 * 
 * When fixDetails is provided (for high-confidence AI fixes), this also
 * updates the posts table to mark it as fixed. This is needed because
 * the fixer may not be the post owner, so client-side RLS would block the update.
 */
/**
 * Activity records and emails after a fix reward has been paid.
 * Not exported: server-internal only.
 */
async function notifyFixRewardPaid(params: {
  postId: string
  fixerId: string
  reward: number
  postTitle?: string | null
  transactionId: string
  isPostOwnerClosing: boolean
}): Promise<void> {
  const { postId, reward, isPostOwnerClosing } = params
  const userId = params.fixerId
  const postTitle = params.postTitle || undefined
  const adminSupabase = createAdminClient()
  const dbClient = adminSupabase
  const transaction = { id: params.transactionId }
  try {
    // Create activity for the fix
    const activityId = uuidv4();
    console.log('[FIX REWARD] Creating fix activity for user:', userId, 'postId:', postId, 'activityId:', activityId);
    const { error: activityError } = await dbClient.from('activities').insert({
      id: activityId,
      user_id: userId,
      type: 'fix',
      related_id: postId,
      related_table: 'posts',
      timestamp: new Date().toISOString(),
      metadata: { 
        title: postTitle || 'Issue fixed',
        reward: reward,
        transaction_id: transaction.id
      },
    });
    
    if (activityError) {
      console.error('[FIX REWARD] ERROR creating fix activity:', activityError);
    } else {
      console.log('[FIX REWARD] Successfully created fix activity:', activityId);
    }

    // Send email notification to post owner (if different from fixer)
    const { data: post } = await adminSupabase
      .from('posts')
      .select('user_id, title, group_id')
      .eq('id', postId)
      .single()

    if (post && post.user_id) {
      const { data: ownerProfile } = await adminSupabase
        .from('profiles')
        .select('email, name')
        .eq('id', post.user_id)
        .single()

      const { data: fixerProfile } = await adminSupabase
        .from('profiles')
        .select('email, name')
        .eq('id', userId)
        .single()

      // Send email to post owner (your issue was fixed)
      // IMPORTANT: Must await email send in serverless functions
      if (ownerProfile?.email && !ownerProfile.email.includes('@ganamos.app')) {
        try {
          await sendIssueFixedEmail({
            toEmail: ownerProfile.email,
            userName: ownerProfile.name || 'User',
            issueTitle: post.title || postTitle || 'Your issue',
            fixerName: fixerProfile?.name || 'Someone',
            rewardAmount: reward,
            date: new Date(),
            postId: postId,
            isPostOwnerAssigning: isPostOwnerClosing // Pass through to adjust email wording
          })
          console.log(`Issue fixed email sent to post owner: ${ownerProfile.email}`)
        } catch (error) {
          console.error('Error sending issue fixed email:', error)
          // Don't fail the transaction if email fails
        }
      }

      // Send email to fixer (you earned a reward)
      // IMPORTANT: Must await email send in serverless functions
      if (fixerProfile?.email && !fixerProfile.email.includes('@ganamos.app')) {
        try {
          await sendRewardEarnedEmail({
            toEmail: fixerProfile.email,
            fixerName: fixerProfile.name || 'User',
            issueTitle: post.title || postTitle || 'Issue fixed',
            posterName: ownerProfile?.name || 'Someone',
            rewardAmount: reward,
            date: new Date(),
            postId: postId
          })
          console.log(`Reward earned email sent to fixer: ${fixerProfile.email}`)
        } catch (error) {
          console.error('Error sending reward earned email:', error)
          // Don't fail the transaction if email fails
        }
      }
      
      // Send email to all group admins (except post owner who already got an email)
      // This notifies admins that a fix was approved and reward was distributed
      if (post.group_id) {
        const { data: groupAdmins, error: adminsError } = await adminSupabase
          .from('group_members')
          .select(`
            user_id,
            profiles(email, name)
          `)
          .eq('group_id', post.group_id)
          .eq('role', 'admin')
          .eq('status', 'approved')
          .neq('user_id', post.user_id) // Exclude post owner (already emailed)
        
        if (adminsError) {
          console.error('Error fetching group admins for fix approval email:', adminsError)
        } else {
          // IMPORTANT: Must await each email send in serverless functions
          for (const admin of groupAdmins || []) {
            const profile = admin.profiles as { email: string; name: string } | null
            // Skip if admin is the fixer (they already got the reward email)
            if (admin.user_id === userId) continue
            
            if (profile?.email && !profile.email.includes('@ganamos.app')) {
              try {
                await sendIssueFixedEmail({
                  toEmail: profile.email,
                  userName: profile.name || 'User',
                  issueTitle: post.title || postTitle || 'Group issue',
                  fixerName: fixerProfile?.name || 'Someone',
                  rewardAmount: reward,
                  date: new Date(),
                  postId: postId,
                  isPostOwnerAssigning: false
                })
                console.log(`Fix approval email sent to group admin: ${profile.email}`)
              } catch (error) {
                console.error(`Error sending fix approval email to group admin ${profile.email}:`, error)
              }
            }
          }
        }
      }
      
      // Create activity for the POST OWNER only if different from fixer
      // (fixer already has their own 'fix' activity created above)
      if (post.user_id !== userId) {
        await adminSupabase.from('activities').insert({
          id: uuidv4(),
          user_id: post.user_id,
          type: 'fix_completed',
          related_id: postId,
          related_table: 'posts',
          timestamp: new Date().toISOString(),
          metadata: {
            title: post.title || postTitle || 'Your issue',
            reward: reward,
            fixer_name: fixerProfile?.name || 'Someone',
            fixer_id: userId
          },
        })
      }
    }

  } catch (error) {
    console.error('[notifyFixRewardPaid] Error sending notifications:', error)
  }
}

export async function createFixRewardAction(params: {
  postId: string
  userId: string
  /** IGNORED: the post's stored reward is always what gets paid. Kept for call-site compatibility. */
  reward?: number
  postTitle?: string
  isPostOwnerClosing?: boolean // Post owner / group admin approving the submitted fix
  // Fixer auto-approval: the server re-verifies this image itself
  fixDetails?: {
    fixImageUrl: string
    fixerNote: string | null
    /** IGNORED: the server computes its own confidence. */
    aiConfidence?: number
    aiAnalysis?: string | null
  }
}): Promise<{ success: boolean; error?: string; transactionId?: string; newBalance?: number }> {
  'use server'

  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })
    const { postId, userId, isPostOwnerClosing, fixDetails } = params

    // SECURITY: Require verified user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!postId || !userId) {
      return { success: false, error: 'Invalid parameters' }
    }

    const admin = createAdminClient()
    const { data: post, error: postError } = await admin
      .from('posts')
      .select('id, user_id, group_id, title, description, reward, image_url, fixed, fixed_by, deleted_at, reward_paid_at, funding_status, funding_r_hash, submitted_fix_by_id, submitted_fix_image_url, submitted_fix_note, submitted_fix_proof_text')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }
    if (post.deleted_at) {
      return { success: false, error: 'Post has been deleted' }
    }
    if (post.reward_paid_at) {
      return { success: false, error: 'This reward has already been paid' }
    }

    const nowIso = new Date().toISOString()
    let markedFixedHere = false

    if (isPostOwnerClosing) {
      // SECURITY: caller must be the post owner or an approved group admin
      let isAuthorized = post.user_id === user.id
      if (!isAuthorized && post.group_id) {
        const { data: membership } = await admin
          .from('group_members')
          .select('role')
          .eq('group_id', post.group_id)
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .maybeSingle()
        isAuthorized = membership?.role === 'admin'
      }
      if (!isAuthorized) {
        console.error('SECURITY ALERT: Unauthorized fix approval attempt', { authenticatedUserId: user.id, postId })
        return { success: false, error: 'Unauthorized: only the post owner or a group admin can approve this fix' }
      }

      // SECURITY: the reward goes to whoever actually submitted the fix (or the
      // fixer the owner designated when closing), never to an arbitrary user.
      const designatedFixer = post.submitted_fix_by_id ?? post.fixed_by
      if (!designatedFixer || designatedFixer !== userId) {
        console.error('SECURITY ALERT: Approval payout to a user who did not submit the fix', { postId, userId, designatedFixer })
        return { success: false, error: 'This user did not submit the fix for this post' }
      }

      if (!(await isPostRewardFunded(admin, post))) {
        console.error('SECURITY: Attempted payout for unfunded post', { postId, approverId: user.id })
        return { success: false, error: "This post's reward was never funded. Cannot issue reward." }
      }

      // Mark fixed server-side (browser sessions can't set fixed/fixed_by).
      if (!post.fixed) {
        const { data: updated } = await admin
          .from('posts')
          .update({
            fixed: true,
            fixed_at: nowIso,
            fixed_by: userId,
            fixed_by_is_anonymous: false,
            fixed_image_url: post.submitted_fix_image_url,
            fixer_note: post.submitted_fix_note,
            fix_proof_text: post.submitted_fix_proof_text || null,
            under_review: false,
          })
          .eq('id', postId)
          .eq('fixed', false)
          .select('id')
        markedFixedHere = !!updated?.length
      }
    } else {
      // Fixer auto-approval: fixer must be crediting themselves or a connected account
      const isOwnAccount = user.id === userId
      const { data: connected } = await admin
        .from('connected_accounts')
        .select('id')
        .eq('primary_user_id', user.id)
        .eq('connected_user_id', userId)
        .maybeSingle()
      if (!isOwnAccount && !connected) {
        console.error('SECURITY ALERT: Unauthorized reward transfer attempt', { authenticatedUserId: user.id, requestedUserId: userId, postId })
        return { success: false, error: "Unauthorized: Cannot modify another user's balance" }
      }

      if (!fixDetails?.fixImageUrl) {
        return { success: false, error: 'A photo of the fix is required for automatic approval' }
      }
      if (post.fixed) {
        return { success: false, error: 'This issue has already been fixed' }
      }
      if (!(await isPostRewardFunded(admin, post))) {
        console.error('SECURITY: Attempted auto-approval payout for unfunded post', { postId, fixerId: userId })
        return { success: false, error: "This post's reward was never funded. Cannot issue reward." }
      }

      // SECURITY: never trust a client-supplied AI score; verify on the server
      // against the post's stored "before" image.
      const verification = await verifyFixForPost(post, fixDetails.fixImageUrl)
      if (!verification) {
        return { success: false, error: 'Could not verify the fix automatically. Please submit it for review.' }
      }
      if (verification.confidence < AUTO_APPROVE_CONFIDENCE) {
        return { success: false, error: 'AI confidence too low for auto-approval' }
      }

      // Claim the post atomically: only one fixer can mark it fixed.
      const { data: claimed } = await admin
        .from('posts')
        .update({
          fixed: true,
          fixed_at: nowIso,
          fixed_by: userId,
          fixed_by_is_anonymous: false,
          fixed_image_url: fixDetails.fixImageUrl,
          fixer_note: fixDetails.fixerNote,
          under_review: false,
          ai_confidence_score: verification.confidence,
          ai_analysis: verification.reasoning,
        })
        .eq('id', postId)
        .eq('fixed', false)
        .is('deleted_at', null)
        .select('id')
      if (!claimed?.length) {
        return { success: false, error: 'This issue has already been fixed' }
      }
      markedFixedHere = true
    }

    // Posts without a reward: nothing to pay.
    if (!post.reward || post.reward <= 0) {
      return { success: true }
    }

    const payout = await payFixReward(admin, {
      postId,
      fixerId: userId,
      memo: `Fix reward earned: ${post.title || 'Issue fixed'}`,
    })

    if (!payout.success) {
      // Don't leave a post marked fixed by this request without its reward.
      if (markedFixedHere && payout.code !== 'reward_already_paid') {
        await admin
          .from('posts')
          .update({ fixed: false, fixed_at: null, fixed_by: null })
          .eq('id', postId)
          .eq('fixed_by', userId)
          .is('reward_paid_at', null)
      }
      return { success: false, error: payout.error }
    }

    await notifyFixRewardPaid({
      postId,
      fixerId: userId,
      reward: payout.amount,
      postTitle: post.title || params.postTitle,
      transactionId: payout.transactionId,
      isPostOwnerClosing: !!isPostOwnerClosing,
    })
    const transaction = { id: payout.transactionId }
    const reward = payout.amount
    const newBalance = payout.newBalance

    console.log(`Fix reward paid: ${transaction.id} for post ${postId}, ${reward} sats to ${userId}`)
    return { success: true, transactionId: transaction.id, newBalance }
  } catch (error) {
    console.error('Error in createFixRewardAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Closes an issue by marking it as fixed and assigning a fixer
 * The fixer receives the reward via createFixRewardAction
 * 
 * SECURITY: Only the authenticated post owner can close their own post.
 * Connected accounts (e.g., child accounts) cannot close posts on behalf of the owner.
 * 
 * @param postId - The ID of the post to close
 * @param _effectiveUserId - DEPRECATED: No longer used. Session user ID is used directly.
 * @param fixerUsername - Username of the user to assign as the fixer
 */
export async function closeIssueAction(
  postId: string,
  _effectiveUserId: string,
  fixerUsername: string
): Promise<{ success: boolean; error?: string }> {
  'use server'

  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })

    // Get verified user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Fetch the post (including group_id for group admin check)
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, group_id, fixed, under_review, deleted_at, reward, title')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }

    // SECURITY: Only the post owner OR a group admin can close the issue
    const isPostOwner = post.user_id === user.id
    
    // Check if user is a group admin for this post's group
    let isGroupAdmin = false
    if (post.group_id) {
      const { data: membership } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', post.group_id)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .single()
      
      isGroupAdmin = membership?.role === 'admin'
    }
    
    const canCloseIssue = isPostOwner || isGroupAdmin
    
    if (!canCloseIssue) {
      console.error('SECURITY: Unauthorized user attempted to close issue', {
        authenticatedUserId: user.id,
        postOwnerId: post.user_id,
        postGroupId: post.group_id,
        isPostOwner,
        isGroupAdmin,
        postId
      })
      return { success: false, error: 'Only the original poster or a group admin can close this issue' }
    }
    
    // AUDIT: Log when a group admin closes someone else's issue
    const isGroupAdminClosingOthersPost = isGroupAdmin && !isPostOwner
    if (isGroupAdminClosingOthersPost) {
      console.log('AUDIT: Group admin closing issue on behalf of post owner', {
        action: 'GROUP_ADMIN_CLOSE_ISSUE',
        adminUserId: user.id,
        postOwnerId: post.user_id,
        postId,
        postGroupId: post.group_id,
        fixerUsername,
        rewardAmount: post.reward,
        timestamp: new Date().toISOString(),
      })
    }

    // Verify post can be closed
    if (post.fixed) {
      return { success: false, error: 'Post is already marked as fixed' }
    }

    if (post.deleted_at) {
      return { success: false, error: 'Post has been deleted' }
    }
    
    // Note: We intentionally allow closing even if under_review = true
    // Group admins and post owners should always be able to approve/close issues

    // SECURITY: Verify the post reward was actually funded (has a matching deduction transaction).
    // Without this, an attacker can create a post with any reward amount, skip the balance
    // deduction, then approve the fix to mint sats from nothing.
    const admin = createAdminClient()
    if (!(await isPostRewardFunded(admin, { id: postId }))) {
      console.error('SECURITY: Attempted to close unfunded reward post', {
        postId,
        postOwnerId: post.user_id,
        reward: post.reward,
        closedBy: user.id,
        timestamp: new Date().toISOString(),
      })
      return { success: false, error: 'This post\'s reward was never funded. Cannot issue reward.' }
    }

    // Look up the fixer by username
    const { data: fixerProfile, error: fixerError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', fixerUsername)
      .single()

    if (fixerError || !fixerProfile) {
      return { success: false, error: `User "${fixerUsername}" not found` }
    }

    // Mark fixed atomically (service role: browser sessions can't set fixed/fixed_by)
    const nowIso = new Date().toISOString()
    const { data: closed, error: updateError } = await admin
      .from('posts')
      .update({
        fixed: true,
        fixed_at: nowIso,
        fixed_by: fixerProfile.id,
        fixed_by_is_anonymous: false,
        under_review: false,
      })
      .eq('id', postId)
      .eq('fixed', false)
      .is('deleted_at', null)
      .select('id')

    if (updateError) {
      console.error('Error updating post:', updateError)
      return { success: false, error: 'Failed to update post' }
    }
    if (!closed?.length) {
      return { success: false, error: 'Post is already marked as fixed' }
    }

    // Pay the stored reward exactly once (atomic in the database)
    if (post.reward && post.reward > 0) {
      const payout = await payFixReward(admin, {
        postId,
        fixerId: fixerProfile.id,
        memo: `Fix reward earned: ${post.title || 'Issue fixed'}`,
      })

      if (!payout.success) {
        console.error('Error paying fix reward:', payout.error)
        if (payout.code !== 'reward_already_paid') {
          await admin
            .from('posts')
            .update({ fixed: false, fixed_at: null, fixed_by: null })
            .eq('id', postId)
            .eq('fixed_by', fixerProfile.id)
            .is('reward_paid_at', null)
        }
        return { success: false, error: payout.error || 'Failed to transfer reward' }
      }

      await notifyFixRewardPaid({
        postId,
        fixerId: fixerProfile.id,
        reward: payout.amount,
        postTitle: post.title,
        transactionId: payout.transactionId,
        isPostOwnerClosing: true,
      })
    }

    // NOTIFICATION: Send email to post owner when a group admin closes their issue
    if (isGroupAdminClosingOthersPost) {
      try {
        // Fetch post owner's profile
        const { data: postOwnerProfile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', post.user_id)
          .single()
        
        // Fetch admin's profile  
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .single()
        
        // Fetch group name
        const { data: group } = await supabase
          .from('groups')
          .select('name')
          .eq('id', post.group_id)
          .single()
        
        if (postOwnerProfile?.email && adminProfile?.name && group?.name) {
          await sendGroupAdminClosedIssueEmail({
            toEmail: postOwnerProfile.email,
            postOwnerName: postOwnerProfile.name || 'there',
            adminName: adminProfile.name,
            issueTitle: post.title || 'Untitled Issue',
            fixerName: fixerUsername,
            rewardAmount: post.reward || 0,
            groupName: group.name,
            date: new Date(),
            postId,
          })
          console.log(`Notification sent to post owner ${post.user_id} about admin closure`)
        }
      } catch (emailError) {
        // Don't fail the action if notification fails - the closure was successful
        console.error('Error sending group admin closure notification:', emailError)
      }
    }

    console.log(`Issue closed: post ${postId}, fixer: ${fixerUsername}, reward: ${post.reward}`)
    return { success: true }
  } catch (error) {
    console.error('Error in closeIssueAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Soft-deletes a post by setting deleted_at timestamp
 * No reward transfer occurs - poster keeps their sats
 * 
 * @param postId - The ID of the post to delete
 * @param effectiveUserId - The user deleting the post (poster or their connected account)
 */
export async function deletePostAction(
  postId: string,
  effectiveUserId: string
): Promise<{ success: boolean; error?: string }> {
  'use server'

  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })

    // Get session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' }
    }

    // SECURITY: Verify effectiveUserId is session user OR a connected account
    const isOwnAccount = session.user.id === effectiveUserId
    const isConnectedAccount = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('primary_user_id', session.user.id)
      .eq('connected_user_id', effectiveUserId)
      .maybeSingle()

    if (!isOwnAccount && !isConnectedAccount.data) {
      console.error('SECURITY ALERT: Unauthorized delete post attempt', {
        authenticatedUserId: session.user.id,
        requestedUserId: effectiveUserId,
        postId
      })
      return { success: false, error: 'Unauthorized' }
    }

    // Fetch the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, fixed, under_review, deleted_at, title, reward')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }

    // Verify the effective user is the original poster
    if (post.user_id !== effectiveUserId) {
      return { success: false, error: 'Only the original poster can delete this post' }
    }

    // Verify post can be deleted
    if (post.fixed) {
      return { success: false, error: 'Cannot delete a post that has been marked as fixed' }
    }

    if (post.under_review) {
      return { success: false, error: 'Cannot delete a post that is under review' }
    }

    if (post.deleted_at) {
      return { success: false, error: 'Post has already been deleted' }
    }

    // IMPORTANT: Use admin supabase for the soft delete, transaction creation and balance updates
    // (deleted_at, balances and transactions are service_role-only)
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Soft delete the post atomically: only the request that actually deletes
    // it continues to the refund, so repeated calls can't refund twice.
    const nowIso = new Date().toISOString()
    const { data: deletedRows, error: updateError } = await adminSupabase
      .from('posts')
      .update({
        deleted_at: nowIso,
      })
      .eq('id', postId)
      .is('deleted_at', null)
      .eq('fixed', false)
      .eq('under_review', false)
      // Never delete (and refund) while a reward payout is paid or in flight
      .is('reward_paid_at', null)
      .is('anonymous_reward_paid_at', null)
      .is('anonymous_reward_payment_lock', null)
      .select('id')

    if (updateError) {
      console.error('Error deleting post:', updateError)
      return { success: false, error: 'Failed to delete post' }
    }
    if (!deletedRows?.length) {
      return { success: false, error: 'This post can no longer be deleted (fixed, under review, or a reward payout is in progress)' }
    }

    // Create activity for the deletion
    await adminSupabase.from('activities').insert({
      id: uuidv4(),
      user_id: effectiveUserId,
      type: 'post_deleted',
      related_id: postId,
      related_table: 'posts',
      timestamp: nowIso,
      metadata: {
        title: post.title || 'Deleted issue',
        reward: post.reward || 0
      },
    })

    // Refund the reward back to the poster's balance, only if it was funded
    // (a post inserted directly with an unfunded reward must not mint sats)
    const rewardFunded = !!post.reward && post.reward > 0 && (await isPostRewardFunded(adminSupabase, { id: postId }))
    if (post.reward && post.reward > 0 && !rewardFunded) {
      console.error('SECURITY: Skipping refund for unfunded post reward', { postId, userId: effectiveUserId, reward: post.reward })
    }
    if (rewardFunded) {
      // Atomic, once-only refund (refuses if the reward was paid or is locked)
      const { error: refundError } = await adminSupabase.rpc('refund_post_reward', {
        p_post_id: postId,
        p_memo: `Refund for deleted post: ${post.title || 'Issue'}`,
      })
      if (refundError) {
        console.error('Error refunding post reward:', refundError)
      }
    }

    console.log(`Post deleted: ${postId} by user ${effectiveUserId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in deletePostAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Updates the expiration date for a post
 * Only the original poster can update expiration
 * 
 * @param postId - The ID of the post to update
 * @param effectiveUserId - The user updating the post (poster or their connected account)
 * @param expiresAt - The new expiration date (ISO string) or null to clear expiration
 */
export async function updatePostExpirationAction(
  postId: string,
  effectiveUserId: string,
  expiresAt: string | null
): Promise<{ success: boolean; error?: string }> {
  'use server'

  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })

    // Get session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' }
    }

    // SECURITY: Verify effectiveUserId is session user OR a connected account
    const isOwnAccount = session.user.id === effectiveUserId
    const isConnectedAccount = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('primary_user_id', session.user.id)
      .eq('connected_user_id', effectiveUserId)
      .maybeSingle()

    if (!isOwnAccount && !isConnectedAccount.data) {
      console.error('SECURITY ALERT: Unauthorized update post expiration attempt', {
        authenticatedUserId: session.user.id,
        requestedUserId: effectiveUserId,
        postId
      })
      return { success: false, error: 'Unauthorized' }
    }

    // Fetch the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, fixed, under_review, deleted_at')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }

    // Verify the effective user is the original poster
    if (post.user_id !== effectiveUserId) {
      return { success: false, error: 'Only the original poster can update post expiration' }
    }

    // Verify post can be updated
    if (post.fixed) {
      return { success: false, error: 'Cannot update expiration for a post that has been marked as fixed' }
    }

    if (post.under_review) {
      return { success: false, error: 'Cannot update expiration for a post that is under review' }
    }

    if (post.deleted_at) {
      return { success: false, error: 'Cannot update expiration for a deleted post' }
    }

    // Validate expiresAt if provided
    if (expiresAt !== null) {
      const expiryDate = new Date(expiresAt)
      const now = new Date()
      const oneHourFromNow = new Date(now.getTime() + 3600_000)
      const oneYearFromNow = new Date(now.getTime() + 365 * 86400_000)

      // Check if valid date
      if (isNaN(expiryDate.getTime())) {
        return { success: false, error: 'Invalid expiration date format' }
      }

      // Check if at least 1 hour in the future
      if (expiryDate < oneHourFromNow) {
        return { success: false, error: 'Expiration date must be at least 1 hour in the future' }
      }

      // Check if not more than 1 year in the future
      if (expiryDate > oneYearFromNow) {
        return { success: false, error: 'Expiration date cannot be more than 1 year in the future' }
      }
    }

    // IMPORTANT: Use admin supabase to update expiration
    // This ensures we can reset expiry_warning_sent_at even if RLS would block it
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Update expires_at and reset expiry_warning_sent_at
    const { error: updateError } = await adminSupabase
      .from('posts')
      .update({
        expires_at: expiresAt,
        expiry_warning_sent_at: null, // Reset warning flag so new warning can be sent
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Error updating post expiration:', updateError)
      return { success: false, error: 'Failed to update post expiration' }
    }

    console.log(`Post expiration updated: ${postId} by user ${effectiveUserId}, new expiration: ${expiresAt || 'null'}`)
    return { success: true }
  } catch (error) {
    console.error('Error in updatePostExpirationAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Records a fix rejection on the fixer's device (if they have one)
 * This enables the Arduino to show a "FIX REJECTED" notification
 * 
 * @param fixerUserId - The user ID of the person who submitted the fix
 * @param postId - The ID of the post (used as rejection ID for device polling)
 * @param message - Optional short message to display on the device
 */
export async function recordDeviceRejectionAction(params: {
  fixerUserId: string
  postId: string
  message?: string
}): Promise<{ success: boolean; error?: string; deviceUpdated?: boolean }> {
  'use server'

  const { fixerUserId, postId, message } = params

  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })

    // Get session - must be authenticated
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' }
    }

    // Check if the fixer has a paired device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', fixerUserId)
      .eq('status', 'paired')
      .single()

    if (deviceError || !device) {
      // No device found - this is not an error, just means we don't need to notify
      console.log(`[Device Rejection] No paired device for user ${fixerUserId}`)
      return { success: true, deviceUpdated: false }
    }

    // Truncate message for device display (max 100 chars, will be further truncated on device)
    const truncatedMessage = message ? message.substring(0, 100) : 'Try again!'

    // Update the device with rejection info
    const { error: updateError } = await supabase
      .from('devices')
      .update({
        last_rejection_id: postId,
        rejection_message: truncatedMessage,
      })
      .eq('id', device.id)

    if (updateError) {
      console.error('[Device Rejection] Error updating device:', updateError)
      return { success: false, error: 'Failed to update device' }
    }

    console.log(`[Device Rejection] Updated device ${device.id} for user ${fixerUserId} with rejection for post ${postId}`)
    return { success: true, deviceUpdated: true }
  } catch (error) {
    console.error('Error in recordDeviceRejectionAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Pre-check safety caps before creating a post
 * Call this BEFORE inserting a post to ensure it won't be blocked
 */
export async function checkPostSafetyCapsAction(params: {
  userId: string
  reward: number
}): Promise<{ 
  allowed: boolean
  error?: string
  rewardCapLevel?: string
  livePostsCapLevel?: string
  currentLivePosts?: number
  maxLivePosts?: number
}> {
  'use server'
  
  const { userId, reward } = params

  try {
    // Check system-wide live posts cap
    const livePostsCapCheck = await checkLivePostsCap()
    if (!livePostsCapCheck.allowed) {
      return { 
        allowed: false, 
        error: livePostsCapCheck.message,
        livePostsCapLevel: 'hard',
        currentLivePosts: livePostsCapCheck.currentCount,
        maxLivePosts: livePostsCapCheck.limitValue,
      }
    }

    // Check reward cap if reward > 0
    if (reward > 0) {
      const rewardCapCheck = await checkPostRewardCap(userId, reward)
      if (!rewardCapCheck.allowed) {
        return { 
          allowed: false, 
          error: rewardCapCheck.message,
          rewardCapLevel: 'hard',
        }
      }
      return { 
        allowed: true, 
        rewardCapLevel: rewardCapCheck.capLevel,
        livePostsCapLevel: 'none',
        currentLivePosts: livePostsCapCheck.currentCount,
        maxLivePosts: livePostsCapCheck.limitValue,
      }
    }

    return { 
      allowed: true,
      rewardCapLevel: 'none',
      livePostsCapLevel: 'none',
      currentLivePosts: livePostsCapCheck.currentCount,
      maxLivePosts: livePostsCapCheck.limitValue,
    }
  } catch (error) {
    console.error('Error in checkPostSafetyCapsAction:', error)
    // Fail open - allow post if check fails
    return { allowed: true }
  }
}
