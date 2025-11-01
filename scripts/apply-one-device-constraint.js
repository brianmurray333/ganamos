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
 * Apply unique constraint to enforce one device per user
 */
async function applyUniqueConstraint() {
  console.log('🔧 Applying unique constraint to enforce one device per user...\n')

  try {
    // First, verify there are no users with multiple devices
    console.log('Step 1: Checking for users with multiple devices...')
    
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('user_id')

    if (devicesError) {
      console.error('❌ Error fetching devices:', devicesError)
      return
    }

    const userDeviceCounts = {}
    devices?.forEach(device => {
      userDeviceCounts[device.user_id] = (userDeviceCounts[device.user_id] || 0) + 1
    })

    const usersWithMultiple = Object.values(userDeviceCounts).filter(count => count > 1).length

    if (usersWithMultiple > 0) {
      console.error(`❌ Found ${usersWithMultiple} user(s) with multiple devices!`)
      console.error('   Run cleanup script first: node scripts/check-all-multi-device-users.js')
      return
    }

    console.log('✅ No users with multiple devices found\n')

    // Apply the constraint using RPC or raw SQL
    console.log('Step 2: Adding unique constraint on devices.user_id...')
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE devices ADD CONSTRAINT devices_user_id_unique UNIQUE (user_id);'
    })

    if (error) {
      // If RPC doesn't work, provide manual instructions
      if (error.message.includes('function') || error.code === '42883') {
        console.log('\n⚠️  Cannot apply constraint via API. Please run this SQL manually in Supabase Dashboard:\n')
        console.log('----------------------------------------')
        console.log('ALTER TABLE devices')
        console.log('ADD CONSTRAINT devices_user_id_unique UNIQUE (user_id);')
        console.log('----------------------------------------\n')
        console.log('Instructions:')
        console.log('1. Go to Supabase Dashboard → SQL Editor')
        console.log('2. Paste the SQL above')
        console.log('3. Click "Run"\n')
        return
      }
      
      console.error('❌ Error applying constraint:', error)
      return
    }

    console.log('✅ Unique constraint added successfully!\n')
    console.log('📋 Summary:')
    console.log('   - Each user can now only have one device')
    console.log('   - Pairing a new device will automatically remove the old one')
    console.log('   - The device registration API has been updated to handle this\n')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    
    // Provide manual instructions as fallback
    console.log('\n⚠️  Please run this SQL manually in Supabase Dashboard:\n')
    console.log('----------------------------------------')
    console.log('ALTER TABLE devices')
    console.log('ADD CONSTRAINT devices_user_id_unique UNIQUE (user_id);')
    console.log('----------------------------------------\n')
  }
}

applyUniqueConstraint()
