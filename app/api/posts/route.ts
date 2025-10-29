import { NextRequest, NextResponse } from 'next/server'
import { createL402Challenge, verifyL402Token, parseL402Header, createL402Headers } from '@/lib/l402'
import { createFundedAnonymousPostAction } from '@/app/actions/post-actions'
import { v4 as uuidv4 } from '@/lib/uuid'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

// Configuration
const API_ACCESS_FEE = 10 // Fixed 10 sats fee for API access
const MIN_JOB_REWARD = 0 // Minimum job reward in sats
const DEFAULT_JOB_REWARD = 1000 // Default job reward in sats

/**
 * POST /api/posts - Create a new post via L402-protected API
 * 
 * Flow:
 * 1. If no L402 token provided, return 402 Payment Required with invoice
 * 2. If L402 token provided, verify payment and create post
 * 
 * Request body:
 * {
 *   "title": "Post title",
 *   "description": "Post description", 
 *   "image_url": "https://...", // optional
 *   "location": "Location name", // optional
 *   "latitude": 37.7749, // optional
 *   "longitude": -122.4194, // optional
 *   "reward": 1000 // reward in sats (total payment = reward + 10 sats API fee)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    
    // If no Authorization header, issue L402 challenge
    if (!authHeader) {
      // Parse request body to get job reward
      const body = await request.json()
      const { reward } = body
      const jobReward = typeof reward === 'number' ? Math.max(MIN_JOB_REWARD, reward) : DEFAULT_JOB_REWARD
      const totalCost = jobReward + API_ACCESS_FEE // Job reward + API fee
      
      return await issueL402Challenge(totalCost, jobReward)
    }

    // Parse L402 token
    const l402Token = parseL402Header(authHeader)
    if (!l402Token) {
      const errorResponse = NextResponse.json(
        { error: 'Invalid Authorization header format. Expected: L402 <macaroon>:<preimage>' },
        { status: 401 }
      )
      
      // Add CORS headers for development
      errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      errorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      
      return errorResponse
    }

    // Verify L402 token
    const verification = await verifyL402Token(l402Token)
    if (!verification.success) {
      const verificationErrorResponse = NextResponse.json(
        { error: `L402 verification failed: ${verification.error}` },
        { status: 401 }
      )
      
      // Add CORS headers for development
      verificationErrorResponse.headers.set('Access-Control-Allow-Origin', '*')
      verificationErrorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      verificationErrorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      
      return verificationErrorResponse
    }

    // Parse request body
    const body = await request.json()
    const { title, description, image_url, location, latitude, longitude, reward } = body

    // Validate required fields
    if (!description || typeof description !== 'string') {
      const validationErrorResponse = NextResponse.json(
        { error: 'Description is required and must be a string' },
        { status: 400 }
      )
      
      // Add CORS headers for development
      validationErrorResponse.headers.set('Access-Control-Allow-Origin', '*')
      validationErrorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      validationErrorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      
      return validationErrorResponse
    }

    if (reward && (typeof reward !== 'number' || reward < 0)) {
      const rewardErrorResponse = NextResponse.json(
        { error: 'Reward must be a non-negative number' },
        { status: 400 }
      )
      
      // Add CORS headers for development
      rewardErrorResponse.headers.set('Access-Control-Allow-Origin', '*')
      rewardErrorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      rewardErrorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      
      return rewardErrorResponse
    }

    // Calculate expected payment (job reward + API fee)
    const jobReward = typeof reward === 'number' ? Math.max(MIN_JOB_REWARD, reward) : DEFAULT_JOB_REWARD
    const expectedTotalPayment = jobReward + API_ACCESS_FEE

    // Verify the payment amount matches the expected total
    const amountCaveat = verification.macaroon?.caveats.find(c => c.condition === 'amount')
    if (amountCaveat && parseInt(amountCaveat.value) !== expectedTotalPayment) {
      const mismatchErrorResponse = NextResponse.json(
        { error: `Payment amount mismatch. Expected ${expectedTotalPayment} sats (${jobReward} reward + ${API_ACCESS_FEE} API fee), but token was for ${amountCaveat.value} sats` },
        { status: 401 }
      )
      
      // Add CORS headers for development
      mismatchErrorResponse.headers.set('Access-Control-Allow-Origin', '*')
      mismatchErrorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      mismatchErrorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      
      return mismatchErrorResponse
    }

    // Create the post using existing logic
    const postResult = await createFundedAnonymousPostAction({
      description,
      reward: jobReward, // Use the validated job reward
      image_url: image_url || null,
      location: location || null,
      latitude: latitude || null,
      longitude: longitude || null,
      city: location || null, // Use location as city for now
      funding_r_hash: verification.paymentHash!,
      funding_payment_request: '' // We don't have the original payment request, but it's paid
    })

    if (!postResult.success) {
      const postErrorResponse = NextResponse.json(
        { error: `Failed to create post: ${postResult.error}` },
        { status: 500 }
      )
      
      // Add CORS headers for development
      postErrorResponse.headers.set('Access-Control-Allow-Origin', '*')
      postErrorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      postErrorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      
      return postErrorResponse
    }

    const successResponse = NextResponse.json({
      success: true,
      post_id: postResult.postId,
      message: 'Job posted successfully',
      job_reward: jobReward,
      api_fee: API_ACCESS_FEE,
      total_paid: expectedTotalPayment,
      payment_hash: verification.paymentHash
    }, { status: 201 })
    
    // Add CORS headers for development only
    if (process.env.NODE_ENV === 'development') {
      successResponse.headers.set('Access-Control-Allow-Origin', '*')
      successResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      successResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    
    return successResponse

  } catch (error) {
    console.error('Error in /api/posts:', error)
    const errorResponse = NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
    
    // Add CORS headers for development
    errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    errorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    return errorResponse
  }
}

/**
 * Issue L402 challenge (402 Payment Required)
 */
