import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { generateAuthorizationCode, validateClientId } from '@/lib/alexa-auth'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/alexa/complete-linking
 * Complete the Alexa account linking by selecting a group and generating an auth code
 * 
 * This is called from the group selection page after the user has:
 * 1. Logged in
 * 2. Selected a group
 * 
 * Request body:
 * - groupId: The selected group ID
 * - clientId: OAuth client ID
 * - redirectUri: Alexa redirect URI
 * - state: OAuth state parameter
 */
export async function POST(request: NextRequest) {
  console.log('[Alexa Complete-Linking] Request received')
  
  try {
    const body = await request.json()
    const { groupId, clientId, redirectUri, state } = body
    
    console.log('[Alexa Complete-Linking] Params:', { groupId, clientId, hasState: !!state })
    
    // Validate required parameters
    if (!groupId || !clientId || !redirectUri) {
      console.log('[Alexa Complete-Linking] Missing params:', { groupId: !!groupId, clientId: !!clientId, redirectUri: !!redirectUri })
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      )
    }
    
    // Validate client ID
    if (!validateClientId(clientId)) {
      console.log('[Alexa Complete-Linking] Invalid client ID:', clientId)
      return NextResponse.json(
        { success: false, error: 'Invalid client ID' },
        { status: 400 }
      )
    }
    
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      console.log('[Alexa Complete-Linking] No session found')
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    const userId = session.user.id
    console.log('[Alexa Complete-Linking] User authenticated:', { userId, groupId })
    
    // Verify user is a member of the selected group
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('id')
      .eq('user_id', userId)
      .eq('group_id', groupId)
      .eq('status', 'approved')
      .single()
    
    if (membershipError || !membership) {
      return NextResponse.json(
        { success: false, error: 'You are not a member of this group' },
        { status: 403 }
      )
    }
    
    // Store the selected group in alexa_linked_accounts (or create a pending record)
    // We'll use server-side client for this since RLS might not allow direct inserts
    const serverSupabase = createServerSupabaseClient()
    
    // Check if there's already a linked account
    const { data: existingAccount } = await serverSupabase
      .from('alexa_linked_accounts')
      .select('id')
      .eq('user_id', userId)
      .single()
    
    if (existingAccount) {
      console.log('[Alexa Complete-Linking] Updating existing account with new group:', { userId, groupId })
      // Update existing account's selected group
      const { error: updateError } = await serverSupabase
        .from('alexa_linked_accounts')
        .update({
          selected_group_id: groupId,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      
      if (updateError) {
        console.error('[Alexa Complete-Linking] Error updating existing account:', updateError)
      } else {
        console.log('[Alexa Complete-Linking] Successfully updated existing account')
      }
    } else {
      console.log('[Alexa Complete-Linking] No existing account, will be created with token generation')
    }
    // Note: The full record will be created when tokens are generated
    
    // Generate authorization code with selected group
    console.log('[Alexa Complete-Linking] Generating auth code with group:', { userId, groupId })
    const code = await generateAuthorizationCode(
      userId,
      clientId,
      redirectUri,
      state || undefined,
      groupId
    )
    
    console.log('[Alexa Complete-Linking] Auth code generated successfully')
    
    // Build redirect URL
    const alexaRedirectUrl = new URL(redirectUri)
    alexaRedirectUrl.searchParams.set('code', code)
    if (state) {
      alexaRedirectUrl.searchParams.set('state', state)
    }
    
    console.log('[Alexa Complete-Linking] Returning success with redirect URL')
    
    return NextResponse.json({
      success: true,
      redirectUrl: alexaRedirectUrl.toString(),
    })
  } catch (error) {
    console.error('[Alexa Complete-Linking] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

