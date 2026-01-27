import { NextRequest, NextResponse } from 'next/server'
import { validateAccessToken, extractBearerToken, getLinkedAccount } from '@/lib/alexa-auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { closeIssueAction } from '@/app/actions/post-actions'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * POST /api/alexa/jobs/[id]/complete
 * Mark a job as complete and assign a fixer
 * 
 * Important: Per user requirements, this endpoint can ONLY close jobs that
 * were created by the authenticated user. For jobs created by others,
 * it triggers the email verification flow (like the Heltec device).
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Request body:
 * - fixerName: Name or username of the person who completed the job
 * 
 * Response:
 * - success: boolean
 * - message: Status message
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id
  console.log('[Alexa Jobs Complete] POST request received:', { jobId })
  
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
    const { fixerName } = body
    
    if (!fixerName || typeof fixerName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Fixer name is required' },
        { status: 400 }
      )
    }
    
    // Get the user's linked account
    const linkedAccount = await getLinkedAccount(userId)
    
    if (!linkedAccount?.selected_group_id) {
      return NextResponse.json(
        { success: false, error: 'No group selected' },
        { status: 400 }
      )
    }
    
    const supabase = createServerSupabaseClient()
    
    // Get the job details (minimal fetch for initial validation)
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        id,
        title,
        description,
        reward,
        user_id,
        group_id,
        fixed,
        claimed,
        deleted_at,
        created_by,
        under_review
      `)
      .eq('id', jobId)
      .single()
    
    if (postError || !post) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }
    
    // Validate job is in the correct group
    if (post.group_id !== linkedAccount.selected_group_id) {
      return NextResponse.json(
        { success: false, error: 'Job not in your selected group' },
        { status: 403 }
      )
    }
    
    // Check if job is still available
    if (post.fixed || post.claimed || post.under_review || post.deleted_at) {
      return NextResponse.json(
        { success: false, error: 'Job has already been claimed or is under review' },
        { status: 400 }
      )
    }
    
    // Find the fixer by name or username in the group
    const fixerProfile = await findFixerInGroup(
      supabase,
      fixerName,
      linkedAccount.selected_group_id
    )
    
    if (!fixerProfile) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Could not find a group member named "${fixerName}". Please check the name and try again.`,
          suggestion: 'Make sure the person is a member of your group.',
        },
        { status: 404 }
      )
    }
    
    // Check if the current user is the post owner
    const isPostOwner = post.user_id === userId
    
    // Check if the current user is a group admin for this post's group
    let isGroupAdmin = false
    if (post.group_id) {
      const { data: adminCheck } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', post.group_id)
        .eq('user_id', userId)
        .eq('status', 'approved')
        .single()
      
      isGroupAdmin = adminCheck?.role === 'admin'
    }
    
    const canCloseJob = isPostOwner || isGroupAdmin
    
    console.log('[Alexa Jobs Complete] Authorization check:', { 
      jobId, 
      postOwnerId: post.user_id, 
      currentUserId: userId, 
      isPostOwner,
      isGroupAdmin,
      canCloseJob,
      fixerName: fixerProfile.name 
    })
    
    if (canCloseJob) {
      // User owns this post - they can close it and assign the fixer
      const result = await closeIssueAction(
        jobId,
        userId,
        fixerProfile.username
      )
      
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'Failed to complete job' },
          { status: 500 }
        )
      }
      
      return NextResponse.json({
        success: true,
        message: `Great! The job "${post.title}" has been marked complete and ${fixerProfile.name} has been awarded ${post.reward} sats.`,
        job: {
          id: post.id,
          title: post.title,
          reward: post.reward,
        },
        fixer: {
          name: fixerProfile.name,
          username: fixerProfile.username,
        },
      })
    } else {
      // User is neither the post owner nor a group admin - trigger the verification email flow
      // Use atomic claim to prevent race conditions
      
      const { data: claimResult, error: claimError } = await supabase.rpc(
        'atomic_claim_job',
        {
          p_job_id: jobId,
          p_fixer_id: fixerProfile.id,
          p_fixer_name: fixerProfile.name,
          p_fixer_avatar: fixerProfile.avatar_url,
          p_fix_note: `Submitted via Alexa by ${fixerProfile.name}`,
          p_fix_image_url: null,
          p_lightning_address: null
        }
      )
      
      if (claimError) {
        console.error('[Alexa Jobs Complete] Claim error:', claimError)
        return NextResponse.json(
          { success: false, error: 'Failed to claim job' },
          { status: 500 }
        )
      }
      
      // Check if the atomic claim succeeded
      if (!claimResult?.success) {
        const errorMessage = claimResult?.error || 'Job is no longer available'
        console.log(`[Alexa Jobs Complete] Claim failed: ${errorMessage}`)
        
        if (claimResult?.error === 'Job not found') {
          return NextResponse.json(
            { success: false, error: 'Job not found' },
            { status: 404 }
          )
        }
        
        // Job was already claimed/fixed/under_review
        return NextResponse.json(
          { success: false, error: 'Job has already been claimed or is under review' },
          { status: 400 }
        )
      }
      
      // Job claimed successfully - send verification email to post owner
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', post.user_id)
        .single()
      
      if (ownerProfile?.email) {
        try {
          const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ganamos.earth'}/post/${jobId}?verify=true&fixer=${fixerProfile.username}`
          
          console.log(`[Alexa Complete] Verification request sent for job ${jobId}`)
          console.log(`[Alexa Complete] Owner: ${ownerProfile.email}, Fixer: ${fixerProfile.name}`)
          console.log(`[Alexa Complete] Verify URL: ${verifyUrl}`)
          
          await sendVerificationEmail(
            ownerProfile.email,
            ownerProfile.name || 'there',
            post.title,
            fixerProfile.name,
            post.reward,
            verifyUrl
          )
        } catch (emailError) {
          console.error('[Alexa Complete] Error sending verification email:', emailError)
          // Don't fail - job is already claimed
        }
      }
      
      return NextResponse.json({
        success: true,
        requiresVerification: true,
        message: `The job "${post.title}" was posted by ${post.created_by}. An email has been sent to them to verify that ${fixerProfile.name} completed the job. Once verified, ${fixerProfile.name} will receive ${post.reward} sats.`,
        job: {
          id: post.id,
          title: post.title,
          reward: post.reward,
          ownerName: post.created_by,
        },
        fixer: {
          name: fixerProfile.name,
        },
      })
    }
  } catch (error) {
    console.error('[Alexa Jobs Complete] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Find a fixer by name or username within a specific group
 */
async function findFixerInGroup(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  fixerName: string,
  groupId: string
): Promise<{ id: string; name: string; username: string; avatar_url: string | null } | null> {
  // Get all approved members of the group
  const { data: members, error } = await supabase
    .from('group_members')
    .select(`
      user_id,
      profiles:user_id (
        id,
        name,
        username,
        avatar_url
      )
    `)
    .eq('group_id', groupId)
    .eq('status', 'approved')
  
  if (error || !members) {
    console.error('[Alexa] Error fetching group members:', error)
    return null
  }
  
  const profiles = members
    .map((m: any) => m.profiles)
    .filter(Boolean) as { id: string; name: string; username: string; avatar_url: string | null }[]
  
  const normalizedName = fixerName.toLowerCase().trim()
  
  // Try exact username match first
  let match = profiles.find(p => 
    p.username?.toLowerCase() === normalizedName
  )
  if (match) return match
  
  // Try exact name match
  match = profiles.find(p => 
    p.name?.toLowerCase() === normalizedName
  )
  if (match) return match
  
  // Try first name match
  match = profiles.find(p => {
    const firstName = p.name?.toLowerCase().split(' ')[0]
    return firstName === normalizedName
  })
  if (match) return match
  
  // Try partial name match (name contains search term)
  match = profiles.find(p => 
    p.name?.toLowerCase().includes(normalizedName) ||
    p.username?.toLowerCase().includes(normalizedName)
  )
  if (match) return match
  
  // Fuzzy matching using Levenshtein distance for typos
  const levenshtein = (a: string, b: string): number => {
    const matrix = Array(b.length + 1).fill(null).map(() => 
      Array(a.length + 1).fill(null)
    )
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        )
      }
    }
    
    return matrix[b.length][a.length]
  }
  
  // Find closest match with small edit distance (max 2)
  let bestMatch: typeof match = null
  let bestDistance = 3
  
  for (const profile of profiles) {
    const nameDistance = levenshtein(normalizedName, (profile.name || '').toLowerCase())
    const usernameDistance = levenshtein(normalizedName, (profile.username || '').toLowerCase())
    const minDistance = Math.min(nameDistance, usernameDistance)
    
    if (minDistance < bestDistance) {
      bestDistance = minDistance
      bestMatch = profile
    }
  }
  
  return bestMatch
}

