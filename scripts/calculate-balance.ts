import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables:')
  console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  console.error('  - SUPABASE_SECRET_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function calculateUserBalance() {
  try {
    const userId = 'dce58449-faa0-413e-8b7a-6e607d280beb'
    
    console.log('🔍 Calculating balance for user:', userId)
    console.log('')

    // Get current profile balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      return
    }

    console.log('📊 Current Profile Balance:', profile.balance)
    console.log('')

    // Get all transactions
    const { data: transactions, error: txError} = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (txError) {
      console.error('Error fetching transactions:', txError)
      return
    }

    console.log('📋 All Transactions:')
    console.log('ID | Type | Amount | Status | Created At | Memo')
    console.log('---|------|--------|--------|------------|-----')
    
    transactions.forEach(tx => {
      const date = new Date(tx.created_at).toLocaleDateString()
      console.log(`${tx.id.substring(0, 8)}... | ${tx.type} | ${tx.amount} | ${tx.status} | ${date} | ${tx.memo || 'N/A'}`)
    })

    console.log('')

    // Calculate balance from transactions
    let calculatedBalance = 0
    const breakdown = {
      deposits: 0,
      withdrawals: 0,
      internal: 0
    }

    transactions.forEach(tx => {
      if (tx.status === 'completed') {
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
      }
    })

    console.log('🧮 Balance Calculation:')
    console.log(`  Deposits: +${breakdown.deposits}`)
    console.log(`  Withdrawals: -${breakdown.withdrawals}`)
    console.log(`  Internal: +${breakdown.internal}`)
    console.log(`  Calculated Balance: ${calculatedBalance}`)
    console.log('')

    console.log('📈 Summary:')
    console.log(`  Profile Balance: ${profile.balance}`)
    console.log(`  Calculated Balance: ${calculatedBalance}`)
    console.log(`  Difference: ${profile.balance - calculatedBalance}`)
    
    if (profile.balance !== calculatedBalance) {
      console.log('⚠️  WARNING: Balance mismatch detected!')
      console.log(`   The profile balance (${profile.balance}) does not match the calculated balance (${calculatedBalance})`)
    } else {
      console.log('✅ Balance is consistent!')
    }
  } catch (error) {
    console.error('Unexpected error in calculateUserBalance:', error)
  }
}


