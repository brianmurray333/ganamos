/**
 * Safety Caps System
 * 
 * Configurable limits to prevent runaway balances, rewards, and posts.
 * Users created before the grandfathered_cutoff timestamp are exempt.
 * 
 * Caps:
 *   Balance: 20k soft (warn), 40k hard (block deposits - earnings always allowed)
 *   Rewards: 5k soft (warn), 10k hard (block)
 *   Live posts: 200 system-wide
 */

import { createServerSupabaseClient } from './supabase'
import { sendEmail } from './email'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'

export interface CapCheckResult {
  allowed: boolean
  capLevel: 'none' | 'soft' | 'hard'
  violationId?: string
  currentCount?: number
  limitValue?: number
  message?: string
}

/**
 * Check if a balance update would exceed caps
 * @param userId - User ID
 * @param newBalance - The new balance after the transaction
 * @param isEarning - TRUE if earning from job (never blocked), FALSE if depositing
 */
export async function checkBalanceCap(
  userId: string,
  newBalance: number,
  isEarning: boolean = false
): Promise<CapCheckResult> {
  try {
    const supabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    const { data, error } = await supabase.rpc('check_balance_cap', {
      p_user_id: userId,
      p_new_balance: newBalance,
      p_is_earning: isEarning,
    })

    if (error) {
      console.error('[Safety Caps] Error checking balance cap:', error)
      // Fail open - allow transaction on error
      return { allowed: true, capLevel: 'none' }
    }

    const result = Array.isArray(data) ? data[0] : data

    // Send admin notification if cap was triggered
    if (result.violation_id) {
      sendCapViolationEmail({
        userId,
        capType: 'balance',
        capLevel: result.cap_level,
        attemptedValue: newBalance,
        isEarning,
      }).catch(err => console.error('[Safety Caps] Email error:', err))
    }

    return {
      allowed: result.allowed,
      capLevel: result.cap_level,
      violationId: result.violation_id,
      message: result.allowed ? undefined : 
        `Balance would exceed the ${result.cap_level === 'hard' ? '40,000' : '20,000'} sats limit.`,
    }
  } catch (error) {
    console.error('[Safety Caps] Exception in checkBalanceCap:', error)
    return { allowed: true, capLevel: 'none' }
  }
}

/**
 * Check if a post reward exceeds caps
 * @param userId - User ID creating the post
 * @param rewardAmount - The reward amount in sats
 */
export async function checkPostRewardCap(
  userId: string,
  rewardAmount: number
): Promise<CapCheckResult> {
  try {
    const supabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    const { data, error } = await supabase.rpc('check_post_reward_cap', {
      p_user_id: userId,
      p_reward_amount: rewardAmount,
    })

    if (error) {
      console.error('[Safety Caps] Error checking reward cap:', error)
      return { allowed: true, capLevel: 'none' }
    }

    const result = Array.isArray(data) ? data[0] : data

    if (result.violation_id) {
      sendCapViolationEmail({
        userId,
        capType: 'reward',
        capLevel: result.cap_level,
        attemptedValue: rewardAmount,
      }).catch(err => console.error('[Safety Caps] Email error:', err))
    }

    return {
      allowed: result.allowed,
      capLevel: result.cap_level,
      violationId: result.violation_id,
      message: result.allowed ? undefined :
        `Post reward of ${rewardAmount.toLocaleString()} sats exceeds the 10,000 sats limit.`,
    }
  } catch (error) {
    console.error('[Safety Caps] Exception in checkPostRewardCap:', error)
    return { allowed: true, capLevel: 'none' }
  }
}

/**
 * Check if system-wide live posts cap allows creating a new post
 * This is a SYSTEM-WIDE limit (200 total unfixed posts across all users)
 */
