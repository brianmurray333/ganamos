const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/**
 * Check all users for multiple devices
 */
async function checkAllUsersForMultipleDevices() {
  console.log('🔍 Checking all users for multiple devices...\n')

  try {
    // Get all devices grouped by user
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('user_id')

    if (devicesError) {
      console.error('❌ Error fetching devices:', devicesError)
      return
    }

    if (!devices || devices.length === 0) {
      console.log('ℹ️  No devices found in database')
      return
    }

    // Count devices per user
    const userDeviceCounts = {}
    devices.forEach(device => {
      userDeviceCounts[device.user_id] = (userDeviceCounts[device.user_id] || 0) + 1
    })

    // Find users with multiple devices
    const usersWithMultipleDevices = Object.entries(userDeviceCounts)
      .filter(([userId, count]) => count > 1)

    console.log(`📊 Total users with devices: ${Object.keys(userDeviceCounts).length}`)
    console.log(`📊 Total devices: ${devices.length}`)
    console.log(`⚠️  Users with multiple devices: ${usersWithMultipleDevices.length}\n`)

    if (usersWithMultipleDevices.length === 0) {
      console.log('✅ No users have multiple devices!')
      console.log('   Safe to apply database constraint.\n')
      return
    }

    // Get details for users with multiple devices
    console.log('Users with multiple devices:\n')
    
    for (const [userId, count] of usersWithMultipleDevices) {
      // Get profile info
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', userId)
        .single()

      // Get their devices
      const { data: userDevices } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', userId)
        .order('last_seen_at', { ascending: false, nullsFirst: false })

      console.log(`👤 User: ${profile?.email || userId}`)
      console.log(`   Device Count: ${count}`)
      console.log(`   Devices:`)
      
      userDevices?.forEach((device, index) => {
        console.log(`     ${index + 1}. ${device.pet_name} (${device.pet_type}) - ${device.pairing_code}`)
        console.log(`        Last Seen: ${device.last_seen_at || 'Never'}`)
      })
      console.log('')
    }

    console.log('\n⚠️  ACTION REQUIRED:')
    console.log('   Run cleanup for each user before applying database constraint:')
    console.log('   node scripts/clean-user-devices.js <user_email> --confirm\n')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkAllUsersForMultipleDevices()
