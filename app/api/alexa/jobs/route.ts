import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken, extractBearerToken, getLinkedAccount } from '@/lib/alexa-auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Default image for voice-created jobs
const DEFAULT_JOB_IMAGE = '/images/alexa-job-default.jpg'

/**
 * GET /api/alexa/jobs
 * Get list of open jobs from the user's selected group
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Response:
 * - jobs: Array of job objects
 * - totalCount: Total number of jobs
 */
export async function GET(request: NextRequest) {
  console.log('[Alexa Jobs] GET request received')
  
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
    
    // Get the user's linked account to find selected group
    const linkedAccount = await getLinkedAccount(userId)
    
    console.log('[Alexa Jobs] Linked account lookup:', { 
      userId, 
      linkedAccountExists: !!linkedAccount,
      selectedGroupId: linkedAccount?.selected_group_id,
      linkedAccountData: linkedAccount 
    })
    
    if (!linkedAccount?.selected_group_id) {
      console.error('[Alexa Jobs] No group selected for user:', userId)
      return NextResponse.json(
        { success: false, error: 'No group selected. Please update your Alexa settings.' },
        { status: 400 }
      )
    }
    
    const supabase = createServerSupabaseClient()
    
    // Fetch open jobs from the selected group
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        id,
        title,
        description,
        reward,
        location,
        created_at,
        user_id,
        created_by,
        profiles:user_id (
          id,
          name,
          username
        )
      `)
      .eq('group_id', linkedAccount.selected_group_id)
      .eq('fixed', false)
      .eq('claimed', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (postsError) {
      console.error('[Alexa Jobs] Error fetching posts:', postsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch jobs' },
        { status: 500 }
      )
    }
    
    // Transform posts to jobs format for Alexa
    const jobs = (posts || []).map(post => ({
      id: post.id,
      title: post.title,
      description: post.description,
      reward: post.reward,
      location: post.location || '',
      createdAt: post.created_at,
      createdBy: post.created_by || (post.profiles as any)?.name || 'Unknown',
      isOwnJob: post.user_id === userId,
    }))
    
    return NextResponse.json({
      success: true,
      jobs,
      totalCount: jobs.length,
      groupName: (linkedAccount as any).groups?.name || 'Your Group',
    })
  } catch (error) {
    console.error('[Alexa Jobs] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/alexa/jobs
 * Create a new job in the user's selected group
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Request body:
 * - description: Job description (required)
 * - reward: Reward amount in sats (required)
 * 
 * Response:
 * - success: boolean
 * - job: Created job object
 */
export async function POST(request: NextRequest) {
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
    const { description, reward } = body
    
    // Validate required fields
    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Description is required' },
        { status: 400 }
      )
    }
    
    if (!reward || typeof reward !== 'number' || reward <= 0) {
      return NextResponse.json(
        { success: false, error: 'Reward must be a positive number' },
        { status: 400 }
      )
    }
    
    // Get the user's linked account
    const linkedAccount = await getLinkedAccount(userId)
    
    if (!linkedAccount?.selected_group_id) {
      return NextResponse.json(
        { success: false, error: 'No group selected. Please update your Alexa settings.' },
        { status: 400 }
      )
    }
    
    const supabase = createServerSupabaseClient()
    
    // Get user's profile to check balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, balance')
      .eq('id', userId)
      .single()
    
    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: 'User profile not found' },
        { status: 404 }
      )
    }
    
    // Check if user has enough balance
    if (profile.balance < reward) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient balance. You have ${profile.balance} sats but the job requires ${reward} sats.`,
          balance: profile.balance,
          required: reward,
        },
        { status: 400 }
      )
    }
    
    // Create the job
    const postId = uuidv4()
    const now = new Date()
    const title = description.substring(0, 50)
    
    const { error: insertError } = await supabase
      .from('posts')
      .insert({
        id: postId,
        user_id: userId,
        created_by: profile.name,
        created_by_avatar: profile.avatar_url,
        title,
        description,
        image_url: DEFAULT_JOB_IMAGE,
        location: null,
        latitude: null,
        longitude: null,
        reward,
        claimed: false,
        fixed: false,
        created_at: now.toISOString(),
        group_id: linkedAccount.selected_group_id,
        city: null,
        is_anonymous: false,
      })
    
    if (insertError) {
      console.error('[Alexa Jobs] Error creating post:', insertError)
      return NextResponse.json(
        { success: false, error: 'Failed to create job' },
        { status: 500 }
      )
    }
    
    // Deduct reward from user's balance
    const newBalance = profile.balance - reward
    
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ 
        balance: newBalance,
        updated_at: now.toISOString(),
      })
      .eq('id', userId)
    
    if (balanceError) {
      console.error('[Alexa Jobs] Error updating balance:', balanceError)
      // Note: The job was already created, so we should log this but not fail
    }
    
    // Create a transaction record
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'internal',
        amount: -reward,
        status: 'completed',
        memo: `Posted job via Alexa: ${title}`,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
    
    // Create activity record
    await supabase
      .from('activities')
      .insert({
        user_id: userId,
        type: 'post_created',
        post_id: postId,
        actor_name: profile.name,
        actor_avatar: profile.avatar_url,
        message: `Posted a new job via Alexa: ${title}`,
        created_at: now.toISOString(),
      })
    
    return NextResponse.json({
      success: true,
      job: {
        id: postId,
        title,
        description,
        reward,
        createdAt: now.toISOString(),
      },
      newBalance,
    })
  } catch (error) {
    console.error('[Alexa Jobs] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}