export async function checkLivePostsCap(): Promise<CapCheckResult> {
  try {
    const supabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    const { data, error } = await supabase.rpc('check_live_posts_cap')

    if (error) {
      console.error('[Safety Caps] Error checking live posts cap:', error)
      return { allowed: true, capLevel: 'none' }
    }

    const result = Array.isArray(data) ? data[0] : data

    if (result.violation_id) {
      sendCapViolationEmail({
        userId: 'system',
        capType: 'live_posts',
        capLevel: 'hard',
        attemptedValue: result.current_count + 1,
        currentCount: result.current_count,
        limitValue: result.limit_value,
      }).catch(err => console.error('[Safety Caps] Email error:', err))
    }

    return {
      allowed: result.allowed,
      capLevel: result.allowed ? 'none' : 'hard',
      violationId: result.violation_id,
      currentCount: result.current_count,
      limitValue: result.limit_value,
      message: result.allowed ? undefined :
        `The platform has reached its limit of ${result.limit_value} active posts. Please try again later.`,
    }
  } catch (error) {
    console.error('[Safety Caps] Exception in checkLivePostsCap:', error)
    return { allowed: true, capLevel: 'none' }
  }
}

/**
 * Send admin email notification for cap violation
 */
async function sendCapViolationEmail(params: {
  userId: string
  capType: 'balance' | 'reward' | 'live_posts'
  capLevel: string
  attemptedValue: number
  isEarning?: boolean
  currentCount?: number
  limitValue?: number
}): Promise<void> {
  const { userId, capType, capLevel, attemptedValue, isEarning, currentCount, limitValue } = params

  try {
    const supabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Get user info if not system-wide cap
    let userInfo = { email: 'N/A', username: 'N/A' }
    if (userId !== 'system') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, username, balance, created_at')
        .eq('id', userId)
        .single()
      if (profile) {
        userInfo = profile
      }
    }

    const capNames: Record<string, string> = {
      balance: 'Balance Cap',
      reward: 'Post Reward Cap',
      live_posts: 'System Live Posts Cap',
    }

    const isHard = capLevel === 'hard'
    const actionTaken = isHard ? 'BLOCKED' : 'WARNED (allowed)'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${isHard ? '#dc2626' : '#f59e0b'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .detail { margin: 10px 0; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .code { background: #1f2937; color: #10b981; padding: 8px; display: block; border-radius: 4px; font-family: monospace; margin-top: 10px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .hard { background: #fee2e2; color: #991b1b; }
    .soft { background: #fef3c7; color: #92400e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; color:#fff;">🚨 Safety Cap ${isHard ? 'Exceeded' : 'Triggered'}</h1>
    </div>
    <div class="content">
      <div class="detail">
        <span class="label">Cap Type:</span> <span class="value">${capNames[capType]}</span>
        <span class="badge ${capLevel}">${capLevel.toUpperCase()}</span>
      </div>
      <div class="detail"><span class="label">Action:</span> <span class="value">${actionTaken}</span></div>
      <div class="detail"><span class="label">Attempted Value:</span> <span class="value">${attemptedValue.toLocaleString()} ${capType === 'live_posts' ? 'posts' : 'sats'}</span></div>
      ${currentCount !== undefined ? `<div class="detail"><span class="label">Current Count:</span> <span class="value">${currentCount}/${limitValue}</span></div>` : ''}
      ${isEarning !== undefined ? `<div class="detail"><span class="label">Is Earning:</span> <span class="value">${isEarning ? 'Yes (job completion)' : 'No (deposit)'}</span></div>` : ''}
      ${userId !== 'system' ? `
      <div class="detail"><span class="label">User ID:</span> <span class="value">${userId}</span></div>
      <div class="detail"><span class="label">Email:</span> <span class="value">${userInfo.email}</span></div>
      <div class="detail"><span class="label">Username:</span> <span class="value">@${userInfo.username}</span></div>
      ` : ''}
      <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
        To adjust caps, run:<br>
        <code class="code">UPDATE system_settings SET balance_cap_hard = 50000 WHERE id = 'main';</code>
      </p>
    </div>
  </div>
</body>
</html>`

    await sendEmail(
      ADMIN_EMAIL,
      `Ganamos Alert: ${capNames[capType]} ${isHard ? 'Exceeded' : 'Triggered'}`,
      html,
      { type: 'security', metadata: params }
    )

    console.log(`[Safety Caps] Admin email sent for ${capType} ${capLevel} violation`)
  } catch (error) {
    console.error('[Safety Caps] Failed to send admin email:', error)
  }
}
