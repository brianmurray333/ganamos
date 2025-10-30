"use server"

import { createInvoice, checkInvoice } from "@/lib/lightning"
import { v4 as uuidv4 } from "uuid" // Ensure uuid is imported if used, e.g. in createFundedAnonymousPostAction
import { createServerSupabaseClient } from "@/lib/supabase" // For createFundedAnonymousPostAction
import { validateLightningInvoice, validateInvoiceAmount } from "@/lib/lightning-validation"

async function getCookieStore() {
  const { cookies } = await import("next/headers")
  return cookies()
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

    if (!updateError) {
      await supabase.from("activities").insert({
        id: uuidv4(),
        user_id: post && post.fixed_by ? post.fixed_by : null,
        type: "reward",
        related_id: postId,
        related_table: "posts",
        timestamp: now,
        metadata: { amount: post ? post.reward : undefined },
      });
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
  const now = new Date().toISOString()

  try {
    const { error } = await supabase
      .from("posts")
      .update({
        under_review: true,
        submitted_fix_by_id: null, // Indicates anonymous submission for review
        submitted_fix_by_name: "Anonymous Fixer (Pending Review)",
        submitted_fix_by_avatar: null,
        submitted_fix_at: now,
        submitted_fix_image_url: fixImageUrl,
        submitted_fix_note: fixerNote,
        ai_confidence_score: aiConfidence,
        ai_analysis: aiAnalysis,
        // Ensure these are not set yet
        fixed: false,
        fixed_by_is_anonymous: false, // Not yet fixed by anonymous, just submitted
      })
      .eq("id", postId)

    if (error) {
      console.error("Error in submitAnonymousFixForReviewAction:", error)
      return { success: false, error: error.message }
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
    
    // Credit the user's balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, fixed_issues_count')
      .eq('id', userId)
      .single()
    
    if (profileError || !profile) {
      return { success: false, error: 'User profile not found' }
    }
    
    const newBalance = (profile.balance || 0) + post.reward
    const newFixedCount = (profile.fixed_issues_count || 0) + 1
    
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({
        balance: newBalance,
        fixed_issues_count: newFixedCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    
    if (balanceError) {
      console.error('Error updating balance:', balanceError)
      return { success: false, error: 'Failed to credit reward' }
    }
    
    // Create activity record
    await supabase.from('activities').insert({
      user_id: userId,
      type: 'fix',
      related_id: postId,
      related_table: 'posts',
      timestamp: new Date().toISOString(),
      metadata: { title: post.title, sats: post.reward },
    })
    
    console.log(`Claimed anonymous reward: ${post.reward} sats for user ${userId}`)
    return { success: true, amount: post.reward }
  } catch (error) {
    console.error('Error in claimAnonymousRewardAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
