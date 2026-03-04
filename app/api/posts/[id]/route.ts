import { NextRequest, NextResponse } from 'next/server'
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/posts/[id] - Poll post status using L402 token
 *
 * Poster agents reuse their original L402 token (from POST /api/posts) to check
 * whether someone has submitted a fix, and whether it's been approved or rejected.
 *
 * Authentication: The L402 token's payment_hash must match the post's funding_r_hash,
 * proving the caller is the original poster. Expiry is skipped since payment proof
 * is permanent (bearer instrument).
 *
 * Response includes:
 * - Post lifecycle status (open / under_review / fixed / deleted)
 * - Fix submission details when applicable
 * - Fixer payout invoice if provided
 */
export async function GET(
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
        id, title, description, reward, created_at, expires_at,
        fixed, fixed_at, fixed_by, under_review, deleted_at,
        submitted_fix_at, submitted_fix_by_name, submitted_fix_image_url,
        submitted_fix_note, submitted_fix_proof_text, submitted_fix_payout_invoice,
        fix_proof_text, fixed_image_url, fixer_note,
        funding_r_hash, has_image
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
          { error: 'L402 token does not match this post. You can only check status of posts you created.' },
          { status: 403 }
        )
      )
    }

    let status: 'open' | 'under_review' | 'fixed' | 'deleted'
    if (post.deleted_at) {
      status = 'deleted'
    } else if (post.fixed) {
      status = 'fixed'
    } else if (post.under_review) {
      status = 'under_review'
    } else {
      status = 'open'
    }

    const response: Record<string, unknown> = {
      post_id: post.id,
      status,
      title: post.title,
      description: post.description,
      reward: post.reward,
      has_image: post.has_image,
      created_at: post.created_at,
      expires_at: post.expires_at,
    }

    if (status === 'under_review') {
      response.fix_submission = {
        submitted_at: post.submitted_fix_at,
        fixer_name: post.submitted_fix_by_name,
        proof_image_url: post.submitted_fix_image_url,
        proof_text: post.submitted_fix_proof_text,
        note: post.submitted_fix_note,
        payout_invoice: post.submitted_fix_payout_invoice,
      }
    }

    if (status === 'fixed') {
      response.fix_result = {
        fixed_at: post.fixed_at,
        fixed_by: post.fixed_by,
        fix_image_url: post.fixed_image_url,
        fix_proof_text: post.fix_proof_text,
        fixer_note: post.fixer_note,
      }
    }

    return corsResponse(NextResponse.json(response))
  } catch (error) {
    console.error('Error in GET /api/posts/[id]:', error)
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
