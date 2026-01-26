import { NextRequest, NextResponse } from 'next/server'
import { validateAuthorizationCode, generateTokenPair, refreshTokens, validateClientId } from '@/lib/alexa-auth'

/**
 * POST /api/alexa/token
 * OAuth 2.0 Token Endpoint for Alexa Account Linking
 * 
 * This endpoint handles two grant types:
 * 1. authorization_code: Exchange auth code for access/refresh tokens
 * 2. refresh_token: Get new tokens using refresh token
 * 
 * Request body (form-urlencoded):
 * For authorization_code:
 * - grant_type: "authorization_code"
 * - code: The authorization code from /authorize
 * - redirect_uri: Must match the original redirect_uri
 * - client_id: OAuth client ID
 * - client_secret: OAuth client secret
 * 
 * For refresh_token:
 * - grant_type: "refresh_token"
 * - refresh_token: The refresh token
 * - client_id: OAuth client ID
 * - client_secret: OAuth client secret
 */
/**
 * Parse HTTP Basic Authorization header
 * Returns { clientId, clientSecret } or null if not present/invalid
 */
function parseBasicAuth(authHeader: string | null): { clientId: string; clientSecret: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null
  }
  
  try {
    const base64Credentials = authHeader.slice(6) // Remove "Basic " prefix
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [clientId, clientSecret] = credentials.split(':')
    
    if (clientId && clientSecret) {
      return { clientId, clientSecret }
    }
  } catch (e) {
    console.error('Failed to parse Basic auth header:', e)
  }
  
  return null
}

export async function POST(request: NextRequest) {
  console.log('[Alexa Token] POST request received')
  
  try {
    // Parse form-urlencoded body
    const formData = await request.formData()
    
    const grantType = formData.get('grant_type') as string
    console.log('[Alexa Token] Grant type:', grantType)
    
    // Support both HTTP Basic auth (header) and credentials in body
    // HTTP Basic: Authorization: Basic base64(client_id:client_secret)
    const authHeader = request.headers.get('authorization')
    const basicAuth = parseBasicAuth(authHeader)
    
    // Prefer credentials from body, fall back to Basic auth header
    const clientId = (formData.get('client_id') as string) || basicAuth?.clientId || ''
    const clientSecret = (formData.get('client_secret') as string) || basicAuth?.clientSecret || ''
    
    // Validate required parameters
    if (!grantType || !clientId) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        { status: 400 }
      )
    }
    
    // Validate client credentials
    if (!validateClientId(clientId)) {
      console.error('Alexa token: Invalid client_id received')
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      )
    }
    
    // Verify client secret (in production, compare against stored secret)
    const expectedSecret = process.env.ALEXA_CLIENT_SECRET
    if (expectedSecret && clientSecret !== expectedSecret) {
      console.error('Alexa token: Invalid client_secret', { 
        receivedLength: clientSecret?.length, 
        expectedLength: expectedSecret?.length,
        match: clientSecret === expectedSecret
      })
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      )
    }
    
    if (grantType === 'authorization_code') {
      const code = formData.get('code') as string
      const redirectUri = formData.get('redirect_uri') as string
      
      if (!code || !redirectUri) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing code or redirect_uri' },
          { status: 400 }
        )
      }
      
      // Validate authorization code
      const codeData = await validateAuthorizationCode(code, clientId, redirectUri)
      
      if (!codeData) {
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
          { status: 400 }
        )
      }
      
      // Generate token pair (including selected group if present)
      console.log('[Alexa Token] Generating tokens for user:', { 
        userId: codeData.userId, 
        selectedGroupId: codeData.selectedGroupId 
      })
      
      const tokens = await generateTokenPair(codeData.userId, clientId, codeData.selectedGroupId)
      
      console.log('[Alexa Token] Tokens generated successfully')
      return NextResponse.json(tokens)
    }
    
    if (grantType === 'refresh_token') {
      const refreshToken = formData.get('refresh_token') as string
      
      if (!refreshToken) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing refresh_token' },
          { status: 400 }
        )
      }
      
      // Refresh tokens
      const tokens = await refreshTokens(refreshToken)
      
      if (!tokens) {
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(tokens)
    }
    
    // Unsupported grant type
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: `Grant type "${grantType}" is not supported` },
      { status: 400 }
    )
  } catch (error) {
    console.error('Token endpoint error:', error)
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    )
  }
}

