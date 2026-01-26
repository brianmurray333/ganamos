import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken, extractBearerToken } from '@/lib/alexa-auth'
import { createServerSupabaseClient } from '@/lib/supabase'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/alexa/balance
 * Get the user's current sat balance
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Response:
 * - balance: Current balance in sats
 */
export async function GET(request: NextRequest) {
  console.log('[Alexa Balance] Request received')
  
  try {
    // Extract and validate token
    const token = extractBearerToken(request.headers.get('Authorization'))
    
    if (!token) {
      console.log('[Alexa Balance] No token provided')
      return NextResponse.json(
        { success: false, error: 'Missing authorization token' },
        { status: 401 }
      )
    }
    
    const tokenData = await validateAccessToken(token)
    
    if (!tokenData) {
      console.log('[Alexa Balance] Invalid token')
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }
    
    const { userId } = tokenData
    console.log('[Alexa Balance] User authenticated:', { userId })
    
    const supabase = createServerSupabaseClient()
    
    // Get user's balance
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('balance, name')
      .eq('id', userId)
      .single()
    
    if (error || !profile) {
      console.log('[Alexa Balance] Profile not found:', { userId, error })
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    console.log('[Alexa Balance] Success:', { userId, balance: profile.balance })
    
    return NextResponse.json({
      success: true,
      balance: profile.balance,
      name: profile.name,
    })
  } catch (error) {
    console.error('[Alexa Balance] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}


