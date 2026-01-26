/**
 * Test script to verify Twilio SMS alerts are working
 * Run with: node test-sms.mjs
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER

console.log('🔍 Checking Twilio configuration...')
console.log(`  TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID ? '✅ Set (' + TWILIO_ACCOUNT_SID.substring(0, 8) + '...)' : '❌ Missing'}`)
console.log(`  TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing'}`)
console.log(`  TWILIO_FROM_NUMBER: ${TWILIO_FROM_NUMBER || '❌ Missing'}`)
console.log(`  ADMIN_PHONE_NUMBER: ${ADMIN_PHONE_NUMBER || '❌ Missing'}`)

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !ADMIN_PHONE_NUMBER) {
  console.error('\n❌ Missing required environment variables. Please check your .env.local file.')
  process.exit(1)
}

console.log('\n📱 Sending test SMS...')

const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')

const timestamp = new Date().toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const message = `🧪 Ganamos TEST ALERT\n\nThis is a test of the SMS security alert system.\n\nIf you received this, Twilio is configured correctly!\n\n${timestamp}`

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    To: ADMIN_PHONE_NUMBER,
    From: TWILIO_FROM_NUMBER,
    Body: message,
  }),
})

const result = await response.json()

if (!response.ok) {
  console.error('\n❌ Twilio API error:', JSON.stringify(result, null, 2))
  process.exit(1)
}

console.log('\n✅ SMS sent successfully!')
console.log(`  Message SID: ${result.sid}`)
console.log(`  Status: ${result.status}`)
console.log(`  To: ${result.to}`)
console.log('\n📲 Check your phone for the test message!')

