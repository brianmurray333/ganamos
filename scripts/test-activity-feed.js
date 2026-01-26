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

async function testActivityFeed() {
  console.log('🧪 Testing Activity Feed...')
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

    // Get recent activities for Brian
    const { data: activities, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', brianProfile.id)
      .order('timestamp', { ascending: false })
      .limit(10)

    if (error) {
      console.error('❌ Error fetching activities:', error)
      return
    }

    console.log('')
    console.log('📊 Recent Activities:')
    console.log('==================')
    console.log('')

    if (activities.length === 0) {
      console.log('No activities found')
      return
    }

    activities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
      console.log(`   ID: ${activity.id}`)
      console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
      console.log(`   Metadata:`, activity.metadata)
      console.log('')
    })

    // Check for deposit activities
    const depositActivities = activities.filter(a => a.type === 'deposit')
    console.log(`💰 Deposit Activities: ${depositActivities.length}`)
    
    // Check for internal activities
    const internalActivities = activities.filter(a => a.type === 'internal')
    console.log(`🔄 Internal Activities: ${internalActivities.length}`)
    
    // Check for transaction activities
    const transactionActivities = activities.filter(a => a.type === 'transaction')
    console.log(`💳 Transaction Activities: ${transactionActivities.length}`)

    console.log('')
    console.log('✅ Activity feed test completed!')
    console.log('')
    console.log('📝 Next Steps:')
    console.log('1. Run the SQL script in Supabase dashboard (see scripts/run-sql-in-dashboard.md)')
    console.log('2. Test sending sats between users')
    console.log('3. Check the profile activity feed for proper amounts and destinations')

  } catch (error) {
    console.error('❌ Error testing activity feed:', error)
  }
}

testActivityFeed()
