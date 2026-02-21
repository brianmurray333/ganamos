import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import {
  sendPostExpiryWarningEmail,
  sendPostExpiredConfirmationEmail,
  sendPostExpiredFixerEmail,
} from '@/lib/transaction-emails'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Authentication: Allow Vercel cron headers OR valid Bearer token
    const isVercelCron = request.headers.get('x-vercel-id') || request.headers.get('x-vercel-cron')
    if (!isVercelCron) {
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Initialize admin Supabase client (service role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase configuration missing")
      return NextResponse.json(
        { error: "Database configuration missing" },
        { status: 500 }
      )
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // === Step 1: Send 6-hour warning emails ===
    const sixHoursFromNow = new Date(Date.now() + 6 * 3600_000).toISOString()
    const now = new Date().toISOString()

    const { data: warningPosts } = await adminSupabase
      .from('posts')
      .select('id, title, user_id, expires_at')
      .not('expires_at', 'is', null)
      .lte('expires_at', sixHoursFromNow)
      .gt('expires_at', now)
      .is('expiry_warning_sent_at', null)
      .is('deleted_at', null)
      .not('user_id', 'is', null)

    for (const post of warningPosts ?? []) {
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('email, name')
        .eq('id', post.user_id)
        .single()

      if (profile?.email && !profile.email.includes('@ganamos.app')) {
        await sendPostExpiryWarningEmail({
          toEmail: profile.email,
          userName: profile.name || 'User',
          postTitle: post.title,
          expiresAt: new Date(post.expires_at!),
          postId: post.id,
        }).catch(err => {
          console.error(`Warning email failed for post ${post.id}:`, err)
        })
      }

      await adminSupabase
        .from('posts')
        .update({ expiry_warning_sent_at: new Date().toISOString() })
        .eq('id', post.id)
    }

    // === Step 2: Expire posts ===
    const { data: expiredPosts } = await adminSupabase
      .from('posts')
      .select('id, user_id, title, reward, assigned_to')
      .not('expires_at', 'is', null)
      .lte('expires_at', now)
      .is('deleted_at', null)
      .eq('fixed', false)
      .eq('under_review', false)

    for (const post of expiredPosts ?? []) {
      const nowIso = new Date().toISOString()

      // Soft-delete the post
      await adminSupabase
        .from('posts')
        .update({ deleted_at: nowIso })
        .eq('id', post.id)

      // Log activity
      await adminSupabase.from('activities').insert({
        id: uuidv4(),
        user_id: post.user_id,
        type: 'post_expired',
        related_id: post.id,
        related_table: 'posts',
        timestamp: nowIso,
        metadata: {
          title: post.title || 'Expired post',
          reward: post.reward || 0,
        },
      })

      // Refund sats if post has a reward and an authenticated user
      if (post.user_id && post.reward && post.reward > 0) {
        const { data: profile } = await adminSupabase
          .from('profiles')
          .select('balance, email, name')
          .eq('id', post.user_id)
          .single()

        if (profile) {
          // Update balance
          await adminSupabase
            .from('profiles')
            .update({
              balance: (profile.balance || 0) + post.reward,
              updated_at: nowIso,
            })
            .eq('id', post.user_id)

          // Create transaction record
          await adminSupabase.from('transactions').insert({
            id: uuidv4(),
            user_id: post.user_id,
            type: 'internal',
            amount: post.reward,
            status: 'completed',
            memo: `Refund for expired post: ${post.title || 'Issue'}`,
          })

          // Send confirmation email
          if (profile.email && !profile.email.includes('@ganamos.app')) {
            await sendPostExpiredConfirmationEmail({
              toEmail: profile.email,
              userName: profile.name || 'User',
              postTitle: post.title,
              refundAmountSats: post.reward,
              postId: post.id,
            }).catch(err => {
              console.error(`Confirmation email failed for post ${post.id}:`, err)
            })
          }
        }
      }

      // Clear assignment and notify fixer
      if (post.assigned_to) {
        const { data: fixer } = await adminSupabase
          .from('profiles')
          .select('email, name')
          .eq('id', post.assigned_to)
          .single()

        if (fixer?.email && !fixer.email.includes('@ganamos.app')) {
          await sendPostExpiredFixerEmail({
            toEmail: fixer.email,
            fixerName: fixer.name || 'User',
            postTitle: post.title,
            postId: post.id,
          }).catch(err => {
            console.error(`Fixer email failed for post ${post.id}:`, err)
          })
        }

        await adminSupabase
          .from('posts')
          .update({ assigned_to: null })
          .eq('id', post.id)
      }
    }

    // === Step 3: Log skipped under_review posts ===
    const { data: skippedPosts } = await adminSupabase
      .from('posts')
      .select('id')
      .not('expires_at', 'is', null)
      .lte('expires_at', now)
      .is('deleted_at', null)
      .eq('under_review', true)

    if (skippedPosts?.length) {
      console.log(
        `Skipped ${skippedPosts.length} posts under review — will re-evaluate next run`
      )
    }

    return NextResponse.json({
      success: true,
      warned: warningPosts?.length ?? 0,
      expired: expiredPosts?.length ?? 0,
      skipped: skippedPosts?.length ?? 0,
    })
  } catch (error) {
    console.error('Error in expire-posts cron job:', error)
    return NextResponse.json(
      {
        error: 'Failed to expire posts',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
