import { NextRequest, NextResponse } from 'next/server'
import { createL402Challenge, verifyL402Token, parseL402Header } from '@/lib/l402'
import { submitAnonymousFixForReviewAction } from '@/app/actions/post-actions'

export const dynamic = 'force-dynamic'

const API_ACCESS_FEE = 10 // 10 sat anti-spam fee for fix submissions

/**
 * POST /api/fixes - Submit a fix for a post via L402-protected API
 * 
 * Designed for AI agents and programmatic clients. Supports text-based proof
 * (URLs, descriptions) and/or image URLs as evidence of completion.
 * 
 * Flow:
 * 1. If no L402 token provided, return 402 Payment Required with invoice
 * 2. If L402 token provided, verify payment and submit fix
 * 
 * Request body:
 * {
 *   "post_id": "uuid",              // required: which post to fix
 *   "proof_text": "string",         // required*: text proof (URLs, description of work done)
 *   "proof_image_url": "https://...", // required*: image proof URL
 *   "note": "string"                // optional: additional note from fixer
 * }
 * 
 * *At least one of proof_text or proof_image_url must be provided.
 * 
 * AI VALIDATION FEASIBILITY NOTES:
 * --------------------------------
 * Future AI validation of text-based proof (e.g. verifying a retweet URL) is feasible
 * via several approaches:
 * 
 * 1. URL verification: For social media URLs (x.com, github.com, etc.), an AI agent
 *    could fetch the URL and verify it matches the task. For retweets specifically,
 *    the X/Twitter API (or scraping) could confirm the retweet exists, was made after
 *    the post was created, and references the correct original tweet.
 * 
 * 2. Screenshot verification: The fixer could be asked to provide a screenshot as
 *    proof_image_url alongside the URL. AI vision models can then verify the screenshot
 *    shows the expected action (retweet, comment, etc.).
 * 
 * 3. On-chain/API verification: For verifiable actions (GitHub PRs, on-chain txns,
 *    social media interactions), direct API calls can provide cryptographic proof
 *    without relying on AI at all.
 * 
 * 4. Hybrid approach: Use API verification where available, fall back to AI vision
 *    for screenshots, and require manual review for unverifiable text claims.
 * 
 * The current implementation routes all text-based submissions to manual review,
 * which is the safest starting point. AI auto-verification can be layered on later
 * per proof type.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader) {
      return await issueL402Challenge()
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

    const verification = await verifyL402Token(l402Token)
    if (!verification.success) {
      return corsResponse(
        NextResponse.json(
          { error: `L402 verification failed: ${verification.error}` },
          { status: 401 }
        )
      )
    }

    const body = await request.json()
    const { post_id, proof_text, proof_image_url, note, payout_invoice } = body

    if (!post_id || typeof post_id !== 'string') {
      return corsResponse(
        NextResponse.json({ error: 'post_id is required and must be a string' }, { status: 400 })
      )
    }

    if (!proof_text && !proof_image_url) {
      return corsResponse(
        NextResponse.json(
          { error: 'At least one of proof_text or proof_image_url is required' },
          { status: 400 }
        )
      )
    }

    if (proof_text && typeof proof_text !== 'string') {
      return corsResponse(
        NextResponse.json({ error: 'proof_text must be a string' }, { status: 400 })
      )
    }

    if (proof_image_url && typeof proof_image_url !== 'string') {
      return corsResponse(
        NextResponse.json({ error: 'proof_image_url must be a string (URL)' }, { status: 400 })
      )
    }

    if (payout_invoice && typeof payout_invoice !== 'string') {
      return corsResponse(
        NextResponse.json({ error: 'payout_invoice must be a string (BOLT11 invoice or Lightning address)' }, { status: 400 })
      )
    }

    // Submit fix for review (all API-submitted fixes go to manual review)
    const result = await submitAnonymousFixForReviewAction(
      post_id,
      proof_image_url || null,
      note || null,
      null, // aiConfidence: null signals manual review
      null, // aiAnalysis: null
      proof_text || null,
      verification.paymentHash || null,
      payout_invoice || null,
    )

    if (!result.success) {
      return corsResponse(
        NextResponse.json({ error: result.error }, { status: 400 })
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ganamos.earth'

    return corsResponse(
      NextResponse.json({
        success: true,
        post_id,
        message: 'Fix submitted for review. Poll status_url with your L402 token to track approval.',
        payment_hash: verification.paymentHash,
        status_url: `${appUrl}/api/fixes/${post_id}`,
      }, { status: 201 })
    )

  } catch (error) {
    console.error('Error in /api/fixes:', error)
    return corsResponse(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    )
  }
}

async function issueL402Challenge() {
  const challengeResult = await createL402Challenge(
    API_ACCESS_FEE,
    `Pay ${API_ACCESS_FEE} sat to submit a fix on Ganamos`,
    'ganamos-fixes'
  )

  if (!challengeResult.success) {
    return corsResponse(
      NextResponse.json(
        { error: `Failed to create payment challenge: ${challengeResult.error}` },
        { status: 500 }
      )
    )
  }

  const response = NextResponse.json({
    error: 'Payment required to submit fix',
    amount: API_ACCESS_FEE,
    currency: 'sats',
    message: `Pay ${API_ACCESS_FEE} sat anti-spam fee to submit your fix proof`,
    payment_request: challengeResult.challenge!.invoice
  }, { status: 402 })
  
  response.headers.set(
    'WWW-Authenticate',
    `L402 macaroon="${challengeResult.challenge!.macaroon}", invoice="${challengeResult.challenge!.invoice}"`
  )

  return corsResponse(response)
}

function corsResponse(response: NextResponse): NextResponse {
  if (process.env.NODE_ENV === 'development') {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  return response
}

/**
 * GET /api/fixes - API documentation
 */
export async function GET() {
  return corsResponse(
    NextResponse.json({
      message: 'Fix Submissions API',
      endpoints: {
        'POST /api/fixes': 'Submit a fix for a post (requires L402 payment)',
        'GET /api/fixes/{post_id}': 'Poll fix status (reuse your L402 token, no extra payment)',
        'POST /api/fixes/{post_id}/claim': 'Claim reward with a new invoice after approval (reuse your L402 token)',
      },
      l402_info: {
        fee: `${API_ACCESS_FEE} sat (anti-spam)`,
        currency: 'satoshis',
      },
      request_body: {
        post_id: 'string (required) - UUID of the post to fix',
        proof_text: 'string (required*) - text proof: URLs, description of work done',
        proof_image_url: 'string (required*) - URL of proof image',
        note: 'string (optional) - additional note from fixer',
        payout_invoice: 'string (optional) - BOLT11 invoice or Lightning address for reward payout on approval',
      },
      notes: '*At least one of proof_text or proof_image_url must be provided.',
      status_polling: 'After submitting, reuse your L402 token (Authorization header) to GET /api/fixes/{post_id} for status updates. No additional payment required.',
      reward_claim: 'If your fix is approved but payout failed (or you did not provide a payout_invoice), POST /api/fixes/{post_id}/claim with { "payout_invoice": "lnbc..." } to retry. You can call this as many times as needed with different invoices.',
    })
  )
}

export async function OPTIONS() {
  if (process.env.NODE_ENV === 'development') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  return new NextResponse(null, { status: 204 })
}
