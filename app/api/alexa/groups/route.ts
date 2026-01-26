import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken, extractBearerToken, updateSelectedGroup, getLinkedAccount } from '@/lib/alexa-auth'
import { createServerSupabaseClient } from '@/lib/supabase'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/alexa/groups
 * Get list of groups the user is a member of
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Response:
 * - groups: Array of group objects
 * - selectedGroupId: Currently selected group ID
 */
export async function GET(request: NextRequest) {
  console.log('[Alexa Groups] GET request received')
  
  try {
    // Extract and validate token
    const token = extractBearerToken(request.headers.get('Authorization'))
    
    if (!token) {
      console.log('[Alexa Groups] No token provided')
      return NextResponse.json(
        { success: false, error: 'Missing authorization token' },
        { status: 401 }
      )
    }
    
    const tokenData = await validateAccessToken(token)
    
    if (!tokenData) {
      console.log('[Alexa Groups] Invalid token')
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }
    
    const { userId } = tokenData
    console.log('[Alexa Groups] User authenticated:', { userId })
    
    const supabase = createServerSupabaseClient()
    
    // Get user's groups
    const { data: memberships, error } = await supabase
      .from('group_members')
      .select(`
        group_id,
        role,
        groups:group_id (
          id,
          name,
          description,
          group_code
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'approved')
    
    if (error) {
      console.error('[Alexa Groups] Error fetching groups:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch groups' },
        { status: 500 }
      )
    }
    
    const groups = (memberships || [])
      .map((m: any) => ({
        id: m.groups?.id,
        name: m.groups?.name,
        description: m.groups?.description,
        groupCode: m.groups?.group_code,
        role: m.role,
      }))
      .filter((g: any) => g.id)
    
    // Get currently selected group
    const linkedAccount = await getLinkedAccount(userId)
    
    console.log('[Alexa Groups] Success:', { 
      userId, 
      groupCount: groups.length, 
      selectedGroupId: linkedAccount?.selected_group_id 
    })
    
    return NextResponse.json({
      success: true,
      groups,
      selectedGroupId: linkedAccount?.selected_group_id || null,
    })
  } catch (error) {
    console.error('[Alexa Groups] GET Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/alexa/groups
 * Update the selected group for Alexa
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Request body:
 * - groupId: The group ID to select
 */
export async function PUT(request: NextRequest) {
  try {
    // Extract and validate token
    const token = extractBearerToken(request.headers.get('Authorization'))
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization token' },
        { status: 401 }
      )
    }
    
    const tokenData = await validateAccessToken(token)
    
    if (!tokenData) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }
    
    const { userId } = tokenData
    
    // Parse request body
    const body = await request.json()
    const { groupId } = body
    
    if (!groupId) {
      return NextResponse.json(
        { success: false, error: 'Group ID is required' },
        { status: 400 }
      )
    }
    
    // Update selected group
    const success = await updateSelectedGroup(userId, groupId)
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to update group. Make sure you are a member of this group.' },
        { status: 400 }
      )
    }
    
    // Get the group name for confirmation
    const supabase = createServerSupabaseClient()
    const { data: group } = await supabase
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .single()
    
    return NextResponse.json({
      success: true,
      message: `Group changed to "${group?.name || 'Unknown'}"`,
      selectedGroupId: groupId,
    })
  } catch (error) {
    console.error('[Alexa Groups] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}


