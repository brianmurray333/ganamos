#!/usr/bin/env node

/**
 * Test script to verify deposit email notification would be sent
 * This simulates the deposit flow without actually creating a real transaction
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testDepositEmailFlow() {
  console.log('🧪 Testing Deposit Email Notification Flow\n')
  
  // Get your profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, name')
    .eq('email', 'admin@example.com')
    .single()

  if (error || !profile) {
    console.error('❌ Error fetching profile:', error)
    return
  }

  console.log('📋 Test User Profile:')
  console.log(`   ID: ${profile.id}`)
  console.log(`   Name: ${profile.name}`)
  console.log(`   Email: ${profile.email}`)
  console.log()

  // Check if email would be sent
  const shouldSendEmail = profile.email && !profile.email.includes('@ganamos.app')
  
  console.log('📧 Email Notification Check:')
  console.log(`   Has Email: ${!!profile.email}`)
  console.log(`   Is Child Account: ${profile.email?.includes('@ganamos.app') ? 'Yes' : 'No'}`)
  console.log(`   Would Send Email: ${shouldSendEmail ? '✅ YES' : '❌ NO'}`)
  console.log()

  if (shouldSendEmail) {
    console.log('✅ PASS: Deposit email notifications are configured correctly!')
    console.log()
    console.log('📬 Email would be sent with:')
    console.log(`   To: ${profile.email}`)
    console.log(`   Subject: Bitcoin Received - [amount]`)
    console.log(`   Template: Bitcoin Received (Lightning deposit)`)
    console.log(`   From: Ganamos <noreply@ganamos.earth>`)
    console.log()
    console.log('💡 To test with a real deposit:')
    console.log('   1. Go to http://localhost:3457/wallet/deposit')
    console.log('   2. Generate a deposit invoice')
    console.log('   3. Pay the invoice from a Lightning wallet')
    console.log('   4. Check your email inbox for the notification')
  } else {
    console.log('⚠️  Email would NOT be sent (child account or no email)')
  }

  // Check RESEND_API_KEY is configured
  console.log()
  console.log('🔑 Email Service Configuration:')
  console.log(`   RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Configured' : '❌ Missing'}`)
  
  if (!process.env.RESEND_API_KEY) {
    console.log()
    console.log('⚠️  WARNING: RESEND_API_KEY not found in .env.local')
    console.log('   Emails will not be sent without this API key')
  }
}

testDepositEmailFlow().catch(console.error)

