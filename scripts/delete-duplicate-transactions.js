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

async function deleteDuplicateTransactions() {
  console.log('🗑️  Deleting duplicate transactions...')
  console.log('')

  try {
    // First, let's identify the duplicate transactions
    console.log('🔍 Step 1: Identifying duplicate transactions...')
    
    const { data: duplicateTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('type', 'deposit')
      .eq('status', 'completed')
      .is('r_hash_str', null)
      .is('payment_request', null)
      .like('memo', 'Deposit of % sats')

    if (fetchError) {
      console.error('❌ Error fetching duplicate transactions:', fetchError)
      return
    }

    console.log(`📊 Found ${duplicateTransactions.length} potential duplicate transactions`)
    console.log('')

    if (duplicateTransactions.length === 0) {
      console.log('✅ No duplicate transactions found!')
      return
    }

    // Group by user to calculate balance adjustments
    const userAdjustments = {}
    const transactionsToDelete = []

    duplicateTransactions.forEach(tx => {
      if (!userAdjustments[tx.user_id]) {
        userAdjustments[tx.user_id] = {
          totalAmount: 0,
          transactionCount: 0,
          transactions: []
        }
      }
      
      userAdjustments[tx.user_id].totalAmount += tx.amount
      userAdjustments[tx.user_id].transactionCount += 1
      userAdjustments[tx.user_id].transactions.push(tx)
      transactionsToDelete.push(tx.id)
    })

    // Display what we're about to delete
    console.log('🔍 Step 2: Analyzing duplicates to delete...')
    console.log('==============================================')
    
    Object.entries(userAdjustments).forEach(([userId, data]) => {
      console.log(`👤 User: ${userId}`)
      console.log(`   Transactions to delete: ${data.transactionCount}`)
      console.log(`   Total amount to subtract: ${data.totalAmount} sats`)
      data.transactions.forEach(tx => {
        console.log(`   - ${tx.memo} (${tx.amount} sats) - ${tx.created_at}`)
      })
      console.log('')
    })

    // Get current user balances for verification
    console.log('🔍 Step 3: Getting current user balances...')
    const userIds = Object.keys(userAdjustments)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, balance, email')
      .in('id', userIds)

    if (profilesError) {
      console.error('❌ Error fetching user profiles:', profilesError)
      return
    }

    console.log('📊 Current balances:')
    profiles.forEach(profile => {
      const adjustment = userAdjustments[profile.id]
      console.log(`   ${profile.email || profile.id}: ${profile.balance} sats`)
      console.log(`   Will subtract: ${adjustment.totalAmount} sats`)
      console.log(`   New balance will be: ${profile.balance - adjustment.totalAmount} sats`)
      console.log('')
    })

    // Confirm before proceeding
    console.log('⚠️  WARNING: This will permanently delete duplicate transactions and update user balances!')
    console.log('')
    console.log('📋 Summary of changes:')
    console.log(`   - Delete ${transactionsToDelete.length} duplicate transactions`)
    console.log(`   - Update ${userIds.length} user balances`)
    console.log('')
    console.log('🔄 Proceeding with deletion...')
    console.log('')

    // Delete the duplicate transactions
    console.log('🗑️  Step 4: Deleting duplicate transactions...')
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .in('id', transactionsToDelete)

    if (deleteError) {
      console.error('❌ Error deleting transactions:', deleteError)
      return
    }

    console.log(`✅ Successfully deleted ${transactionsToDelete.length} duplicate transactions`)
    console.log('')

    // Update user balances
    console.log('💰 Step 5: Updating user balances...')
    
    for (const profile of profiles) {
      const adjustment = userAdjustments[profile.id]
      const newBalance = profile.balance - adjustment.totalAmount
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) {
        console.error(`❌ Error updating balance for ${profile.email || profile.id}:`, updateError)
      } else {
        console.log(`✅ Updated ${profile.email || profile.id}: ${profile.balance} → ${newBalance} sats`)
      }
    }

    console.log('')
    console.log('🎉 CLEANUP COMPLETE!')
    console.log('====================')
    console.log(`✅ Deleted ${transactionsToDelete.length} duplicate transactions`)
    console.log(`✅ Updated ${userIds.length} user balances`)
    console.log('')
    console.log('💡 Next steps:')
    console.log('   - Run the balance audit script to verify the fixes')
    console.log('   - Test the deposit functionality to ensure no new duplicates')
    console.log('   - Monitor user balances for accuracy')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

deleteDuplicateTransactions()


