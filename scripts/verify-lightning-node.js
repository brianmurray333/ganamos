// Script to verify Lightning node connection and recent transactions
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌ MISSING')
  console.error('   SUPABASE_SECRET_API_KEY:', supabaseSecretKey ? '✅' : '❌ MISSING')
  console.error('\nPlease set these in your .env.local file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)

async function verifyLightningNode() {
  console.log('🔍 Verifying Lightning Node Configuration')
  console.log('='.repeat(60))
  
  // Check environment variables
  const lndRestUrl = process.env.LND_REST_URL
  const lndMacaroon = process.env.LND_ADMIN_MACAROON
  
  console.log('📡 Lightning Node Configuration:')
  console.log(`  LND_REST_URL: ${lndRestUrl}`)
  console.log(`  LND_ADMIN_MACAROON: ${lndMacaroon ? 'Set (hidden)' : 'Missing'}`)
  console.log('')
  
  // Test Lightning node connection
  if (lndRestUrl && lndMacaroon) {
    try {
      console.log('🔌 Testing Lightning Node Connection...')
      const response = await fetch(`https://${lndRestUrl}/v1/getinfo`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': lndMacaroon,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const nodeInfo = await response.json()
        console.log('✅ Lightning Node Connected Successfully!')
        console.log(`  Node Alias: ${nodeInfo.alias || 'Unknown'}`)
        console.log(`  Node Pubkey: ${nodeInfo.identity_pubkey || 'Unknown'}`)
        console.log(`  Version: ${nodeInfo.version || 'Unknown'}`)
        console.log(`  Network: ${nodeInfo.chains?.[0]?.network || 'Unknown'}`)
        console.log('')
      } else {
        console.log('❌ Lightning Node Connection Failed!')
        console.log(`  Status: ${response.status}`)
        console.log(`  Status Text: ${response.statusText}`)
        console.log('')
      }
    } catch (error) {
      console.log('❌ Lightning Node Connection Error!')
      console.log(`  Error: ${error.message}`)
      console.log('')
    }
  } else {
    console.log('❌ Lightning Node credentials not configured!')
    console.log('')
  }
  
  // Check recent transactions in database
  console.log('📊 Recent Ganamos Transactions (Last 10):')
  console.log('-'.repeat(60))
  
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('type', 'deposit')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) {
    console.log('❌ Error fetching transactions:', error.message)
    return
  }
  
  if (transactions.length === 0) {
    console.log('  No completed deposit transactions found')
  } else {
    console.log('  Date | Amount | Memo | R-Hash')
    console.log('  -----|--------|------|-------')
    transactions.forEach(tx => {
      const date = new Date(tx.created_at).toLocaleDateString()
      const rHash = tx.r_hash_str ? tx.r_hash_str.substring(0, 8) + '...' : 'N/A'
      console.log(`  ${date} | ${tx.amount} sats | ${tx.memo || 'N/A'} | ${rHash}`)
    })
  }
  
  console.log('')
  console.log('🔍 Key Questions to Verify:')
  console.log('1. Is the Lightning node "ganamos-lightning-node.m.voltageapp.io" the correct one?')
  console.log('2. Are the recent transactions in the database matching what you see in Voltage?')
  console.log('3. Is there a mismatch between the node balance and your app transactions?')
  console.log('')
  console.log('💡 Next Steps:')
  console.log('- Compare the transaction hashes (r_hash_str) between Ganamos and Voltage')
  console.log('- Check if transactions are being recorded but not reflected in node balance')
  console.log('- Verify the node is receiving payments but not updating the database correctly')
}

verifyLightningNode().catch(console.error)


