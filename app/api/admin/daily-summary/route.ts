import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { NextRequest, NextResponse } from "next/server"
import { sendDailySummaryEmail, sendPRSummaryToSphinx } from "../../../../lib/daily-summary"

/**
 * Send daily summary email and PR summary to Sphinx
 * Can be triggered manually or by Vercel Cron
 */

// Shared handler for both GET and POST (Vercel Cron uses GET)
async function handleDailySummary(request: NextRequest) {
  try {
    // Only Vercel Cron (Bearer CRON_SECRET) or an operator with the secret
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
