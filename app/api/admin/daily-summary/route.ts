import { NextRequest, NextResponse } from "next/server"
import { sendDailySummaryEmail, sendPRSummaryToSphinx } from "../../../../lib/daily-summary"

/**
 * Send daily summary email and PR summary to Sphinx
 * Can be triggered manually or by Vercel Cron
 */

// Shared handler for both GET and POST (Vercel Cron uses GET)
async function handleDailySummary(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron or has valid authorization
    const authHeader = request.headers.get('authorization')
    
    // Check if request is from Vercel Cron (has x-vercel-id or x-vercel-cron header)
    const isVercelCron = request.headers.get('x-vercel-id') || request.headers.get('x-vercel-cron')
    
    // Allow Vercel Cron requests, or require CRON_SECRET for manual triggers
    if (!isVercelCron && process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.log('[CRON] Unauthorized request - not from Vercel Cron and missing valid CRON_SECRET')
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }
    
    console.log('[CRON] Request authorized:', isVercelCron ? 'Vercel Cron' : 'Manual with CRON_SECRET')

    // Send the daily summary email
    console.log('Triggering daily summary email...')
    const emailResult = await sendDailySummaryEmail(process.env.ADMIN_EMAIL || 'admin@example.com')

    // Also send PR summary to Sphinx (don't fail if this doesn't work)
    console.log('Triggering daily PR summary to Sphinx...')
    const sphinxResult = await sendPRSummaryToSphinx()
    
    if (sphinxResult.success) {
      console.log(`[CRON] Successfully sent ${sphinxResult.prCount} PRs to Sphinx`)
    } else {
      console.log('[CRON] Failed to send PR summary to Sphinx:', sphinxResult.error)
      // Don't fail the overall job if Sphinx fails
    }

    if (emailResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Daily summary email sent successfully',
        messageId: emailResult.messageId,
        sphinx: {
          success: sphinxResult.success,
          prCount: sphinxResult.prCount || 0,
          error: sphinxResult.error
        }
      })
    } else {
      return NextResponse.json(
        { error: 'Failed to send email', details: emailResult.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Daily summary API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Vercel Cron uses GET requests
export async function GET(request: NextRequest) {
  return handleDailySummary(request)
}

// Support POST for manual triggering
export async function POST(request: NextRequest) {
  return handleDailySummary(request)
}
