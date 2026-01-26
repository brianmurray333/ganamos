const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testBalanceAudit() {
  console.log('🧪 Testing balance audit for daily email...')
  console.log('')

  try {
    // Get all active profiles (exclude deleted accounts)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, balance')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })

    if (profilesError) {
      console.error('❌ Error fetching profiles:', profilesError)
      return
    }

    const discrepancies = []
    let totalDiscrepancy = 0

    console.log(`📊 Auditing ${profiles?.length || 0} users...`)

    for (const profile of profiles || []) {
      // Calculate balance from transactions
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('user_id', profile.id)
        .eq('status', 'completed')

      if (txError) {
        console.error(`❌ Error fetching transactions for ${profile.email}:`, txError)
        continue
      }

      // Calculate balance from transactions
      const calculatedBalance = transactions?.reduce((sum, tx) => {
        if (tx.type === 'deposit' || tx.type === 'internal') {
          return sum + tx.amount
        } else if (tx.type === 'withdrawal') {
          return sum - tx.amount
        }
        return sum
      }, 0) || 0

      const difference = profile.balance - calculatedBalance

      if (difference !== 0) {
        discrepancies.push({
          email: profile.email,
          profileBalance: profile.balance,
          calculatedBalance: calculatedBalance,
          difference: difference
        })
        totalDiscrepancy += Math.abs(difference)
      }
    }

    const status = discrepancies.length === 0 ? 'passed' : 'failed'
    
    console.log('')
    console.log('📊 BALANCE AUDIT RESULTS:')
    console.log('========================')
    console.log(`Status: ${status}`)
    console.log(`Total Users: ${profiles?.length || 0}`)
    console.log(`Users with Discrepancies: ${discrepancies.length}`)
    console.log(`Total Discrepancy: ${totalDiscrepancy.toLocaleString()} sats`)
    console.log('')

    if (status === 'passed') {
      console.log('✅ Balance audit check confirmed')
    } else {
      console.log('⚠️  Balance discrepancies detected!')
      console.log('')
      console.log('Discrepancies:')
      discrepancies.forEach(d => {
        console.log(`   ${d.email}: Profile ${d.profileBalance.toLocaleString()} vs Calculated ${d.calculatedBalance.toLocaleString()} (diff: ${d.difference.toLocaleString()})`)
      })
    }

    console.log('')
    console.log('📧 EMAIL PREVIEW:')
    console.log('================')
    if (status === 'passed') {
      console.log('✅ Balance audit check confirmed')
    } else {
      console.log('⚠️ Balance discrepancies detected!')
      console.log(`Total Users: ${profiles?.length || 0}`)
      console.log(`Users with Discrepancies: ${discrepancies.length}`)
      console.log(`Total Discrepancy: ${totalDiscrepancy.toLocaleString()} sats`)
      console.log('')
      console.log('Discrepancies:')
      discrepancies.forEach(d => {
        console.log(`   ${d.email}: Profile ${d.profileBalance.toLocaleString()} sats, Calculated ${d.calculatedBalance.toLocaleString()} sats, Difference ${d.difference.toLocaleString()} sats`)
      })
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

testBalanceAudit()
