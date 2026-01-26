const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAllRecentActivities() {
  console.log('🔍 Checking All Recent Activities...')
  console.log('')

  try {
    // Get all recent activities across all users
    const { data: allActivities } = await supabase
      .from('activities')
      .select('*, profiles(name)')
      .order('timestamp', { ascending: false })
      .limit(10)

    console.log('📊 All Recent Activities (across all users):')
    console.log('===========================================')

    allActivities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
      console.log(`   User: ${activity.profiles?.name || 'Unknown'} (${activity.user_id})`)
      console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
      console.log(`   Metadata:`, JSON.stringify(activity.metadata, null, 2))
      console.log('')
    })

    // Check specifically for activities with "kit" in the memo
    console.log('🔍 Activities mentioning "kit":')
    console.log('===============================')
    
    const kitActivities = allActivities.filter(activity => 
      activity.metadata?.memo?.toLowerCase().includes('kit')
    )

    kitActivities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
      console.log(`   User: ${activity.profiles?.name || 'Unknown'} (${activity.user_id})`)
      console.log(`   Memo: "${activity.metadata?.memo}"`)
      console.log(`   Amount: ${activity.metadata?.amount}`)
      console.log('')
    })

  } catch (error) {
    console.error('❌ Error checking activities:', error)
  }
}

checkAllRecentActivities()
