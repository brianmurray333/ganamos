const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testActivityLoading() {
  console.log('🧪 Testing Activity Loading States...')
  console.log('')

  try {
    // Get Brian's user ID
    const { data: brianProfile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'admin@example.com')
      .single()

    if (!brianProfile) {
      console.log('❌ Brian profile not found')
      return
    }

    console.log(`👤 Found Brian: ${brianProfile.email} (${brianProfile.id})`)

    // Test activity fetching
    console.log('')
    console.log('📊 Testing Activity Fetching:')
    console.log('==========================')

    const { data: activities, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', brianProfile.id)
      .order('timestamp', { ascending: false })
      .limit(5)

    if (error) {
      console.error('❌ Error fetching activities:', error)
      return
    }

    console.log(`✅ Found ${activities.length} activities`)
    
    if (activities.length > 0) {
      console.log('')
      console.log('📋 Recent Activities:')
      activities.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
        console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
        console.log(`   Metadata:`, activity.metadata)
        console.log('')
      })
    }

    // Test different activity types
    const activityTypes = activities.reduce((acc, activity) => {
      acc[activity.type] = (acc[activity.type] || 0) + 1
      return acc
    }, {})

    console.log('📊 Activity Type Breakdown:')
    console.log('==========================')
    Object.entries(activityTypes).forEach(([type, count]) => {
      console.log(`${type}: ${count}`)
    })

    console.log('')
    console.log('✅ Activity loading test completed!')
    console.log('')
    console.log('🔧 Expected Behavior:')
    console.log('1. When switching accounts: Show skeleton loader')
    console.log('2. When loading activities: Show skeleton loader')
    console.log('3. When no activities: Show "No activity yet" only after loading completes')
    console.log('4. When activities exist: Show activity cards')

  } catch (error) {
    console.error('❌ Error testing activity loading:', error)
  }
}

testActivityLoading()
