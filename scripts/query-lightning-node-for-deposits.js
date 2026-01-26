// Script to query Lightning node for actual deposit amounts
// This will fix deposits with amount = 0 by getting actual amounts from the node

const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌ MISSING')
  console.error('   SUPABASE_SECRET_API_KEY:', supabaseSecretKey ? '✅' : '❌ MISSING')
  console.error('\nPlease set these in your .env.local file')
  process.exit(1)
}

const VOLTAGE_API_URL = process.env.VOLTAGE_API_URL || 'https://ganamos-lightning-node.m.voltageapp.io'
const VOLTAGE_MACAROON = process.env.VOLTAGE_MACAROON || process.env.LIGHTNING_MACAROON
const VOLTAGE_CERT = process.env.VOLTAGE_CERT || process.env.LIGHTNING_CERT

const supabase = createClient(supabaseUrl, supabaseSecretKey)

async function checkInvoiceFromNode(rHash) {
  return new Promise((resolve, reject) => {
    try {
      // Convert hex string to base64 if needed
      let rHashParam = rHash
      if (!/^[a-zA-Z0-9+/=]+$/.test(rHash)) {
        // If not already base64, convert from hex to base64
        const buffer = Buffer.from(rHash, "hex")
        rHashParam = buffer.toString("base64")
      }

      const url = `${VOLTAGE_API_URL}/v1/invoice/${encodeURIComponent(rHashParam)}`
      
      const options = {
        headers: {
          'Grpc-Metadata-macaroon': VOLTAGE_MACAROON,
        },
        rejectUnauthorized: false, // Voltage uses self-signed certs
      }

      https.get(url, options, (res) => {
        let data = ''
        
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          try {
            const invoice = JSON.parse(data)
            resolve({
              success: true,
              settled: invoice.settled || false,
              amountPaid: invoice.amt_paid_sat || invoice.value || 0,
              state: invoice.state,
            })
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`))
          }
        })
      }).on('error', (error) => {
        reject(error)
      })
    } catch (error) {
      reject(error)
    }
  })
}

async function fixZeroAmountDeposits() {
  console.log('🔍 Finding deposits with amount = 0...')
  
  // Get all completed deposits with amount = 0
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('id, user_id, r_hash_str, amount, created_at')
    .eq('type', 'deposit')
    .eq('status', 'completed')
    .eq('amount', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching transactions:', error)
    return
  }

  console.log(`Found ${transactions.length} deposits with amount = 0`)
  
  const fixes = []
  
  for (const tx of transactions) {
    console.log(`\n📋 Checking transaction ${tx.id}...`)
    console.log(`   r_hash: ${tx.r_hash_str}`)
    
    try {
      const invoiceInfo = await checkInvoiceFromNode(tx.r_hash_str)
      
      if (invoiceInfo.success && invoiceInfo.settled && invoiceInfo.amountPaid > 0) {
        console.log(`   ✅ Invoice settled, amount paid: ${invoiceInfo.amountPaid} sats`)
        
        fixes.push({
          transactionId: tx.id,
          rHash: tx.r_hash_str,
          currentAmount: tx.amount,
          actualAmount: invoiceInfo.amountPaid,
        })
      } else {
        console.log(`   ⚠️  Invoice not settled or amount is 0`)
        console.log(`   State: ${invoiceInfo.state}, Amount: ${invoiceInfo.amountPaid}`)
      }
    } catch (error) {
      console.error(`   ❌ Error checking invoice: ${error.message}`)
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log(`\n\n📊 Summary:`)
  console.log(`Found ${fixes.length} deposits that can be fixed`)
  
  if (fixes.length === 0) {
    console.log('No fixes needed')
    return
  }
  
  // Show what will be fixed
  console.log('\n🔧 Transactions to fix:')
  fixes.forEach(fix => {
    console.log(`   ${fix.transactionId}: ${fix.currentAmount} → ${fix.actualAmount} sats`)
  })
  
  // Ask for confirmation
  console.log('\n⚠️  This will update transaction amounts. Proceed? (y/n)')
  // In a real script, you'd use readline or similar
  // For now, we'll just show what would be updated
  
  console.log('\n📝 SQL UPDATE statements:')
  fixes.forEach(fix => {
    console.log(`UPDATE transactions SET amount = ${fix.actualAmount}, updated_at = NOW() WHERE id = '${fix.transactionId}';`)
  })
}

// Run the script
fixZeroAmountDeposits().catch(console.error)

