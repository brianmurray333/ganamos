import { NextRequest, NextResponse } from 'next/server'
import { verifyL402Token, parseL402Header } from '@/lib/l402'
import { createServerSupabaseClient } from '@/lib/supabase'

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
        funding_r_hash
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

    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        fixed: true,
        fixed_at: nowIso,
        under_review: false,
        fixed_image_url: post.submitted_fix_image_url,
        fix_proof_text: post.submitted_fix_proof_text,
        fixer_note: post.submitted_fix_note,
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Error approving fix:', updateError)
      return corsResponse(
        NextResponse.json({ error: 'Failed to approve fix' }, { status: 500 })
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
    if (payoutTarget && post.reward > 0) {
      try {
        const payoutResult = await payFixer(postId, payoutTarget, post.reward, supabase)
        response.reward_paid = payoutResult.success
        if (payoutResult.success) {
          response.reward_payment_hash = payoutResult.paymentHash
          response.message = `Fix approved and ${post.reward} sat reward paid to fixer.`
        } else {
          response.reward_error = payoutResult.error
          response.message = `Fix approved but reward payout failed: ${payoutResult.error}`
        }
      } catch (err) {
        console.error('Error paying fixer:', err)
        response.reward_paid = false
        response.reward_error = 'Unexpected error during payout'
        response.message = 'Fix approved but reward payout encountered an error.'
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

async function payFixer(
  postId: string,
  payoutTarget: string,
  reward: number,
  supabase: ReturnType<typeof createServerSupabaseClient>,
): Promise<{ success: boolean; paymentHash?: string; error?: string }> {
  const trimmed = payoutTarget.trim().toLowerCase()
  let invoiceToPay = trimmed

  // Lightning address -> invoice conversion
  if (trimmed.includes('@') && trimmed.includes('.')) {
    const [user, domain] = trimmed.split('@')
    const lookupUrl = `https://${domain}/.well-known/lnurlp/${user}`

    const lookupResponse = await fetch(lookupUrl)
    if (!lookupResponse.ok) {
      return { success: false, error: 'Failed to lookup Lightning address' }
    }

    const lookupData = await lookupResponse.json()
    if (!lookupData.callback) {
      return { success: false, error: 'Invalid Lightning address response' }
    }

    const callbackUrl = new URL(lookupData.callback)
    callbackUrl.searchParams.set('amount', (reward * 1000).toString())

    const invoiceResponse = await fetch(callbackUrl.toString())
    if (!invoiceResponse.ok) {
      return { success: false, error: 'Failed to generate invoice from Lightning address' }
    }

    const invoiceData = await invoiceResponse.json()
    if (!invoiceData.pr) {
      return { success: false, error: 'Invalid invoice response from Lightning address' }
    }

    invoiceToPay = invoiceData.pr
  }

  const { payInvoice } = await import('@/lib/lightning')
  const paymentResult = await payInvoice(invoiceToPay)

  if (!paymentResult.success) {
    return { success: false, error: 'Lightning payment failed' }
  }

  const now = new Date().toISOString()
  await supabase
    .from('posts')
    .update({
      anonymous_reward_paid_at: now,
      anonymous_reward_payment_hash: paymentResult.paymentHash || paymentResult.paymentPreimage,
    })
    .eq('id', postId)

  return { success: true, paymentHash: paymentResult.paymentHash || paymentResult.paymentPreimage }
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
