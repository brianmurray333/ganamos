// Find the duplicate "meme" device entries
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function findMemeDuplicates() {
  console.log('🔍 SEARCHING FOR MEME DUPLICATES')
  console.log('='.repeat(80))

  // Find all "meme" devices
  const { data: devices, error } = await supabase
    .from('devices')
    .select('id, user_id, pairing_code, pet_name, pet_type, status, created_at')
    .eq('pet_name', 'meme')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ Error fetching devices:', error.message)
    return
  }

  console.log(`\n📊 Found ${devices.length} "meme" device(s)\n`)

  for (const device of devices) {
    // Get user details
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, name, id')
      .eq('id', device.user_id)
      .single()

    // Check if this is a child account
    const { data: connection } = await supabase
      .from('connected_accounts')
      .select('primary_user_id, account_type')
      .eq('connected_user_id', device.user_id)
      .single()

    const isChild = !!connection

    console.log(`Device ID: ${device.id}`)
    console.log(`Pairing Code: ${device.pairing_code}`)
    console.log(`User: ${profile?.name || 'Unknown'} (${profile?.email || device.user_id})`)
    console.log(`Account Type: ${isChild ? 'Child Account' : 'Main Account'}`)
    console.log(`Status: ${device.status}`)
    console.log(`Created: ${new Date(device.created_at).toLocaleString()}`)
    console.log('')
  }

  if (devices.length > 1) {
    console.log('🚨 RECOMMENDATION:')
    console.log('Keep the oldest device (created first) and delete the newer one(s).')
    console.log('Or manually choose which user should keep "meme".')
  }
}

findMemeDuplicates().catch(console.error)
