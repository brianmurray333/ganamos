import { NextRequest, NextResponse } from 'next/server'
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createAdminClient, isPostRewardFunded, payAnonymousRewardViaLightning, payFixReward } from '@/lib/payouts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/posts/[id]/approve - Poster agent approves a submitted fix
 *
 * The poster uses their original L402 token (from POST /api/posts) to approve
 * a fix that's been submitted for review. If the fixer provided a payout_invoice,
 * the reward is paid out automatically via Lightning.
 *
 * Authentication: The L402 token's payment_hash must match the post's funding_r_hash.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params

  try {
    const authHeader = request.headers.get('Authorization')

    if (!authHeader) {
      return corsResponse(
        NextResponse.json(
          { error: 'L402 token required. Use the same token from your original POST /api/posts payment.' },
          { status: 401 }
        )
      )
    }

    const l402Token = parseL402Header(authHeader)
    if (!l402Token) {
      return corsResponse(
        NextResponse.json(
          { error: 'Invalid Authorization header format. Expected: L402 <macaroon>:<preimage>' },
          { status: 401 }
        )
      )
    }

    const verification = await verifyL402Token(l402Token, { skipExpiry: true })
    if (!verification.success) {
      return corsResponse(
        NextResponse.json(
          { error: `L402 verification failed: ${verification.error}` },
          { status: 401 }
        )
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        id, reward, fixed, under_review, deleted_at,
        submitted_fix_at, submitted_fix_by_name, submitted_fix_proof_text,
        submitted_fix_image_url, submitted_fix_note,
        submitted_fix_payout_invoice, submitted_fix_lightning_address,
        funding_r_hash, submitted_fix_by_id
      `)
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return corsResponse(
        NextResponse.json({ error: 'Post not found' }, { status: 404 })
      )
    }

    if (!post.funding_r_hash || post.funding_r_hash !== verification.paymentHash) {
      return corsResponse(
        NextResponse.json(
          { error: 'L402 token does not match this post. You can only approve fixes on posts you created.' },
          { status: 403 }
        )
      )
    }

    if (post.deleted_at) {
      return corsResponse(
        NextResponse.json({ error: 'Post has been deleted' }, { status: 409 })
      )
    }

    if (post.fixed) {
      return corsResponse(
        NextResponse.json({ error: 'Fix has already been approved' }, { status: 409 })
      )
    }

    if (!post.under_review) {
      return corsResponse(
        NextResponse.json({ error: 'No fix is currently submitted for review' }, { status: 409 })
      )
    }

    const admin = createAdminClient()
    if (!(await isPostRewardFunded(admin, { id: postId }))) {
      return corsResponse(
        NextResponse.json({ error: "This post's reward was never funded." }, { status: 409 })
      )
    }

    // A signed-in fixer is paid to their balance; anyone else over Lightning.
    const registeredFixer: string | null = post.submitted_fix_by_id || null

    // Approve atomically: only one request can move the post to fixed.
    const nowIso = new Date().toISOString()
    const { data: approved, error: updateError } = await admin
      .from('posts')
      .update({
        fixed: true,
        fixed_at: nowIso,
        fixed_by: registeredFixer,
        fixed_by_is_anonymous: !registeredFixer,
        under_review: false,
        fixed_image_url: post.submitted_fix_image_url,
        fix_proof_text: post.submitted_fix_proof_text,
        fixer_note: post.submitted_fix_note,
      })
      .eq('id', postId)
      .eq('fixed', false)
      .eq('under_review', true)
      .is('deleted_at', null)
      .select('id')

    if (updateError) {
      console.error('Error approving fix:', updateError)
      return corsResponse(
        NextResponse.json({ error: 'Failed to approve fix' }, { status: 500 })
      )
    }
    if (!approved?.length) {
      return corsResponse(
        NextResponse.json({ error: 'Fix has already been approved' }, { status: 409 })
      )
    }

    const response: Record<string, unknown> = {
      success: true,
      post_id: postId,
      message: 'Fix approved successfully.',
      approved_at: nowIso,
    }

    // Pay the fixer if they provided a payout invoice or lightning address
    const payoutTarget = post.submitted_fix_payout_invoice || post.submitted_fix_lightning_address
    if (registeredFixer && post.reward > 0) {
      const payout = await payFixReward(admin, {
        postId,
        fixerId: registeredFixer,
        memo: 'Fix reward earned (agent-approved)',
      })
      response.reward_paid = payout.success
      if (payout.success) {
        response.message = `Fix approved and ${payout.amount} sat reward credited to the fixer.`
      } else {
        response.reward_error = payout.error
        response.message = `Fix approved but reward payout failed: ${payout.error}`
      }
    } else if (payoutTarget && post.reward > 0) {
      const payout = await payAnonymousRewardViaLightning(admin, {
        postId,
        target: payoutTarget,
        source: 'POST /api/posts/[id]/approve',
      })
      response.reward_paid = payout.success
      if (payout.success) {
        response.reward_payment_hash = payout.paymentHash
        response.message = `Fix approved and ${payout.amount} sat reward paid to fixer.`
      } else {
        response.reward_error = payout.error
        response.message = `Fix approved but reward payout failed: ${payout.error}`
      }
    } else {
      response.reward_paid = false
      response.message = 'Fix approved. No payout invoice was provided by the fixer.'
    }

    return corsResponse(NextResponse.json(response))
  } catch (error) {
    console.error('Error in POST /api/posts/[id]/approve:', error)
    return corsResponse(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    )
  }
}

function corsResponse(response: NextResponse): NextResponse {
  if (process.env.NODE_ENV === 'development') {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  return response
}

export async function OPTIONS() {
  if (process.env.NODE_ENV === 'development') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  return new NextResponse(null, { status: 204 })
}
