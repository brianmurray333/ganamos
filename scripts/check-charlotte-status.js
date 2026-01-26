const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SECRET_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCharlotteStatus() {
  console.log('🔍 Checking Charlotte\'s account status after deletion...')
  console.log('')

  try {
    // Check if Charlotte's profile still exists
    const { data: charlotteProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', '%Charlotte%')
      .single()

    if (profileError) {
      console.log('❌ Charlotte\'s profile not found - it was HARD DELETED!')
      console.log('This means:')
      console.log('  - All her data is permanently lost')
      console.log('  - Her transactions are now orphaned')
      console.log('  - Her auth user was deleted')
      console.log('  - No way to recover her account')
      console.log('')
      console.log('🚨 This is exactly why we need soft deletion!')
      return
    }

    console.log('✅ Charlotte\'s profile still exists:')
    console.log(`   ID: ${charlotteProfile.id}`)
    console.log(`   Name: ${charlotteProfile.name}`)
    console.log(`   Email: ${charlotteProfile.email}`)
    console.log(`   Status: ${charlotteProfile.status || 'unknown'}`)
    console.log(`   Balance: ${charlotteProfile.balance} sats`)
    console.log('')

    // Check her transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', charlotteProfile.id)
      .order('created_at', { ascending: false })

    if (txError) {
      console.log('❌ Error fetching transactions:', txError)
    } else {
      console.log(`📊 Charlotte has ${transactions?.length || 0} transactions:`)
      transactions?.forEach(tx => {
        console.log(`   ${tx.created_at} | ${tx.type} | ${tx.amount} sats | ${tx.status}`)
      })
    }

    // Check if she's still connected to Brian
    const { data: connection, error: connError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('connected_user_id', charlotteProfile.id)

    if (connError) {
      console.log('❌ Error checking connection:', connError)
    } else if (connection && connection.length > 0) {
      console.log('✅ Charlotte is still connected to her parent')
    } else {
      console.log('❌ Charlotte is no longer connected to her parent')
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkCharlotteStatus()