async function issueL402Challenge(totalAmount: number, jobReward: number) {
  const challengeResult = await createL402Challenge(
    totalAmount,
    `Pay ${totalAmount} sats to post job on Ganamos (${jobReward} reward + ${API_ACCESS_FEE} API fee)`,
    'ganamos-posts'
  )

  if (!challengeResult.success) {
    const challengeErrorResponse = NextResponse.json(
      { error: `Failed to create payment challenge: ${challengeResult.error}` },
      { status: 500 }
    )
    
    // Add CORS headers for development
    challengeErrorResponse.headers.set('Access-Control-Allow-Origin', '*')
    challengeErrorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    challengeErrorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    return challengeErrorResponse
  }

  const challengeResponse = NextResponse.json({
    error: 'Payment required to post job',
    total_amount: totalAmount,
    job_reward: jobReward,
    api_fee: API_ACCESS_FEE,
    currency: 'sats',
    message: `Pay ${totalAmount} sats to post your job (${jobReward} reward + ${API_ACCESS_FEE} API fee)`,
    payment_request: challengeResult.challenge!.invoice
  }, { 
    status: 402
  })
  
  // Add L402 headers
  challengeResponse.headers.set('WWW-Authenticate', `L402 macaroon="${challengeResult.challenge!.macaroon}", invoice="${challengeResult.challenge!.invoice}"`)
  
  // Add CORS headers for development only
  if (process.env.NODE_ENV === 'development') {
    challengeResponse.headers.set('Access-Control-Allow-Origin', '*')
    challengeResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    challengeResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    challengeResponse.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate')
  }
  
  return challengeResponse
}

/**
 * GET /api/posts - Get posts (no L402 required for reading)
 * This could be used to list recent posts created via the API
 */
export async function GET(request: NextRequest) {
  // For now, just return a simple message
  // You could extend this to return recent posts, filtered posts, etc.
  const response = NextResponse.json({
    message: 'Posts API endpoint',
    endpoints: {
      'POST /api/posts': 'Create a new post (requires L402 payment)',
      'GET /api/posts': 'List posts (free)'
    },
    l402_info: {
      api_fee: `${API_ACCESS_FEE} sats (fixed)`,
      job_reward: `Variable (minimum: ${MIN_JOB_REWARD} sats, default: ${DEFAULT_JOB_REWARD} sats)`,
      total_cost: `Job reward + ${API_ACCESS_FEE} sats API fee`,
      currency: 'satoshis',
      documentation: 'https://docs.lightning.engineering/the-lightning-network/l402'
    }
  })
  
  // Add CORS headers for development only
  if (process.env.NODE_ENV === 'development') {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  
  return response
}

// Handle CORS preflight requests (development only)
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
