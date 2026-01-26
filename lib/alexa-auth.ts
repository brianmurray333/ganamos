/**
 * Alexa OAuth 2.0 Authentication Library
 * Handles token generation, validation, and refresh for Alexa skill account linking
 */

import { createServerSupabaseClient } from '@/lib/supabase'
import { SignJWT, jwtVerify } from 'jose'

// Token configuration
const ACCESS_TOKEN_EXPIRY = '1h' // 1 hour
const REFRESH_TOKEN_EXPIRY = '90d' // 90 days
const ACCESS_TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour in ms
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000 // 90 days in ms

// Get JWT secret from environment
function getJwtSecret(): Uint8Array {
  const secret = process.env.ALEXA_JWT_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error('JWT secret not configured. Set ALEXA_JWT_SECRET or SUPABASE_JWT_SECRET.')
  }
  return new TextEncoder().encode(secret)
}

// Allowed OAuth client IDs (configured in Alexa Developer Console)
const ALLOWED_CLIENT_IDS = (process.env.ALEXA_CLIENT_IDS || '').split(',').filter(Boolean)

export interface AlexaTokenPayload {
  sub: string // user_id
  client_id: string
  type: 'access' | 'refresh'
  iat: number
  exp: number
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number // seconds
}

/**
 * Generate an OAuth authorization code
 */
export async function generateAuthorizationCode(
  userId: string,
  clientId: string,
  redirectUri: string,
  state?: string,
  selectedGroupId?: string
): Promise<string> {
  console.log('[Alexa Auth] generateAuthorizationCode called:', { 
    userId, 
    clientId, 
    selectedGroupId,
    hasState: !!state 
  })
  
  const supabase = createServerSupabaseClient()
  
  // Generate a random code
  const code = crypto.randomUUID() + '-' + crypto.randomUUID()
  
  // Store in database with 10-minute expiry
  const { error } = await supabase
    .from('alexa_auth_codes')
    .insert({
      code,
      user_id: userId,
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state || null,
      selected_group_id: selectedGroupId || null,
    })
  
  if (error) {
    console.error('[Alexa Auth] Failed to store authorization code:', error)
    throw new Error('Failed to generate authorization code')
  }
  
  console.log('[Alexa Auth] Auth code generated successfully:', { 
    userId, 
    selectedGroupId,
    codePrefix: code.substring(0, 8) + '...'
  })
  
  return code
}

/**
 * Validate and consume an authorization code
 */
export async function validateAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string
): Promise<{ userId: string; state?: string; selectedGroupId?: string } | null> {
  console.log('[Alexa Auth] validateAuthorizationCode called:', { 
    codePrefix: code.substring(0, 8) + '...', 
    clientId 
  })
  
  const supabase = createServerSupabaseClient()
  
  // Find the code
  const { data: authCode, error } = await supabase
    .from('alexa_auth_codes')
    .select('*')
    .eq('code', code)
    .eq('client_id', clientId)
    .eq('redirect_uri', redirectUri)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()
  
  if (error || !authCode) {
    console.error('[Alexa Auth] Authorization code not found or expired:', error)
    return null
  }
  
  console.log('[Alexa Auth] Auth code validated:', { 
    codeId: authCode.id,
    userId: authCode.user_id, 
    selectedGroupId: authCode.selected_group_id 
  })
  
  // Mark code as used
  await supabase
    .from('alexa_auth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', authCode.id)
  
  return {
    userId: authCode.user_id,
    state: authCode.state,
    selectedGroupId: authCode.selected_group_id,
  }
}

/**
 * Generate access and refresh tokens for a user
 */
