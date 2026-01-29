"use server"

import { createInvoice, checkInvoice } from "@/lib/lightning"
import { v4 as uuidv4 } from "uuid" // Ensure uuid is imported if used, e.g. in createFundedAnonymousPostAction
import { createServerSupabaseClient } from "@/lib/supabase" // For createFundedAnonymousPostAction
import { validateLightningInvoice, validateInvoiceAmount } from "@/lib/lightning-validation"
import { sendFixSubmittedForReviewEmail, sendIssueFixedEmail, sendRewardEarnedEmail, sendGroupAdminClosedIssueEmail } from "@/lib/transaction-emails"
import { alertLargePostBounty } from "@/lib/sms-alerts"
import { checkPostRewardCap, checkLivePostsCap, checkBalanceCap } from "@/lib/safety-caps"

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
}): Promise<void> {
  const { adminSupabase, groupId, postOwnerId, issueTitle, fixerName, postId, aiAnalysis, beforeImageUrl, afterImageUrl } = params
  
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
          afterImageUrl: afterImageUrl
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
  lightningAddress: string,
): Promise<{ success: boolean; paymentHash?: string; error?: string }> {
  if (!postId || !lightningAddress) {
    return { success: false, error: "Post ID and Lightning address are required." }
  }

  const supabase = createServerSupabaseClient(await getCookieStore())

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

    if (!post.fixed) {
      return { success: false, error: "This post has not been marked as fixed yet." }
    }

    if (post.submitted_fix_by_id !== null) {
      return { success: false, error: "This fix is not anonymous." }
    }

    // Check Lightning configuration
    const LND_REST_URL = process.env.LND_REST_URL
    const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

    if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
      return {
        success: false,
        error: "Lightning payment system is currently unavailable.",
      }
    }

    const trimmed = lightningAddress.trim().toLowerCase()
    let invoiceToPay = trimmed

    // If it's a Lightning address (user@domain.com), convert it to an invoice
    if (trimmed.includes("@") && trimmed.includes(".")) {
      try {
        // Lightning address lookup: GET https://[domain]/.well-known/lnurlp/[user]
        const [user, domain] = trimmed.split("@")
        const lookupUrl = `https://${domain}/.well-known/lnurlp/${user}`
        
        const lookupResponse = await fetch(lookupUrl)
        if (!lookupResponse.ok) {
          return { success: false, error: "Failed to lookup Lightning address" }
        }

        const lookupData = await lookupResponse.json()
        if (!lookupData.callback) {
          return { success: false, error: "Invalid Lightning address response" }
        }

        // Request invoice from callback
        const callbackUrl = new URL(lookupData.callback)
        callbackUrl.searchParams.set("amount", (post.reward * 1000).toString()) // Convert to millisats

        const invoiceResponse = await fetch(callbackUrl.toString())
        if (!invoiceResponse.ok) {
          return { success: false, error: "Failed to generate invoice from Lightning address" }
        }

        const invoiceData = await invoiceResponse.json()
        if (!invoiceData.pr) {
          return { success: false, error: "Invalid invoice response from Lightning address" }
        }

        invoiceToPay = invoiceData.pr
      } catch (error) {
        console.error("Error converting Lightning address to invoice:", error)
        return {
          success: false,
          error: "Failed to convert Lightning address to invoice. Please provide a Lightning invoice instead.",
        }
      }
    }

    // Validate it's now a Lightning invoice
    if (!validateLightningInvoice(invoiceToPay)) {
      return { success: false, error: "Invalid Lightning invoice format." }
    }

    // Pay the invoice
    const { payInvoice } = await import("@/lib/lightning")
    const paymentResult = await payInvoice(invoiceToPay)

    if (!paymentResult.success) {
      console.error("Failed to pay Lightning invoice:", paymentResult.error)
      return {
        success: false,
        error: "Failed to process Lightning payment. Please check your address and try again.",
      }
    }

    // Mark as paid
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        anonymous_reward_paid_at: now,
        anonymous_reward_payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
      })
      .eq("id", postId)

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
    console.error("Unexpected error in payAnonymousFixLightningAddressAction:", error)
    return {
      success: false,
      error: "An unexpected error occurred while processing the payment.",
    }
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
): Promise<{
  success: boolean
  paymentHash?: string
  error?: string
  details?: any
}> {
  if (!postId || !lightningInvoice) {
    return { success: false, error: "Post ID and Lightning invoice are required." }
  }

  const supabase = createServerSupabaseClient(await getCookieStore())

  try {
    // 1. Fetch the post and validate it has an unclaimed anonymous reward
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select(`
        *,
        group:group_id(
          id,
          name,
          description
        ),
        assigned_to_user:assigned_to(
          id,
          name
        )
      `)
      .eq("id", postId)
      .single()

    if (fetchError || !post) {
      console.error("Error fetching post for anonymous payout:", fetchError)
      return { success: false, error: "Post not found." }
    }

    // Validate this is an anonymous fix that hasn't been paid yet
    if (!post.fixed_by_is_anonymous) {
      return { success: false, error: "This reward is not available for anonymous claim." }
    }

    if (post.anonymous_reward_paid_at) {
      return { success: false, error: "This reward has already been claimed." }
    }

    if (!post.fixed) {
      return { success: false, error: "This post has not been marked as fixed yet." }
    }

    // 2. Enhanced Lightning invoice validation
    if (!validateLightningInvoice(lightningInvoice)) {
      return { success: false, error: "Invalid Lightning invoice format." }
    }

    // 3. Validate invoice amount matches reward (if amount is specified in invoice)
    if (!validateInvoiceAmount(lightningInvoice, post.reward)) {
      return {
        success: false,
        error: `Invoice amount doesn't match reward amount of ${post.reward} sats.`,
      }
    }

    // 3. Check Lightning configuration
    const LND_REST_URL = process.env.LND_REST_URL
    const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

    if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
      console.error("Lightning configuration missing in payAnonymousRewardAction")
      return {
        success: false,
        error: "Lightning payment system is currently unavailable.",
      }
    }

    // 4. Attempt to pay the Lightning invoice
    console.log(`Attempting to pay anonymous reward for post ${postId}: ${post.reward} sats`)

    const { payInvoice } = await import("@/lib/lightning")
    const paymentResult = await payInvoice(lightningInvoice.trim())

    if (!paymentResult.success) {
      console.error("Failed to pay Lightning invoice:", paymentResult.error, paymentResult.details)
      return {
        success: false,
        error: "Failed to process Lightning payment. Please check your invoice and try again.",
        details: paymentResult.error,
      }
    }

    // 5. Mark the reward as claimed in the database
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        anonymous_reward_paid_at: now,
        anonymous_reward_payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
      })
      .eq("id", postId)

    if (updateError) {
      console.error("Error marking anonymous reward as paid:", updateError)
      // Payment was successful but we couldn't update the database
      // This is a critical issue that needs manual intervention
      return {
        success: false,
        error: "Payment was sent but there was an error updating our records. Please contact support.",
        details: updateError.message,
      }
    }

    console.log(`Anonymous reward successfully paid for post ${postId}. Payment hash: ${paymentResult.paymentHash}`)

    // Create activity for the anonymous reward payment
    await supabase.from("activities").insert({
      id: uuidv4(),
      user_id: null, // Anonymous fix
      type: "reward",
      related_id: postId,
      related_table: "posts",
      timestamp: now,
      metadata: { 
        amount: post ? post.reward : undefined,
        payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
        payment_method: "lightning",
        is_anonymous: true,
      },
    });

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
    console.error("Unexpected error in payAnonymousRewardAction:", error)
    return {
      success: false,
      error: "An unexpected error occurred while processing the payment.",
      details: error instanceof Error ? error.message : String(error),
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
  location: string | null // Renamed from locationName
  latitude: number | null
  longitude: number | null
  city: string | null
  funding_r_hash: string // Renamed from fundingRHash
  funding_payment_request: string // Added this
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  const supabase = createServerSupabaseClient(await getCookieStore())
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

    const { data, error } = await supabase
      .from("posts")
      .insert({
        id: postId,
        user_id: null, // Anonymous post
        created_by: "Anonymous",
        created_by_avatar: null,
        title: postDetails.description.substring(0, 50),
        description: postDetails.description,
        image_url: postDetails.image_url || "/placeholder.jpg", // Use placeholder only if no image provided
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
  fixImageUrl: string,
  fixerNote: string | null,
  aiConfidence: number,
  aiAnalysis: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (!postId || !fixImageUrl) {
    return { success: false, error: "Post ID and Fix Image URL are required." }
  }

  const supabase = createServerSupabaseClient(await getCookieStore())
  const now = new Date().toISOString()

  try {
    const { error } = await supabase
      .from("posts")
      .update({
        fixed: true,
        fixed_at: now,
        fixed_by: null, // Explicitly null for anonymous
        fixed_by_is_anonymous: true,
        fixed_image_url: fixImageUrl,
        fixer_note: fixerNote,
        under_review: false, // No longer under review if auto-approved
        // Optionally store AI verification details for the successful fix
        ai_confidence_score: aiConfidence,
        ai_analysis: aiAnalysis,
        // Clear any previous submission for review fields if they existed
        submitted_fix_by_id: null,
        submitted_fix_by_name: null,
        submitted_fix_by_avatar: null,
        submitted_fix_at: null,
        // submitted_fix_image_url: null, // Keep this if we want to see what was submitted vs what was approved
        // submitted_fix_note: null, // Keep this
      })
      .eq("id", postId)

    if (error) {
      console.error("Error in markPostFixedAnonymouslyAction:", error)
      return { success: false, error: error.message }
    }

    console.log(`Post ${postId} marked as fixed anonymously.`)
    // TODO: In a later step, we'll need to handle the reward payout mechanism for anonymous users.
    // This might involve generating a claim code or a pre-image for a LNURL-withdraw.

    if (!error) {
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

    return { success: true }
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
): Promise<{ success: boolean; error?: string }> {
  if (!postId || !lightningAddress) {
    return { success: false, error: "Post ID and Lightning address are required." }
  }

  const supabase = createServerSupabaseClient(await getCookieStore())

  try {
    // Validate the post exists and is under review with anonymous submission
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id, under_review, submitted_fix_by_id")
      .eq("id", postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: "Post not found." }
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
  fixImageUrl: string,
  fixerNote: string | null,
  aiConfidence: number,
  aiAnalysis: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (!postId || !fixImageUrl) {
    return { success: false, error: "Post ID and Fix Image URL are required." }
  }
  const supabase = createServerSupabaseClient(await getCookieStore())

  try {
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
            afterImageUrl: fixImageUrl
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
            afterImageUrl: fixImageUrl
          })
          console.log(`Fix review emails sent to group admins for group: ${postData.group_id}`)
        } catch (error) {
          console.error("Error sending fix submitted emails to group admins:", error)
        }
      }
    }

    console.log(`Anonymous fix for post ${postId} submitted for review.`)
    return { success: true }
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
  fixImageUrl: string
  fixerNote: string | null
  aiConfidence: number
  aiAnalysis: string | null
}): Promise<{ success: boolean; error?: string }> {
  'use server'
  
  const { postId, userId, fixImageUrl, fixerNote, aiConfidence, aiAnalysis } = params

  if (!postId || !userId || !fixImageUrl) {
    return { success: false, error: "Post ID, User ID, and Fix Image URL are required." }
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
            afterImageUrl: fixImageUrl
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
            afterImageUrl: fixImageUrl
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
): Promise<{ success: boolean; error?: string }> {
  'use server'
  
  try {
    const supabase = createServerSupabaseClient()
    
    // Get the post and verify it's an anonymous fix submission under review
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('under_review', true)
      .is('submitted_fix_by_id', null)
      .single()
    
    if (postError || !post) {
      return { success: false, error: 'Anonymous fix submission not found or already associated' }
    }
    
    // Update the post to associate with the user
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        submitted_fix_by_id: userId,
      })
      .eq('id', postId)
    
    if (updateError) {
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
  userId: string
): Promise<{ success: boolean; error?: string; amount?: number }> {
  'use server'
  
  try {
    const supabase = createServerSupabaseClient()
    
    // Get the post and verify it was fixed anonymously and reward not yet paid
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('fixed_by_is_anonymous', true)
      .is('anonymous_reward_paid_at', null)
      .single()
    
    if (postError || !post) {
      return { success: false, error: 'Anonymous reward not found or already claimed' }
    }
    
    // Update the post to associate with the user
    const { error: updatePostError } = await supabase
      .from('posts')
      .update({
        fixed_by: userId,
        fixed_by_is_anonymous: false, // Now associated with a user
      })
      .eq('id', postId)
    
    if (updatePostError) {
      console.error('Error updating post:', updatePostError)
      return { success: false, error: 'Failed to update post' }
    }
    
    // Use the createFixRewardAction to properly create transaction and update balance
    const rewardResult = await createFixRewardAction({
      postId,
      userId,
      reward: post.reward,
      postTitle: post.title
    })
    
    if (!rewardResult.success) {
      console.error('Error creating fix reward transaction for claimed anonymous reward:', rewardResult.error)
      return { success: false, error: 'Failed to credit reward' }
    }
    
    console.log(`Claimed anonymous reward: ${post.reward} sats for user ${userId}, transaction: ${rewardResult.transactionId}`)
    return { success: true, amount: post.reward }
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
  reward: number
  memo?: string
}): Promise<{ success: boolean; error?: string; transactionId?: string }> {
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

    if (!postId || !userId || reward <= 0) {
      return { success: false, error: 'Invalid parameters' }
    }

    // SAFETY: Check reward cap (blocks at hard limit)
    const rewardCapCheck = await checkPostRewardCap(userId, reward)
    if (!rewardCapCheck.allowed) {
      console.warn(`[Safety Caps] Post reward blocked: ${reward} sats exceeds hard cap for user ${userId}`)
      return { success: false, error: rewardCapCheck.message || 'Post reward exceeds maximum allowed amount.' }
    }
    if (rewardCapCheck.capLevel !== 'none') {
      console.log(`[Safety Caps] Post reward cap ${rewardCapCheck.capLevel} triggered for user ${userId}`)
    }

    // Get current balance to verify sufficient funds
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return { success: false, error: 'User profile not found' }
    }

    if (profile.balance < reward) {
      return { success: false, error: 'Insufficient balance' }
    }

    // Create transaction record for the post reward deduction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'internal', // Post reward is an internal transaction
        amount: -reward, // Negative because it's a deduction
        status: 'completed',
        memo: memo || `Post reward for issue`,
      })
      .select('id')
      .single()

    if (txError || !transaction) {
      console.error('Error creating post reward transaction:', txError)
      return { success: false, error: 'Failed to create transaction' }
    }

    // Update balance atomically
    const newBalance = profile.balance - reward
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (balanceError) {
      console.error('Error updating balance after post reward transaction:', balanceError)
      // Transaction was created but balance update failed - this is inconsistent
      // In a real scenario, we'd want to rollback or handle this better
      return { success: false, error: 'Transaction created but balance update failed' }
    }

    // Create activity for the post reward
    await supabase.from('activities').insert({
      id: uuidv4(),
      user_id: userId,
      type: 'post',
      related_id: postId,
      related_table: 'posts',
      timestamp: new Date().toISOString(),
      metadata: { 
        title: memo || 'Post created',
        reward: reward,
        transaction_id: transaction.id
      },
    })

    console.log(`Post reward transaction created: ${transaction.id} for post ${postId}, ${reward} sats deducted`)
    
    // SECURITY: Send SMS alert for large post bounties
    alertLargePostBounty(userId, reward, memo)
      .catch(err => console.error("[Security Alert] SMS for large bounty failed:", err))
    
    return { success: true, transactionId: transaction.id }
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
export async function createFixRewardAction(params: {
  postId: string
  userId: string
  reward: number
  postTitle?: string
  isPostOwnerClosing?: boolean // When true, allows poster to designate any user as fixer
  // For high-confidence AI fixes, also update the posts table
  fixDetails?: {
    fixImageUrl: string
    fixerNote: string | null
    aiConfidence: number
    aiAnalysis: string | null
  }
}): Promise<{ success: boolean; error?: string; transactionId?: string; newBalance?: number }> {
  'use server'
  
  try {
    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })
    const { postId, userId, reward, postTitle, isPostOwnerClosing, fixDetails } = params

    // SECURITY: Require verified user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // SECURITY: Verify authorization for this reward transfer
    // Two valid scenarios:
    // 1. Fixer crediting themselves or their connected account (normal fix flow)
    // 2. Post owner closing their own issue and designating any user as fixer
    
    let isAuthorized = false
    
    if (isPostOwnerClosing) {
      // Verify the caller is the post owner OR a group admin
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('user_id, group_id')
        .eq('id', postId)
        .single()
      
      if (postError || !post) {
        return { success: false, error: 'Post not found' }
      }
      
      // Check if user is the post owner
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
      
      if (isPostOwner || isGroupAdmin) {
        isAuthorized = true
        console.log('Post owner or group admin closing issue - authorized to transfer reward to any user')
      }
    } else {
      // Normal fix flow: fixer must be crediting themselves or their connected account
      const isOwnAccount = user.id === userId
      const isConnectedAccount = await supabase
        .from('connected_accounts')
        .select('id')
        .eq('primary_user_id', user.id)
        .eq('connected_user_id', userId)
        .maybeSingle()
      
      if (isOwnAccount || isConnectedAccount.data) {
        isAuthorized = true
      }
    }
    
    if (!isAuthorized) {
      console.error('SECURITY ALERT: Unauthorized reward transfer attempt', {
        authenticatedUserId: user.id,
        requestedUserId: userId,
        postId,
        isPostOwnerClosing
      })
      return { success: false, error: 'Unauthorized: Cannot modify another user\'s balance' }
    }

    // Validate parameters early (before any DB operations)
    if (fixDetails && fixDetails.aiConfidence < 7) {
      return { success: false, error: 'AI confidence too low for auto-approval' }
    }

    if (!postId || !userId || reward <= 0) {
      return { success: false, error: 'Invalid parameters' }
    }

    // IMPORTANT: Always use admin supabase for transaction creation
    // The INSERT policy on transactions was intentionally removed for security
    // (prevents users from creating fake deposit transactions)
    // All transaction creation must go through service_role
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Use admin client for all operations to ensure consistency
    // This is safe because we've already verified authorization above
    const dbClient = adminSupabase

    // Get current balance, pet_coins, and fixed count
    const { data: profile, error: profileError } = await dbClient
      .from('profiles')
      .select('balance, pet_coins, fixed_issues_count')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return { success: false, error: 'User profile not found' }
    }

    // Create transaction record for the fix reward earning
    const { data: transaction, error: txError } = await dbClient
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'internal', // Fix reward is an internal transaction
        amount: reward, // Positive because it's an earning
        status: 'completed',
        memo: `Fix reward earned: ${postTitle || 'Issue fixed'}`,
      })
      .select('id')
      .single()

    if (txError || !transaction) {
      console.error('Error creating fix reward transaction:', txError)
      return { success: false, error: 'Failed to create transaction' }
    }

    // Update balance, pet_coins, and fixed count atomically
    const newBalance = (profile.balance || 0) + reward
    const newCoins = (profile.pet_coins || 0) + reward  // Also add to pet coins
    const newFixedCount = (profile.fixed_issues_count || 0) + 1
    
    // SAFETY: Check balance cap for earnings (never blocks, only logs/notifies)
    const balanceCapCheck = await checkBalanceCap(userId, newBalance, true) // isEarning=true
    if (balanceCapCheck.capLevel !== 'none') {
      console.log(`[Safety Caps] Earning balance cap ${balanceCapCheck.capLevel} triggered for user ${userId} (earnings never blocked)`)
    }
    
    const { error: balanceError } = await dbClient
      .from('profiles')
      .update({
        balance: newBalance,
        pet_coins: newCoins,  // Update pet coins when earning rewards
        fixed_issues_count: newFixedCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (balanceError) {
      console.error('Error updating balance after fix reward transaction:', balanceError)
      // Transaction was created but balance update failed - this is inconsistent
      return { success: false, error: 'Transaction created but balance update failed' }
    }

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

    // If fixDetails provided, NOW update the posts table to mark as fixed
    // This happens AFTER transaction is created to ensure atomicity
    // If transaction creation failed above, we wouldn't reach here and post wouldn't be marked fixed
    if (fixDetails) {
      const now = new Date().toISOString()
      
      const { error: postUpdateError } = await adminSupabase
        .from('posts')
        .update({
          fixed: true,
          fixed_at: now,
          fixed_by: userId,
          fixed_image_url: fixDetails.fixImageUrl,
          fixer_note: fixDetails.fixerNote,
          under_review: false,
          ai_confidence_score: fixDetails.aiConfidence,
          ai_analysis: fixDetails.aiAnalysis,
          fixed_by_is_anonymous: false,
        })
        .eq('id', postId)
        .eq('fixed', false) // Safety: only update if not already fixed
      
      if (postUpdateError) {
        console.error('Error updating post in createFixRewardAction:', postUpdateError)
        // Transaction was already created, so we have an inconsistent state
        // Log this for manual review but don't fail the whole operation
        console.error('[FIX REWARD] WARNING: Transaction created but post update failed. Manual intervention needed for post:', postId)
      } else {
        console.log(`[FIX REWARD] Post ${postId} marked as fixed by ${userId} (AI confidence: ${fixDetails.aiConfidence})`)
      }
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

    console.log(`Fix reward transaction created: ${transaction.id} for post ${postId}, ${reward} sats earned`)
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

    // Look up the fixer by username
    const { data: fixerProfile, error: fixerError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', fixerUsername)
      .single()

    if (fixerError || !fixerProfile) {
      return { success: false, error: `User "${fixerUsername}" not found` }
    }

    // Update the post to mark it as fixed
    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        fixed: true,
        fixed_at: nowIso,
        fixed_by: fixerProfile.id,
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Error updating post:', updateError)
      return { success: false, error: 'Failed to update post' }
    }

    // Use createFixRewardAction to handle reward transfer, activities, and emails
    // Pass isPostOwnerClosing=true to allow transfer to any user (not just connected accounts)
    const rewardResult = await createFixRewardAction({
      postId,
      userId: fixerProfile.id,
      reward: post.reward || 0,
      postTitle: post.title,
      isPostOwnerClosing: true // Allow poster to designate any user as fixer
    })

    if (!rewardResult.success) {
      console.error('Error creating fix reward:', rewardResult.error)
      // Post is already marked as fixed, return failure so user knows reward wasn't transferred
      return { success: false, error: rewardResult.error || 'Failed to transfer reward' }
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

    // Soft delete the post
    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        deleted_at: nowIso,
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Error deleting post:', updateError)
      return { success: false, error: 'Failed to delete post' }
    }

    // Create activity for the deletion
    await supabase.from('activities').insert({
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

    // Refund the reward back to the poster's balance
    if (post.reward && post.reward > 0) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', effectiveUserId)
        .single()

      if (profileError) {
        console.error('Error fetching profile for refund:', profileError)
      }

      if (profile) {
        const newBalance = (profile.balance || 0) + post.reward
        console.log(`Refunding ${post.reward} sats to user ${effectiveUserId}. Current balance: ${profile.balance}, New balance: ${newBalance}`)
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            balance: newBalance,
            updated_at: nowIso,
          })
          .eq('id', effectiveUserId)

        if (updateError) {
          console.error('Error updating profile balance for refund:', updateError)
        } else {
          console.log(`Successfully updated balance to ${newBalance} for user ${effectiveUserId}`)
        }

        // Create a transaction record for the refund
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: effectiveUserId,
          type: 'internal',
          amount: post.reward,
          status: 'completed',
          memo: `Refund for deleted post: ${post.title || 'Issue'}`,
        })

        if (txError) {
          console.error('Error creating refund transaction:', txError)
        }
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
