const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugKittleActivities() {
  console.log('🔍 Debugging Kittle\'s Activities...')
  console.log('')

  try {
    // Get Kittle's profile
    const { data: kittleProfile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('name', 'Kittle')
      .single()

    if (!kittleProfile) {
      console.log('❌ Kittle profile not found')
      return
    }

    console.log(`👤 Found Kittle: ${kittleProfile.name} (${kittleProfile.id})`)

    // Test the exact query that fetchActivities would use
    console.log('')
    console.log('📊 Testing fetchActivities query:')
    console.log('=================================')

    const pageSize = 10
    const from = 0
    const to = pageSize - 1

    console.log(`Query: activities where user_id = '${kittleProfile.id}'`)
    console.log(`Page: ${from} to ${to}`)

    const { data: activities, error, count } = await supabase
      .from('activities')
      .select('*', { count: 'exact' })
      .eq('user_id', kittleProfile.id)
      .order('timestamp', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('❌ Error fetching activities:', error)
      return
    }

    console.log(`✅ Query successful`)
    console.log(`📊 Results: ${activities.length} activities found`)
    console.log(`📊 Total count: ${count}`)

    if (activities.length > 0) {
      console.log('')
      console.log('📋 Activities:')
      activities.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
        console.log(`   ID: ${activity.id}`)
        console.log(`   User ID: ${activity.user_id}`)
        console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
        console.log(`   Metadata:`, JSON.stringify(activity.metadata, null, 2))
        console.log('')
      })
    } else {
      console.log('❌ No activities found - this explains the "No activity yet" message')
    }

    // Also check if there are any activities at all for Kittle
    console.log('🔍 Checking all activities for Kittle:')
    const { data: allActivities } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', kittleProfile.id)

    console.log(`Total activities in database: ${allActivities.length}`)

    if (allActivities.length > 0) {
      console.log('')
      console.log('📋 All Activities:')
      allActivities.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.type.toUpperCase()} - ${new Date(activity.timestamp).toLocaleString()}`)
      })
    }

  } catch (error) {
    console.error('❌ Error debugging Kittle activities:', error)
  }
}

debugKittleActivities()
