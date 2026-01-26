const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugActivityDisplay() {
  console.log('🔍 Debugging Activity Display Issue...')
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

    // Get Kit's most recent activities
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', kitProfile.id)
      .order('timestamp', { ascending: false })
      .limit(5)

    console.log('')
    console.log('📊 Kit\'s Activities (in order):')
    console.log('================================')

    activities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.type.toUpperCase()}`)
      console.log(`   ID: ${activity.id}`)
      console.log(`   Timestamp: ${new Date(activity.timestamp).toLocaleString()}`)
      console.log(`   Metadata:`, JSON.stringify(activity.metadata, null, 2))
      
      // Simulate the ActivityTitle logic
      if (activity.type === 'internal') {
        const amount = activity.metadata?.amount
        const memo = activity.metadata?.memo || ""
        
        console.log(`   🧪 ActivityTitle Logic Test:`)
        console.log(`   - Amount: ${amount} (${amount > 0 ? 'positive' : 'negative'})`)
        console.log(`   - Memo: "${memo}"`)
        
        if (amount && amount < 0) {
          const recipient = memo.includes("Transfer to @") 
            ? memo.match(/Transfer to @([^:]+)/)?.[1]?.trim()
            : "someone"
          console.log(`   - RESULT: "You sent ${Math.abs(amount)} sats to @${recipient}"`)
        } else if (amount && amount > 0) {
          const sender = memo.includes("Transfer from @") 
            ? memo.match(/Transfer from @([^:]+)/)?.[1]?.trim()
            : "someone"
          console.log(`   - RESULT: "You received ${amount} sats from @${sender}"`)
        } else {
          console.log(`   - RESULT: "Internal transfer"`)
        }
      } else if (activity.type === 'deposit') {
        const amount = activity.metadata?.amount
        if (amount && amount > 0) {
          console.log(`   - RESULT: "You deposited ${amount} sats"`)
        } else {
          console.log(`   - RESULT: "You deposited Bitcoin"`)
        }
      }
      console.log('')
    })

    console.log('🔍 Expected vs Actual:')
    console.log('- Expected: "You received 3k sats from @Brian"')
    console.log('- Actual in browser: "You sent 3k sats to @kit"')
    console.log('')
    console.log('🤔 This suggests the wrong activity is being displayed or there\'s a caching issue.')

  } catch (error) {
    console.error('❌ Error debugging activity display:', error)
  }
}

debugActivityDisplay()
