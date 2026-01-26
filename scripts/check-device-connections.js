// Check which devices are connected to multiple users
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkDeviceConnections() {
  console.log('🔍 CHECKING DEVICE CONNECTIONS')
  console.log('='.repeat(80))

  // Get all devices
  const { data: devices, error } = await supabase
    .from('devices')
    .select('id, user_id, pairing_code, pet_name, pet_type, status, created_at')
    .order('pairing_code', { ascending: true })

  if (error) {
    console.error('❌ Error fetching devices:', error.message)
    return
  }

  console.log(`\n📊 Found ${devices.length} total devices\n`)

  // Group by pairing code
  const devicesByCode = {}
  devices.forEach(device => {
    if (!devicesByCode[device.pairing_code]) {
      devicesByCode[device.pairing_code] = []
    }
    devicesByCode[device.pairing_code].push(device)
  })

  // Find duplicates
  const duplicates = []
  for (const [code, devicesWithCode] of Object.entries(devicesByCode)) {
    if (devicesWithCode.length > 1) {
      duplicates.push({ code, devices: devicesWithCode })
    }
  }

  if (duplicates.length === 0) {
    console.log('✅ No devices connected to multiple users')
  } else {
    console.log(`🚨 Found ${duplicates.length} device(s) connected to multiple users:\n`)
    
    for (const dup of duplicates) {
      console.log(`Pairing Code: ${dup.code}`)
      console.log(`Pet: ${dup.devices[0].pet_name} (${dup.devices[0].pet_type})`)
      console.log(`Connected to ${dup.devices.length} users:`)
      
      for (const device of dup.devices) {
        // Get user email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, name')
          .eq('id', device.user_id)
          .single()
        
        console.log(`  - User: ${profile?.email || device.user_id}`)
        console.log(`    Name: ${profile?.name || 'Unknown'}`)
        console.log(`    Device ID: ${device.id}`)
        console.log(`    Status: ${device.status}`)
        console.log(`    Created: ${new Date(device.created_at).toLocaleString()}`)
      }
      console.log('')
    }
  }

  // Summary
  console.log('\n📊 SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total devices: ${devices.length}`)
  console.log(`Unique pairing codes: ${Object.keys(devicesByCode).length}`)
  console.log(`Devices with multiple connections: ${duplicates.length}`)
}

checkDeviceConnections().catch(console.error)
