import { NextRequest, NextResponse } from 'next/server'
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/posts/[id]/reject - Poster agent rejects a submitted fix
 *
 * The poster uses their original L402 token (from POST /api/posts) to reject
 * a fix that's been submitted for review. This reopens the post for new submissions.
 *
 * Authentication: The L402 token's payment_hash must match the post's funding_r_hash.
 *
 * Optional request body:
 * { "reason": "The fix doesn't address the issue" }
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
        id, fixed, under_review, deleted_at, funding_r_hash,
        submitted_fix_payment_hash
      `)
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return corsResponse(
        NextResponse.json({ error: 'Post not found' }, { status: 404 })
      )
    }

    if (post.funding_r_hash !== verification.paymentHash) {
      return corsResponse(
        NextResponse.json(
          { error: 'L402 token does not match this post. You can only reject fixes on posts you created.' },
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
        NextResponse.json({ error: 'Fix has already been approved and cannot be rejected' }, { status: 409 })
      )
    }

    if (!post.under_review) {
      return corsResponse(
        NextResponse.json({ error: 'No fix is currently submitted for review' }, { status: 409 })
      )
    }

    // Parse optional rejection reason
    let reason: string | null = null
    try {
      const body = await request.json()
      if (body.reason && typeof body.reason === 'string') {
        reason = body.reason.substring(0, 500)
      }
    } catch {
      // No body or invalid JSON — that's fine, reason is optional
    }

    const { error: updateError } = await supabase
      .from('posts')
      .update({
        under_review: false,
        submitted_fix_by_id: null,
        submitted_fix_by_name: null,
        submitted_fix_by_avatar: null,
        submitted_fix_at: null,
        submitted_fix_image_url: null,
        submitted_fix_note: null,
        submitted_fix_proof_text: null,
        submitted_fix_payment_hash: null,
        submitted_fix_payout_invoice: null,
        submitted_fix_lightning_address: null,
        ai_confidence_score: null,
        ai_analysis: null,
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Error rejecting fix:', updateError)
      return corsResponse(
        NextResponse.json({ error: 'Failed to reject fix' }, { status: 500 })
      )
    }

    return corsResponse(
      NextResponse.json({
        success: true,
        post_id: postId,
        message: 'Fix rejected. The post is now open for new submissions.',
        reason,
      })
    )
  } catch (error) {
    console.error('Error in POST /api/posts/[id]/reject:', error)
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
