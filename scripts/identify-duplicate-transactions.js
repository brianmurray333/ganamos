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

async function identifyDuplicateTransactions() {
  console.log('🔍 Identifying duplicate transactions...')
  console.log('')

  try {
    // Get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ Error fetching transactions:', error)
      return
    }

    console.log(`📊 Total transactions: ${transactions.length}`)
    console.log('')

    // Group transactions by user and amount
    const groupedTransactions = {}
    
    transactions.forEach(tx => {
      const key = `${tx.user_id}-${tx.amount}-${tx.type}`
      if (!groupedTransactions[key]) {
        groupedTransactions[key] = []
      }
      groupedTransactions[key].push(tx)
    })

    // Find potential duplicates
    const duplicates = []
    const suspiciousPatterns = []

    Object.entries(groupedTransactions).forEach(([key, txs]) => {
      if (txs.length > 1) {
        // Check for same amount, same user, same type within a short time window
        const sortedTxs = txs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        
        for (let i = 0; i < sortedTxs.length - 1; i++) {
          const tx1 = sortedTxs[i]
          const tx2 = sortedTxs[i + 1]
          
          const timeDiff = new Date(tx2.created_at) - new Date(tx1.created_at)
          const timeDiffMinutes = timeDiff / (1000 * 60)
          
          // If transactions are within 5 minutes and have different memo patterns
          if (timeDiffMinutes <= 5) {
            const memo1 = tx1.memo || ''
            const memo2 = tx2.memo || ''
            
            // Check for the specific duplicate patterns we identified
            const isDepositPattern1 = memo1.includes('Deposit') && memo1.includes('sats to Ganamos!')
            const isDepositPattern2 = memo2.includes('Deposit of') && memo2.includes('sats')
            
            const isWithdrawalPattern1 = memo1.includes('Withdrawal of') && memo1.includes('sats from Ganamos!')
            const isWithdrawalPattern2 = memo2.includes('Withdrawal of') && memo2.includes('sats')
            
            if ((isDepositPattern1 && isDepositPattern2) || (isWithdrawalPattern1 && isWithdrawalPattern2)) {
              duplicates.push({
                type: 'duplicate',
                tx1,
                tx2,
                timeDiffMinutes,
                reason: 'Same amount, different memo patterns, close timestamps'
              })
            }
          }
        }
      }
    })

    // Look for transactions with NULL r_hash_str but completed status (suspicious)
    const nullHashTransactions = transactions.filter(tx => 
      tx.type === 'deposit' && 
      tx.status === 'completed' && 
      (tx.r_hash_str === null || tx.payment_request === null) &&
      tx.amount > 0
    )

    nullHashTransactions.forEach(tx => {
      suspiciousPatterns.push({
        type: 'null_hash',
        transaction: tx,
        reason: 'Completed deposit with NULL r_hash_str or payment_request'
      })
    })

    // Look for transactions with identical timestamps (suspicious)
    const timestampGroups = {}
    transactions.forEach(tx => {
      const timestamp = tx.created_at
      if (!timestampGroups[timestamp]) {
        timestampGroups[timestamp] = []
      }
      timestampGroups[timestamp].push(tx)
    })

    Object.entries(timestampGroups).forEach(([timestamp, txs]) => {
      if (txs.length > 1) {
        suspiciousPatterns.push({
          type: 'identical_timestamp',
          transactions: txs,
          timestamp,
          reason: 'Multiple transactions with identical timestamps'
        })
      }
    })

    // Display results
    console.log('🔍 DUPLICATE TRANSACTIONS FOUND:')
    console.log('================================')
    
    if (duplicates.length === 0) {
      console.log('✅ No obvious duplicates found using the pattern matching approach')
    } else {
      console.log(`❌ Found ${duplicates.length} potential duplicate pairs:`)
      console.log('')
      
      duplicates.forEach((dup, index) => {
        console.log(`${index + 1}. User: ${dup.tx1.user_id}`)
        console.log(`   Amount: ${dup.tx1.amount} sats`)
        console.log(`   Type: ${dup.tx1.type}`)
        console.log(`   Time diff: ${dup.timeDiffMinutes.toFixed(2)} minutes`)
        console.log(`   TX1: ${dup.tx1.memo} (${dup.tx1.created_at})`)
        console.log(`   TX2: ${dup.tx2.memo} (${dup.tx2.created_at})`)
        console.log(`   TX1 r_hash: ${dup.tx1.r_hash_str ? 'Present' : 'NULL'}`)
        console.log(`   TX2 r_hash: ${dup.tx2.r_hash_str ? 'Present' : 'NULL'}`)
        console.log('')
      })
    }

    console.log('🔍 SUSPICIOUS PATTERNS:')
    console.log('======================')
    
    if (nullHashTransactions.length > 0) {
      console.log(`❌ Found ${nullHashTransactions.length} completed deposits with NULL r_hash_str:`)
      nullHashTransactions.forEach((tx, index) => {
        console.log(`${index + 1}. User: ${tx.user_id}, Amount: ${tx.amount}, Memo: ${tx.memo}`)
        console.log(`   Created: ${tx.created_at}, Status: ${tx.status}`)
      })
      console.log('')
    }

    const identicalTimestampGroups = Object.values(timestampGroups).filter(group => group.length > 1)
    if (identicalTimestampGroups.length > 0) {
      console.log(`❌ Found ${identicalTimestampGroups.length} groups with identical timestamps:`)
      identicalTimestampGroups.forEach((group, index) => {
        console.log(`${index + 1}. Timestamp: ${group[0].created_at}`)
        group.forEach(tx => {
          console.log(`   - User: ${tx.user_id}, Amount: ${tx.amount}, Type: ${tx.type}, Memo: ${tx.memo}`)
        })
        console.log('')
      })
    }

    // Summary
    console.log('📊 SUMMARY:')
    console.log('===========')
    console.log(`Total transactions: ${transactions.length}`)
    console.log(`Potential duplicates: ${duplicates.length}`)
    console.log(`NULL hash transactions: ${nullHashTransactions.length}`)
    console.log(`Identical timestamp groups: ${identicalTimestampGroups.length}`)
    
    if (duplicates.length > 0 || nullHashTransactions.length > 0 || identicalTimestampGroups.length > 0) {
      console.log('')
      console.log('⚠️  RECOMMENDATION:')
      console.log('Review these transactions carefully before deleting any.')
      console.log('Consider creating a backup before making changes.')
      console.log('Focus on transactions with NULL r_hash_str first, as these are most likely duplicates.')
    } else {
      console.log('')
      console.log('✅ No obvious duplicate patterns detected!')
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

identifyDuplicateTransactions()


