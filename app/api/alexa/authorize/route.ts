import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { generateAuthorizationCode, validateClientId } from '@/lib/alexa-auth'

/**
 * GET /api/alexa/authorize
 * OAuth 2.0 Authorization Endpoint for Alexa Account Linking
 * 
 * This endpoint is called when a user tries to link their Ganamos account in the Alexa app.
 * It redirects to the login page if not authenticated, or generates an auth code if authenticated.
 * 
 * Query Parameters (from Alexa):
 * - client_id: The OAuth client ID configured in Alexa Developer Console
 * - redirect_uri: The Alexa redirect URI to send the auth code to
 * - response_type: Must be "code" for Authorization Code Grant
 * - state: A random string from Alexa for CSRF protection
 * - scope: Optional scope parameter
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const responseType = searchParams.get('response_type')
  const state = searchParams.get('state')
  
  console.log('[Alexa Authorize] Request received:', {
    clientId,
    responseType,
    hasState: !!state,
    redirectUriDomain: redirectUri ? new URL(redirectUri).hostname : null,
  })
  
  // Validate required parameters
  if (!clientId || !redirectUri || !responseType) {
    console.log('[Alexa Authorize] Missing required parameters')
    return NextResponse.json(
      { error: 'Missing required OAuth parameters' },
      { status: 400 }
    )
  }
  
  // Validate response_type is "code"
  if (responseType !== 'code') {
    return NextResponse.json(
      { error: 'Invalid response_type. Only "code" is supported.' },
      { status: 400 }
    )
  }
  
  // Validate client_id
  if (!validateClientId(clientId)) {
    return NextResponse.json(
      { error: 'Invalid client_id' },
      { status: 400 }
    )
  }
  
  // Check if user is authenticated
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    console.log('[Alexa Authorize] User not authenticated, redirecting to login')
    // Store OAuth params in cookie and redirect to login
    const oauthParams = {
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state || '',
    }
    
    const response = NextResponse.redirect(
      new URL(`/auth/alexa-login?${new URLSearchParams(oauthParams)}`, request.url)
    )
    
    // Set a cookie with OAuth params for after login
    response.cookies.set('alexa_oauth_params', JSON.stringify(oauthParams), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })
    
    return response
  }
  
  console.log('[Alexa Authorize] User authenticated:', { userId: session.user.id })
  
  // User is authenticated - generate authorization code
  try {
    const code = await generateAuthorizationCode(
      session.user.id,
      clientId,
      redirectUri,
      state || undefined
    )
    
    console.log('[Alexa Authorize] Auth code generated, redirecting to Alexa')
    
    // Redirect back to Alexa with the authorization code
    const alexaRedirectUrl = new URL(redirectUri)
    alexaRedirectUrl.searchParams.set('code', code)
    if (state) {
      alexaRedirectUrl.searchParams.set('state', state)
    }
    
    return NextResponse.redirect(alexaRedirectUrl.toString())
  } catch (error) {
    console.error('Failed to generate authorization code:', error)
    
    // Redirect back to Alexa with error
    const alexaRedirectUrl = new URL(redirectUri)
    alexaRedirectUrl.searchParams.set('error', 'server_error')
    alexaRedirectUrl.searchParams.set('error_description', 'Failed to generate authorization code')
    if (state) {
      alexaRedirectUrl.searchParams.set('state', state)
    }
    
    return NextResponse.redirect(alexaRedirectUrl.toString())
  }
}


