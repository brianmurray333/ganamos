import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken, extractBearerToken, getLinkedAccount } from '@/lib/alexa-auth'
import { createServerSupabaseClient } from '@/lib/supabase'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/alexa/group-members
 * Get list of members in the user's selected group
 * 
 * This is used by Alexa to populate the fixer name slot
 * for better speech recognition of group member names
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Response:
 * - members: Array of member objects with name and username
 */
export async function GET(request: NextRequest) {
  console.log('[Alexa Group Members] GET request received')
  
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
    
    // Get the user's linked account
    const linkedAccount = await getLinkedAccount(userId)
    
    if (!linkedAccount?.selected_group_id) {
      return NextResponse.json(
        { success: false, error: 'No group selected' },
        { status: 400 }
      )
    }
    
    const supabase = createServerSupabaseClient()
    
    // Get all approved members of the selected group
    const { data: memberships, error } = await supabase
      .from('group_members')
      .select(`
        user_id,
        role,
        profiles:user_id (
          id,
          name,
          username,
          avatar_url
        )
      `)
      .eq('group_id', linkedAccount.selected_group_id)
      .eq('status', 'approved')
    
    if (error) {
      console.error('[Alexa Group Members] Error fetching members:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch group members' },
        { status: 500 }
      )
    }
    
    const members = (memberships || [])
      .map((m: any) => ({
        id: m.profiles?.id,
        name: m.profiles?.name,
        username: m.profiles?.username,
        avatarUrl: m.profiles?.avatar_url,
        role: m.role,
        isCurrentUser: m.user_id === userId,
      }))
      .filter((m: any) => m.id)
      // Sort: current user first, then alphabetically
      .sort((a: any, b: any) => {
        if (a.isCurrentUser) return -1
        if (b.isCurrentUser) return 1
        return (a.name || '').localeCompare(b.name || '')
      })
    
    console.log('[Alexa Group Members] Success:', { 
      memberCount: members.length, 
      groupName: (linkedAccount as any).groups?.name 
    })
    
    return NextResponse.json({
      success: true,
      members,
      totalCount: members.length,
      groupName: (linkedAccount as any).groups?.name || 'Your Group',
    })
  } catch (error) {
    console.error('[Alexa Group Members] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}


