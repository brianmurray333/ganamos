const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugKitActivities() {
  console.log('🔍 Debugging Kit\'s Activities...')
  console.log('')

  try {
    // Get Kit's user ID
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

    // Get Kit's activities
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', kitProfile.id)
      .order('timestamp', { ascending: false })
      .limit(3)

    console.log('')
    console.log('📊 Kit\'s Recent Activities:')
    console.log('===========================')

    activities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
      console.log(`   ID: ${activity.id}`)
      console.log(`   User ID: ${activity.user_id}`)
      console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
      console.log(`   Metadata:`, JSON.stringify(activity.metadata, null, 2))
      
      // Test the parsing logic
      if (activity.type === 'internal') {
        const amount = activity.metadata?.amount
        const memo = activity.metadata?.memo || ""
        
        console.log(`   Parsing Test:`)
        console.log(`   - Amount: ${amount} (${amount > 0 ? 'positive' : 'negative'})`)
        console.log(`   - Memo: "${memo}"`)
        
        if (amount && amount > 0) {
          const sender = memo.includes("Transfer from @") 
            ? memo.match(/Transfer from @([^:]+)/)?.[1]?.trim()
            : "someone"
          console.log(`   - Parsed sender: "${sender}"`)
          console.log(`   - Expected display: "You received ${amount} sats from @${sender}"`)
        } else if (amount && amount < 0) {
          const recipient = memo.includes("Transfer to @") 
            ? memo.match(/Transfer to @([^:]+)/)?.[1]?.trim()
            : "someone"
          console.log(`   - Parsed recipient: "${recipient}"`)
          console.log(`   - Expected display: "You sent ${Math.abs(amount)} sats to @${recipient}"`)
        }
      }
      console.log('')
    })

  } catch (error) {
    console.error('❌ Error debugging Kit activities:', error)
  }
}

debugKitActivities()
