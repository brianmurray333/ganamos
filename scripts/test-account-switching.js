const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testAccountSwitching() {
  console.log('🧪 Testing Account Switching Activities...')
  console.log('')

  try {
    // Get all the users mentioned
    const users = [
      { name: 'Brian Murray', email: 'admin@example.com' },
      { name: 'Kittle', email: null },
      { name: 'Marlowe', email: null },
      { name: 'Annie M', email: 'anniecarruth@gmail.com' },
      { name: 'Brynn', email: null },
      { name: 'Charlotte', email: null }
    ]

    for (const userInfo of users) {
      console.log(`👤 Testing ${userInfo.name}:`)
      console.log('='.repeat(50))
      
      let profile
      if (userInfo.email) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('email', userInfo.email)
          .single()
        profile = data
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('name', userInfo.name)
          .single()
        profile = data
      }

      if (!profile) {
        console.log(`❌ Profile not found for ${userInfo.name}`)
        console.log('')
        continue
      }

      console.log(`✅ Found: ${profile.name} (${profile.id})`)

      // Get activities for this user
      const { data: activities } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', profile.id)
        .order('timestamp', { ascending: false })
        .limit(3)

      console.log(`📊 Activities (${activities.length} found):`)
      
      if (activities.length === 0) {
        console.log('   No activities found')
      } else {
        activities.forEach((activity, index) => {
          console.log(`   ${index + 1}. ${activity.type.toUpperCase()}`)
          console.log(`      Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
          if (activity.metadata) {
            console.log(`      Metadata:`, JSON.stringify(activity.metadata, null, 6))
          }
        })
      }
      
      console.log('')
    }

    console.log('🔍 Expected Behavior:')
    console.log('- Each user should see their own activities only')
    console.log('- Activities should update when switching accounts')
    console.log('- No cached activities from other users should show')

  } catch (error) {
    console.error('❌ Error testing account switching:', error)
  }
}

testAccountSwitching()
