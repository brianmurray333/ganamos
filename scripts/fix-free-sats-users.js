// Script to fix users who have 5k sats but no corresponding transactions
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

async function calculateUserBalanceFromTransactions(userId) {
  // Get all transactions for this user
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (error) {
    console.error(`Error fetching transactions for user ${userId}:`, error.message)
    return { success: false, error: error.message }
  }

  let calculatedBalance = 0
  const breakdown = {
    deposits: 0,
    withdrawals: 0,
    internal: 0
  }

  transactions.forEach(tx => {
    if (tx.type === 'deposit') {
      calculatedBalance += tx.amount
      breakdown.deposits += tx.amount
    } else if (tx.type === 'withdrawal') {
      calculatedBalance -= tx.amount
      breakdown.withdrawals += tx.amount
    } else if (tx.type === 'internal') {
      calculatedBalance += tx.amount
      breakdown.internal += tx.amount
    }
  })

  return {
    success: true,
    calculatedBalance,
    breakdown,
    transactionCount: transactions.length
  }
}

async function fixFreeSatsUsers() {
  console.log('🔍 FIXING USERS WITH FREE 5K SATS')
  console.log('='.repeat(60))
  console.log('')

  try {
    // Get all users
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, balance, created_at')
      .order('created_at', { ascending: false })

    if (profilesError) {
      console.error('❌ Error fetching profiles:', profilesError.message)
      return
    }

    const usersToFix = []
    const freeSatsAmount = 5000

    console.log(`📊 Checking ${profiles.length} users for free 5k sats...`)
    console.log('')

    for (const profile of profiles) {
      // Calculate balance from transactions
      const transactionResult = await calculateUserBalanceFromTransactions(profile.id)
      
      if (!transactionResult.success) {
        console.log(`❌ Error calculating balance for ${profile.email || profile.id}: ${transactionResult.error}`)
        continue
      }

      const { calculatedBalance, transactionCount } = transactionResult
      const profileBalance = profile.balance || 0

      // Check if user has 5k sats but no transactions
      if (profileBalance === freeSatsAmount && calculatedBalance === 0 && transactionCount === 0) {
        usersToFix.push({
          id: profile.id,
          email: profile.email,
          currentBalance: profileBalance,
          calculatedBalance,
          transactionCount
        })
        console.log(`🎯 Found user with free 5k sats: ${profile.email || profile.id}`)
        console.log(`   Current Balance: ${profileBalance}`)
        console.log(`   Calculated Balance: ${calculatedBalance}`)
        console.log(`   Transactions: ${transactionCount}`)
        console.log('')
      }
    }

    if (usersToFix.length === 0) {
      console.log('✅ No users found with free 5k sats!')
      return
    }

    console.log(`🚨 Found ${usersToFix.length} users with free 5k sats:`)
    usersToFix.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email || user.id} - ${user.currentBalance} sats`)
    })
    console.log('')

    // Ask for confirmation
    console.log('⚠️  WARNING: This will set these users\' balances to 0!')
    console.log('   This action cannot be undone.')
    console.log('')
    console.log('To proceed, uncomment the update section in the script.')
    console.log('')

    // Uncomment the following section to actually perform the updates
    console.log('🔄 Updating user balances...')
    
    for (const user of usersToFix) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          balance: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (updateError) {
        console.log(`❌ Error updating ${user.email || user.id}: ${updateError.message}`)
      } else {
        console.log(`✅ Updated ${user.email || user.id}: ${user.currentBalance} → 0 sats`)
      }
    }

    console.log('')
    console.log('✅ Balance updates completed!')

  } catch (error) {
    console.error('❌ Error during fix:', error.message)
  }
}

fixFreeSatsUsers().catch(console.error)
