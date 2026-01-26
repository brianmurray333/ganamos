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

async function testUserSpecificActivities() {
  console.log('🧪 Testing User-Specific Activities...')
  console.log('')

  try {
    // Get Brian's user ID
    const { data: brianProfile } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', 'admin@example.com')
      .single()

    if (!brianProfile) {
      console.log('❌ Brian profile not found')
      return
    }

    console.log(`👤 Found Brian: ${brianProfile.name} (${brianProfile.id})`)

    // Get Kit's user ID (child account)
    const { data: kitProfile } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('name', 'Kittle')
      .single()

    if (!kitProfile) {
      console.log('❌ Kit profile not found')
      return
    }

    console.log(`👤 Found Kit: ${kitProfile.name} (${kitProfile.id})`)
    console.log('')

    // Test Brian's activities
    console.log('📊 Brian\'s Activities:')
    console.log('====================')
    const { data: brianActivities } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', brianProfile.id)
      .order('timestamp', { ascending: false })
      .limit(5)

    if (brianActivities && brianActivities.length > 0) {
      brianActivities.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
        console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
        console.log(`   Metadata:`, activity.metadata)
        console.log('')
      })
    } else {
      console.log('No activities found for Brian')
    }

    console.log('')
    console.log('📊 Kit\'s Activities:')
    console.log('===================')
    const { data: kitActivities } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', kitProfile.id)
      .order('timestamp', { ascending: false })
      .limit(5)

    if (kitActivities && kitActivities.length > 0) {
      kitActivities.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
        console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
        console.log(`   Metadata:`, activity.metadata)
        console.log('')
      })
    } else {
      console.log('No activities found for Kit')
    }

    console.log('')
    console.log('🔍 Expected Behavior:')
    console.log('- Brian should see "You sent 3k sats to @kit"')
    console.log('- Kit should see "You received 3k sats from @brian"')
    console.log('- Each user should only see their own activities')

  } catch (error) {
    console.error('❌ Error testing user-specific activities:', error)
  }
}

testUserSpecificActivities()
