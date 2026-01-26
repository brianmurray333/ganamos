// Comprehensive balance audit script for all users
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

async function auditAllBalances() {
  console.log('🔍 COMPREHENSIVE BALANCE AUDIT')
  console.log('='.repeat(80))
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

    console.log(`📊 Found ${profiles.length} users to audit`)
    console.log('')

    const discrepancies = []
    const summary = {
      totalUsers: profiles.length,
      usersWithDiscrepancies: 0,
      totalDiscrepancyAmount: 0,
      largestDiscrepancy: { user: null, amount: 0 }
    }

    for (const profile of profiles) {
      console.log(`🔍 Auditing: ${profile.email || 'No email'} (${profile.id})`)
      
      // Calculate balance from transactions
      const transactionResult = await calculateUserBalanceFromTransactions(profile.id)
      
      if (!transactionResult.success) {
        console.log(`  ❌ Error calculating balance: ${transactionResult.error}`)
        continue
      }

      const { calculatedBalance, breakdown, transactionCount } = transactionResult
      const profileBalance = profile.balance || 0
      const difference = profileBalance - calculatedBalance

      console.log(`  📊 Profile Balance: ${profileBalance.toLocaleString()}`)
      console.log(`  🧮 Calculated Balance: ${calculatedBalance.toLocaleString()}`)
      console.log(`  📈 Difference: ${difference.toLocaleString()}`)
      console.log(`  📋 Transactions: ${transactionCount} (Deposits: +${breakdown.deposits}, Withdrawals: -${breakdown.withdrawals}, Internal: +${breakdown.internal})`)

      if (Math.abs(difference) > 0) {
        console.log(`  ⚠️  DISCREPANCY DETECTED!`)
        discrepancies.push({
          user: profile,
          profileBalance,
          calculatedBalance,
          difference,
          transactionCount
        })
        
        summary.usersWithDiscrepancies++
        summary.totalDiscrepancyAmount += Math.abs(difference)
        
        if (Math.abs(difference) > Math.abs(summary.largestDiscrepancy.amount)) {
          summary.largestDiscrepancy = {
            user: profile.email || profile.id,
            amount: difference
          }
        }
      } else {
        console.log(`  ✅ Balance is consistent!`)
      }
      
      console.log('')
    }

    // Summary report
    console.log('📊 AUDIT SUMMARY')
    console.log('='.repeat(80))
    console.log(`Total Users: ${summary.totalUsers}`)
    console.log(`Users with Discrepancies: ${summary.usersWithDiscrepancies}`)
    console.log(`Total Discrepancy Amount: ${summary.totalDiscrepancyAmount.toLocaleString()} sats`)
    console.log(`Largest Discrepancy: ${summary.largestDiscrepancy.amount.toLocaleString()} sats (${summary.largestDiscrepancy.user})`)
    console.log('')

    if (discrepancies.length > 0) {
      console.log('🚨 USERS WITH DISCREPANCIES:')
      console.log('-' .repeat(80))
      
      // Sort by discrepancy amount (largest first)
      discrepancies.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      
      discrepancies.forEach((discrepancy, index) => {
        const { user, profileBalance, calculatedBalance, difference } = discrepancy
        console.log(`${index + 1}. ${user.email || user.id}`)
        console.log(`   Profile: ${profileBalance.toLocaleString()}`)
        console.log(`   Calculated: ${calculatedBalance.toLocaleString()}`)
        console.log(`   Difference: ${difference.toLocaleString()}`)
        console.log('')
      })

      console.log('💡 RECOMMENDED ACTIONS:')
      console.log('1. Fix the string concatenation bug in balance calculations')
      console.log('2. Update corrupted balances in the database')
      console.log('3. Implement balance verification system')
      console.log('4. Add audit logging for all balance changes')
    } else {
      console.log('✅ All balances are consistent!')
    }

  } catch (error) {
    console.error('❌ Error during audit:', error.message)
  }
}

auditAllBalances().catch(console.error)


