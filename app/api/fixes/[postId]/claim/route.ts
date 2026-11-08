import { NextRequest, NextResponse } from 'next/server'
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createAdminClient, payAnonymousRewardViaLightning } from '@/lib/payouts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/fixes/[postId]/claim - Fixer claims reward with a new payout invoice
 *
 * After a fix is approved, the fixer can provide a new BOLT11 invoice or Lightning
 * address to claim their reward. Useful when the initial payout failed (routing,
 * expired invoice, etc.) or no payout_invoice was provided at submission time.
 *
 * Authentication: The L402 token's payment_hash must match the post's
 * submitted_fix_payment_hash, proving the caller is the fixer.
 *
 * Request body:
 * { "payout_invoice": "lnbc..." or "user@domain.com" }
 */
export async function POST(
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

    let body: { payout_invoice?: string }
    try {
      body = await request.json()
    } catch {
      return corsResponse(
        NextResponse.json({ error: 'Invalid request body. Expected JSON with payout_invoice.' }, { status: 400 })
      )
    }

    if (!body.payout_invoice || typeof body.payout_invoice !== 'string') {
      return corsResponse(
        NextResponse.json({ error: 'payout_invoice is required (BOLT11 invoice or Lightning address).' }, { status: 400 })
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        id, reward, fixed, deleted_at,
        submitted_fix_payment_hash,
        anonymous_reward_paid_at, anonymous_reward_payment_hash, reward_paid_at
      `)
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return corsResponse(
        NextResponse.json({ error: 'Post not found' }, { status: 404 })
      )
    }

    if (!post.submitted_fix_payment_hash || post.submitted_fix_payment_hash !== verification.paymentHash) {
      return corsResponse(
        NextResponse.json(
          { error: 'L402 token does not match a fix submission on this post.' },
          { status: 403 }
        )
      )
    }

    if (post.deleted_at) {
      return corsResponse(
        NextResponse.json({ error: 'Post has been deleted' }, { status: 409 })
      )
    }

    if (!post.fixed) {
      return corsResponse(
        NextResponse.json({ error: 'Fix has not been approved yet. Wait for the poster to approve.' }, { status: 409 })
      )
    }

    if (post.anonymous_reward_paid_at || post.reward_paid_at) {
      return corsResponse(
        NextResponse.json({
          error: 'Reward has already been paid.',
          paid_at: post.anonymous_reward_paid_at,
          payment_hash: post.anonymous_reward_payment_hash,
        }, { status: 409 })
      )
    }

    if (post.reward <= 0) {
      return corsResponse(
        NextResponse.json({ error: 'This post has no reward to claim.' }, { status: 409 })
      )
    }

    // Pay atomically, at most once (lock + paid markers), for exactly the
    // post's reward. The new invoice is used for this attempt only.
    const payoutResult = await payAnonymousRewardViaLightning(createAdminClient(), {
      postId,
      target: body.payout_invoice,
      source: 'POST /api/fixes/[postId]/claim',
    })

    if (payoutResult.success) {
      return corsResponse(
        NextResponse.json({
          success: true,
          post_id: postId,
          reward_paid: true,
          reward_amount: payoutResult.amount,
          payment_hash: payoutResult.paymentHash,
          message: `Reward of ${payoutResult.amount} sats paid successfully.`,
        })
      )
    }

    const retryable = payoutResult.code === 'invalid_invoice' || payoutResult.code === 'payment_failed'
    return corsResponse(
      NextResponse.json({
        success: false,
        post_id: postId,
        reward_paid: false,
        error: payoutResult.error,
        message: retryable
          ? 'Payment failed. You can retry with a different invoice.'
          : payoutResult.error,
      }, { status: retryable ? 502 : 409 })
    )
  } catch (error) {
    console.error('Error in POST /api/fixes/[postId]/claim:', error)
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
