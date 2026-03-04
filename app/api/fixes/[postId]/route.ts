import { NextRequest, NextResponse } from 'next/server'
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/fixes/[postId] - Poll fix submission status using L402 token
 *
 * Fixer agents reuse their original L402 token (from POST /api/fixes) to check
 * whether their fix was approved or rejected by the poster.
 *
 * Authentication: The L402 token's payment_hash must match the post's
 * submitted_fix_payment_hash, proving the caller is the fixer who submitted.
 * Expiry is skipped since payment proof is permanent (bearer instrument).
 *
 * Response includes:
 * - Fix lifecycle status (pending_review / approved / rejected / not_found)
 * - Reward details and payout status when approved
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params

  try {
    const authHeader = request.headers.get('Authorization')

    if (!authHeader) {
      return corsResponse(
        NextResponse.json(
          { error: 'L402 token required. Use the same token from your POST /api/fixes payment.' },
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
        id, title, reward, under_review, fixed, fixed_at, deleted_at,
        submitted_fix_at, submitted_fix_payment_hash,
        submitted_fix_proof_text, submitted_fix_image_url, submitted_fix_note,
        submitted_fix_payout_invoice,
        fix_proof_text, fixed_image_url, fixer_note,
        anonymous_reward_paid_at, anonymous_reward_payment_hash
      `)
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return corsResponse(
        NextResponse.json({ error: 'Post not found' }, { status: 404 })
      )
    }

    if (post.submitted_fix_payment_hash !== verification.paymentHash) {
      return corsResponse(
        NextResponse.json(
          { error: 'L402 token does not match a fix submission on this post. You can only check status of fixes you submitted.' },
          { status: 403 }
        )
      )
    }

    let status: 'pending_review' | 'approved' | 'rejected' | 'post_deleted'
    if (post.deleted_at) {
      status = 'post_deleted'
    } else if (post.fixed) {
      status = 'approved'
    } else if (post.under_review) {
      status = 'pending_review'
    } else {
      // Post is not under review and not fixed — fix was rejected
      // (rejection clears under_review but doesn't set fixed)
      status = 'rejected'
    }

    const response: Record<string, unknown> = {
      post_id: post.id,
      fix_status: status,
      title: post.title,
      reward: post.reward,
      submitted_at: post.submitted_fix_at,
    }

    if (status === 'pending_review') {
      response.message = 'Your fix is awaiting review by the poster.'
    }

    if (status === 'approved') {
      response.fixed_at = post.fixed_at
      response.message = 'Your fix was approved!'

      if (post.anonymous_reward_paid_at) {
        response.reward_paid = true
        response.reward_paid_at = post.anonymous_reward_paid_at
      } else if (post.submitted_fix_payout_invoice) {
        response.reward_paid = false
        response.message = 'Your fix was approved! Reward payout is pending.'
      } else {
        response.reward_paid = false
        response.message = 'Your fix was approved! Provide a payout invoice to claim your reward.'
      }
    }

    if (status === 'rejected') {
      response.message = 'Your fix was not approved. The post is open for new submissions.'
    }

    if (status === 'post_deleted') {
      response.message = 'This post has been deleted.'
    }

    return corsResponse(NextResponse.json(response))
  } catch (error) {
    console.error('Error in GET /api/fixes/[postId]:', error)
    return corsResponse(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    )
  }
}

function corsResponse(response: NextResponse): NextResponse {
  if (process.env.NODE_ENV === 'development') {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  return new NextResponse(null, { status: 204 })
}