/**
 * Send verification email to post owner
 */
async function sendVerificationEmail(
  email: string,
  ownerName: string,
  jobTitle: string,
  fixerName: string,
  reward: number,
  verifyUrl: string
): Promise<void> {
  // Check if Resend is configured
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.log('[Alexa Complete] Resend not configured, skipping email')
    return
  }
  
  const { Resend } = await import('resend')
  const resend = new Resend(resendApiKey)
  
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Ganamos <notifications@ganamos.earth>',
    to: email,
    subject: `🎉 ${fixerName} says they completed your job!`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 10px; }
            .button { display: inline-block; background: #22c55e; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .reward { font-size: 24px; font-weight: bold; color: #f59e0b; }
            .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #1a1a1a !important;">🎉 Job Completion Request</h1>
            </div>
            <div class="content">
              <p>Hi ${ownerName}!</p>
              <p><strong>${fixerName}</strong> says they completed your job:</p>
              <h3>"${jobTitle}"</h3>
              <p>This request was submitted via Alexa.</p>
              <p>If verified, ${fixerName} will receive:</p>
              <p class="reward">⚡ ${reward.toLocaleString()} sats</p>
              <p>Click below to verify the completion:</p>
              <center>
                <a href="${verifyUrl}" class="button">Verify & Approve</a>
              </center>
              <p style="color: #666; font-size: 14px;">If you didn't expect this, you can ignore this email.</p>
            </div>
            <div class="footer">
              <p>Ganamos - Fix your community, earn Bitcoin ⚡</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })
  
  console.log(`[Alexa Complete] Verification email sent to ${email}`)
}


