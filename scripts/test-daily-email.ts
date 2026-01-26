#!/usr/bin/env tsx
/**
 * Test script to debug daily summary email issues
 * 
 * Usage:
 *   npx tsx scripts/test-daily-email.ts
 */

// Load environment variables FIRST, before any imports
import { config } from "dotenv"
config({ path: '.env.local' })

// Now import modules that depend on environment variables
import { sendDailySummaryEmail, getDailySummaryData } from "../lib/daily-summary"

async function testEmailSetup() {
  console.log('='.repeat(60))
  console.log('TESTING DAILY EMAIL SETUP')
  console.log('='.repeat(60))
  console.log()

  // 1. Check environment variables
  console.log('1. CHECKING ENVIRONMENT VARIABLES')
  console.log('-'.repeat(60))
  console.log('✓ RESEND_API_KEY:', process.env.RESEND_API_KEY ? `Set (${process.env.RESEND_API_KEY.substring(0, 10)}...)` : '❌ NOT SET')
  console.log('✓ NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : '❌ NOT SET')
  console.log('✓ SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : '❌ NOT SET')
  console.log('✓ NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || '(not set, will use default)')
  console.log('✓ CRON_SECRET:', process.env.CRON_SECRET ? 'Set' : '❌ NOT SET')
  console.log()

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY is not set. Email sending will fail.')
    console.log('Please add RESEND_API_KEY to your .env.local file')
    return
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase credentials not set. Data collection will fail.')
    return
  }

  // 2. Test data collection
  console.log('2. TESTING DATA COLLECTION')
  console.log('-'.repeat(60))
  try {
    const data = await getDailySummaryData()
    console.log('✓ Data collection successful')
    console.log('  - Node balance:', data.nodeBalance.total_balance, 'sats')
    console.log('  - App total balance:', data.appTotalBalance, 'sats')
    console.log('  - Transactions (24h):', data.last24Hours.transactions.count)
    console.log('  - Active users (24h):', data.last24Hours.activeUsers)
    console.log()
  } catch (error) {
    console.error('❌ Data collection failed:', error)
    console.log()
  }

  // 3. Test email sending
  console.log('3. TESTING EMAIL SENDING')
  console.log('-'.repeat(60))
  try {
    console.log('Sending test email to admin@example.com...')
    const result = await sendDailySummaryEmail('admin@example.com')
    
    if (result.success) {
      console.log('✓ Email sent successfully!')
      console.log('  Message ID:', result.messageId)
      console.log()
      console.log('🎉 Check your inbox at admin@example.com')
    } else {
      console.error('❌ Email sending failed:', result.error)
    }
  } catch (error) {
    console.error('❌ Exception during email sending:', error)
  }
  console.log()

  // 4. Instructions for production testing
  console.log('4. PRODUCTION TESTING')
  console.log('-'.repeat(60))
  console.log('To test the production endpoint, run:')
  console.log()
  console.log('curl -X POST https://www.ganamos.earth/api/admin/daily-summary \\')
  console.log(`  -H "Authorization: Bearer ${process.env.CRON_SECRET || 'YOUR_CRON_SECRET'}"`)
  console.log()
  console.log('Make sure the following are set in Vercel:')
  console.log('  1. RESEND_API_KEY')
  console.log('  2. CRON_SECRET')
  console.log('  3. NEXT_PUBLIC_SUPABASE_URL')
  console.log('  4. SUPABASE_SERVICE_ROLE_KEY')
  console.log('  5. NEXT_PUBLIC_APP_URL (should be https://www.ganamos.earth)')
  console.log()
  console.log('Check Vercel cron logs at:')
  console.log('https://vercel.com/[your-team]/[your-project]/logs?type=cron')
  console.log()
}

// Run the test
testEmailSetup().catch(console.error)

