import * as cron from 'node-cron'

/**
 * IMPORTANT: This node-cron scheduler does NOT work in serverless environments like Vercel.
 * 
 * For production on Vercel, use vercel.json to configure Vercel Cron Jobs instead.
 * This scheduler only works for local development or traditional server deployments.
 * 
 * See vercel.json for the production cron configuration.
 */

let schedulerInitialized = false

export function initializeScheduler() {
  if (schedulerInitialized) {
    console.log('Scheduler already initialized')
    return
  }

  // Schedule daily summary email at 6pm PT (01:00 UTC next day due to time zone)
  // Note: This will be 6pm PT when not in daylight saving time
  // During daylight saving (PDT), 6pm would be 01:00 UTC
  cron.schedule('0 1 * * *', async () => {
    console.log('Running scheduled daily summary email...')
    
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3457'

      const response = await fetch(`${appUrl}/api/admin/daily-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Scheduled daily summary email sent successfully:', result.messageId)
      } else {
        const error = await response.text()
        console.error('Failed to send scheduled daily summary email:', error)
      }
    } catch (error) {
      console.error('Error sending scheduled daily summary email:', error)
    }
  }, {
    scheduled: true,
    timezone: "America/Los_Angeles" // PT timezone
  })

  schedulerInitialized = true
  console.log('Daily email scheduler initialized - will run at 6pm PT daily')
}

// Auto-initialize the scheduler
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true') {
  initializeScheduler()
}