export async function generateTokenPair(
  userId: string,
  clientId: string,
  selectedGroupId?: string
): Promise<TokenPair> {
  console.log('[Alexa Auth] generateTokenPair called:', { userId, clientId, selectedGroupId })
  
  const now = Math.floor(Date.now() / 1000)
  const secret = getJwtSecret()
  
  // Generate access token
  const accessToken = await new SignJWT({
    sub: userId,
    client_id: clientId,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret)
  
  // Generate refresh token
  const refreshToken = await new SignJWT({
    sub: userId,
    client_id: clientId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(secret)
  
  // Store tokens in database
  const supabase = createServerSupabaseClient()
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS)
  
  // Build the record to upsert
  const record: Record<string, any> = {
    user_id: userId,
    client_id: clientId,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }
  
  // Include selected_group_id if provided
  if (selectedGroupId) {
    record.selected_group_id = selectedGroupId
    console.log('[Alexa Auth] Including selected_group_id in record:', selectedGroupId)
  } else {
    console.log('[Alexa Auth] WARNING: No selectedGroupId provided to generateTokenPair')
  }
  
  console.log('[Alexa Auth] Upserting linked account:', { 
    userId: record.user_id, 
    hasSelectedGroupId: !!record.selected_group_id 
  })
  
  // Upsert (update existing or insert new)
  console.log('[Alexa Auth] Upserting linked account record:', record)
  
  const { error } = await supabase
    .from('alexa_linked_accounts')
    .upsert(record, {
      onConflict: 'user_id',
      ignoreDuplicates: false,
    })
  
  if (error) {
    console.error('[Alexa Auth] Failed to store tokens:', error)
    throw new Error('Failed to generate tokens')
  }
  
  console.log('[Alexa Auth] Tokens generated and stored successfully:', { userId })
  
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 3600, // 1 hour in seconds
  }
}

/**
 * Validate an access token and return the user ID
 */
export async function validateAccessToken(
  token: string
): Promise<{ userId: string; clientId: string } | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    
    const typedPayload = payload as unknown as AlexaTokenPayload
    
    if (typedPayload.type !== 'access') {
      console.error('Invalid token type:', typedPayload.type)
      return null
    }
    
    // Verify token exists in database and hasn't been revoked
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('alexa_linked_accounts')
      .select('user_id, access_token')
      .eq('user_id', typedPayload.sub)
      .eq('access_token', token)
      .single()
    
    if (error || !data) {
      console.error('Token not found in database:', error)
      return null
    }
    
    // Update last_used_at
    await supabase
      .from('alexa_linked_accounts')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', typedPayload.sub)
    
    return {
      userId: typedPayload.sub,
      clientId: typedPayload.client_id,
    }
  } catch (error) {
    console.error('Token validation failed:', error)
    return null
  }
}

/**
 * Refresh tokens using a refresh token
 */
export async function refreshTokens(
  refreshToken: string
): Promise<TokenPair | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(refreshToken, secret)
    
    const typedPayload = payload as unknown as AlexaTokenPayload
    
    if (typedPayload.type !== 'refresh') {
      console.error('Invalid token type for refresh:', typedPayload.type)
      return null
    }
    
    // Verify refresh token exists in database
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('alexa_linked_accounts')
      .select('user_id, client_id')
      .eq('user_id', typedPayload.sub)
      .eq('refresh_token', refreshToken)
      .single()
    
    if (error || !data) {
      console.error('Refresh token not found in database:', error)
      return null
    }
    
    // Generate new token pair
    return await generateTokenPair(data.user_id, data.client_id)
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
}

/**
 * Get the linked account info for a user
 */
export async function getLinkedAccount(userId: string) {
  console.log('[Alexa Auth] getLinkedAccount called:', { userId })
  
  const supabase = createServerSupabaseClient()
  
  const { data, error } = await supabase
    .from('alexa_linked_accounts')
    .select(`
      id,
      user_id,
      alexa_user_id,
      selected_group_id,
      created_at,
      updated_at,
      last_used_at,
      groups:selected_group_id (
        id,
        name,
        group_code
      )
    `)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    console.log('[Alexa Auth] getLinkedAccount error:', { userId, error: error.message })
    return null
  }
  
  console.log('[Alexa Auth] getLinkedAccount result:', { 
    userId, 
    selectedGroupId: data?.selected_group_id,
    groupName: (data as any)?.groups?.name
  })
  
  return data
}

/**
 * Update the selected group for an Alexa-linked account
 */
export async function updateSelectedGroup(
  userId: string,
  groupId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  
  // Verify user is a member of the group
  const { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('id')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .eq('status', 'approved')
    .single()
  
  if (membershipError || !membership) {
    console.error('User is not a member of the group:', membershipError)
    return false
  }
  
  const { error } = await supabase
    .from('alexa_linked_accounts')
    .update({
      selected_group_id: groupId,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  
  if (error) {
    console.error('Failed to update selected group:', error)
    return false
  }
  
  return true
}

/**
 * Set the Alexa user ID after first use
 */
export async function setAlexaUserId(
  userId: string,
  alexaUserId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  
  const { error } = await supabase
    .from('alexa_linked_accounts')
    .update({
      alexa_user_id: alexaUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  
  if (error) {
    console.error('Failed to set Alexa user ID:', error)
    return false
  }
  
  return true
}

/**
 * Revoke all tokens for a user (unlink Alexa account)
 */
export async function revokeTokens(userId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  
  const { error } = await supabase
    .from('alexa_linked_accounts')
    .delete()
    .eq('user_id', userId)
  
  if (error) {
    console.error('Failed to revoke tokens:', error)
    return false
  }
  
  return true
}

/**
 * Validate OAuth client ID
 */
export function validateClientId(clientId: string): boolean {
  // In development, allow any client ID if none are configured
  if (ALLOWED_CLIENT_IDS.length === 0 && process.env.NODE_ENV === 'development') {
    console.warn('No ALEXA_CLIENT_IDS configured, allowing any client ID in development')
    return true
  }
  
  return ALLOWED_CLIENT_IDS.includes(clientId)
}

/**
 * Extract access token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}

