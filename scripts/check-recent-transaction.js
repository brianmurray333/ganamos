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

async function checkRecentTransaction() {
  console.log('🔍 Checking recent 8k sats transaction between admin@example.com and anniecarruth@gmail.com...')
  console.log('')

  try {
    // Get both user profiles
    console.log('📊 Step 1: Getting user profiles...')
    const { data: brianProfile, error: brianError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'admin@example.com')
      .single()

    const { data: annieProfile, error: annieError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'anniecarruth@gmail.com')
      .single()

    if (brianError || !brianProfile) {
      console.error('❌ Error finding admin@example.com:', brianError)
      return
    }

    if (annieError || !annieProfile) {
      console.error('❌ Error finding anniecarruth@gmail.com:', annieError)
      return
    }

    console.log(`✅ Found Brian: ${brianProfile.id}`)
    console.log(`✅ Found Annie: ${annieProfile.id}`)
    console.log('')

    // Check recent transactions for both users (last 10 minutes)
    console.log('🔍 Step 2: Checking recent transactions for both users...')
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    
    const { data: brianTransactions, error: brianTxError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', brianProfile.id)
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })

    const { data: annieTransactions, error: annieTxError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', annieProfile.id)
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })

    if (brianTxError) {
      console.error('❌ Error fetching Brian\'s transactions:', brianTxError)
      return
    }

    if (annieTxError) {
      console.error('❌ Error fetching Annie\'s transactions:', annieTxError)
      return
    }

    console.log(`📊 Brian's recent transactions (${brianTransactions.length}):`)
    brianTransactions.forEach(tx => {
      console.log(`   ${tx.created_at} | ${tx.type} | ${tx.amount} sats | ${tx.status} | ${tx.memo || 'No memo'}`)
    })
    console.log('')

    console.log(`📊 Annie's recent transactions (${annieTransactions.length}):`)
    annieTransactions.forEach(tx => {
      console.log(`   ${tx.created_at} | ${tx.type} | ${tx.amount} sats | ${tx.status} | ${tx.memo || 'No memo'}`)
    })
    console.log('')

    // Look for the specific 8k transaction
    console.log('🔍 Step 3: Looking for 8k sats transaction...')
    const brian8kTx = brianTransactions.find(tx => Math.abs(tx.amount) === 8000)
    const annie8kTx = annieTransactions.find(tx => Math.abs(tx.amount) === 8000)

    if (brian8kTx) {
      console.log('✅ Found Brian\'s 8k transaction:')
      console.log(`   ID: ${brian8kTx.id}`)
      console.log(`   Amount: ${brian8kTx.amount} sats`)
      console.log(`   Type: ${brian8kTx.type}`)
      console.log(`   Status: ${brian8kTx.status}`)
      console.log(`   Memo: ${brian8kTx.memo || 'No memo'}`)
      console.log(`   Created: ${brian8kTx.created_at}`)
    } else {
      console.log('❌ No 8k transaction found for Brian')
    }

    if (annie8kTx) {
      console.log('✅ Found Annie\'s 8k transaction:')
      console.log(`   ID: ${annie8kTx.id}`)
      console.log(`   Amount: ${annie8kTx.amount} sats`)
      console.log(`   Type: ${annie8kTx.type}`)
      console.log(`   Status: ${annie8kTx.status}`)
      console.log(`   Memo: ${annie8kTx.memo || 'No memo'}`)
      console.log(`   Created: ${annie8kTx.created_at}`)
    } else {
      console.log('❌ No 8k transaction found for Annie')
    }

    console.log('')

    // Check current balances
    console.log('💰 Step 4: Current balances:')
    console.log(`   Brian: ${brianProfile.balance} sats`)
    console.log(`   Annie: ${annieProfile.balance} sats`)
    console.log('')

    // Summary
    console.log('📋 SUMMARY:')
    console.log('===========')
    if (brian8kTx && annie8kTx) {
      console.log('✅ Both transactions found - transfer completed correctly!')
      console.log(`   Brian sent: ${Math.abs(brian8kTx.amount)} sats`)
      console.log(`   Annie received: ${annie8kTx.amount} sats`)
    } else if (brian8kTx && !annie8kTx) {
      console.log('⚠️  Only Brian\'s transaction found - Annie\'s transaction missing!')
      console.log('   This suggests the transfer was not completed correctly.')
    } else if (!brian8kTx && annie8kTx) {
      console.log('⚠️  Only Annie\'s transaction found - Brian\'s transaction missing!')
      console.log('   This suggests the transfer was not completed correctly.')
    } else {
      console.log('❌ No 8k transactions found for either user')
      console.log('   The transfer may not have been recorded or used a different amount.')
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkRecentTransaction()
