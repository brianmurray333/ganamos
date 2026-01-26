// Script to investigate balance discrepancies for specific users
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌ MISSING')
  console.error('   SUPABASE_SECRET_API_KEY:', process.env.SUPABASE_SECRET_API_KEY ? '✅' : '❌ MISSING')
  console.error('   SUPABASE_SECRET_API_KEY (fallback):', process.env.SUPABASE_SECRET_API_KEY ? '✅' : '❌ MISSING')
  console.error('\nPlease set these in your .env.local file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)

// Users with reported discrepancies
const usersToInvestigate = [
  { email: 'jimp79@gmail.com', reportedProfile: 1000, reportedCalculated: 0, reportedDiff: 1000 },
  { email: 'child-d60a269f-b1a9-4030-96d5-7ddc3ca5e369@ganamos.app', reportedProfile: 44497, reportedCalculated: 38497, reportedDiff: 6000 },
  { email: 'paulitoi@stakwork.com', reportedProfile: 500, reportedCalculated: -500, reportedDiff: 1000 },
  { email: 'anniecarruth@gmail.com', reportedProfile: 41634, reportedCalculated: 19634, reportedDiff: 22000 },
]

async function investigateUser(userInfo) {
  console.log('\n' + '='.repeat(100))
  console.log(`🔍 INVESTIGATING: ${userInfo.email}`)
  console.log(`   Reported: Profile=${userInfo.reportedProfile}, Calculated=${userInfo.reportedCalculated}, Diff=${userInfo.reportedDiff}`)
  console.log('='.repeat(100))

  // Find user by email (try multiple approaches)
  let { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', userInfo.email)

  if (profileError) {
    console.log(`❌ Error finding user: ${profileError.message}`)
    return
  }

  // If not found by email, try username (for child accounts)
  if (!profiles || profiles.length === 0) {
    const { data: byUsername, error: usernameError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${userInfo.email.split('@')[0]}%`)
    
    if (!usernameError && byUsername && byUsername.length > 0) {
      profiles = byUsername
      console.log(`   (Found by username pattern instead of email)`)
    }
  }

  // If still not found, search for child accounts by ID pattern
  if ((!profiles || profiles.length === 0) && userInfo.email.includes('child-')) {
    const childId = userInfo.email.replace('@ganamos.app', '').replace('child-', '')
    console.log(`   Searching for child account with ID pattern: ${childId}`)
    const { data: byId, error: idError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('id', `%${childId}%`)
    
    if (!idError && byId && byId.length > 0) {
      profiles = byId
      console.log(`   (Found by ID pattern)`)
    }
  }

  if (!profiles || profiles.length === 0) {
    // Try to search all profiles and filter manually
    console.log(`   Searching all profiles for pattern: ${userInfo.email}`)
    const { data: allProfiles, error: allError } = await supabase
      .from('profiles')
      .select('id, email, username, balance')
      .limit(500)
    
    if (!allError && allProfiles) {
      const matching = allProfiles.filter(p => 
        (p.email && p.email.toLowerCase().includes(userInfo.email.toLowerCase().split('@')[0])) ||
        (p.username && p.username.toLowerCase().includes(userInfo.email.toLowerCase().split('@')[0]))
      )
      if (matching.length > 0) {
        console.log(`   Found ${matching.length} potentially matching profiles:`)
        matching.forEach(m => console.log(`   - ${m.email || m.username} (ID: ${m.id}, Balance: ${m.balance})`))
      }
    }
    console.log(`❌ No user found with email: ${userInfo.email}`)
    return
  }

  if (profiles.length > 1) {
    console.log(`⚠️  Found ${profiles.length} users with this email - investigating all:`)
    profiles.forEach((p, i) => {
      console.log(`   ${i + 1}. ID: ${p.id}, Balance: ${p.balance}, Created: ${p.created_at}`)
    })
  }

  const profile = profiles[0]

  console.log(`\n📊 USER PROFILE:`)
  console.log(`   ID: ${profile.id}`)
  console.log(`   Email: ${profile.email}`)
  console.log(`   Username: ${profile.username}`)
  console.log(`   Balance: ${profile.balance}`)
  console.log(`   Pet Coins: ${profile.pet_coins || 0}`)
  console.log(`   Created: ${profile.created_at}`)
  console.log(`   Updated: ${profile.updated_at}`)

  // Get ALL transactions (including non-completed)
  const { data: allTransactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: true })

  if (txError) {
    console.log(`❌ Error fetching transactions: ${txError.message}`)
    return
  }

  console.log(`\n📋 ALL TRANSACTIONS (${allTransactions.length} total):`)
  console.log('-'.repeat(150))
  console.log('| Created At          | Type       | Amount     | Status    | Memo                                       | Payment Hash/ID')
  console.log('-'.repeat(150))

  let runningBalance = 0
  const completedTransactions = []
  const breakdown = {
    deposits: { count: 0, total: 0 },
    withdrawals: { count: 0, total: 0 },
    internal: { count: 0, total: 0 },
    pendingDeposits: { count: 0, total: 0 },
    pendingWithdrawals: { count: 0, total: 0 },
    failedTransactions: { count: 0, total: 0 }
  }

  allTransactions.forEach(tx => {
    const date = new Date(tx.created_at).toISOString().substring(0, 19).replace('T', ' ')
    const amount = tx.amount?.toString().padStart(10, ' ') || 'null'.padStart(10)
    const type = tx.type?.padEnd(10, ' ') || 'unknown'.padEnd(10)
    const status = tx.status?.padEnd(9, ' ') || 'unknown'.padEnd(9)
    const memo = (tx.memo || '').substring(0, 44).padEnd(44, ' ')
    const paymentHash = tx.payment_hash?.substring(0, 30) || tx.id?.substring(0, 30) || ''
    
    let balanceChange = ''
    if (tx.status === 'completed') {
      completedTransactions.push(tx)
      if (tx.type === 'deposit') {
        runningBalance += tx.amount
        balanceChange = `  +${tx.amount} → ${runningBalance}`
        breakdown.deposits.count++
        breakdown.deposits.total += tx.amount
      } else if (tx.type === 'withdrawal') {
        runningBalance -= tx.amount
        balanceChange = `  -${tx.amount} → ${runningBalance}`
        breakdown.withdrawals.count++
        breakdown.withdrawals.total += tx.amount
      } else if (tx.type === 'internal') {
        runningBalance += tx.amount // amount already has correct sign
        balanceChange = `  ${tx.amount >= 0 ? '+' : ''}${tx.amount} → ${runningBalance}`
        breakdown.internal.count++
        breakdown.internal.total += tx.amount
      }
    } else if (tx.status === 'pending') {
      if (tx.type === 'deposit') {
        breakdown.pendingDeposits.count++
        breakdown.pendingDeposits.total += tx.amount || 0
      } else if (tx.type === 'withdrawal') {
        breakdown.pendingWithdrawals.count++
        breakdown.pendingWithdrawals.total += tx.amount || 0
      }
    } else {
      breakdown.failedTransactions.count++
      breakdown.failedTransactions.total += tx.amount || 0
    }

    console.log(`| ${date} | ${type} | ${amount} | ${status} | ${memo} | ${paymentHash}${balanceChange}`)
  })

  console.log('-'.repeat(150))

  console.log(`\n📊 TRANSACTION BREAKDOWN:`)
  console.log(`   Completed Deposits:    ${breakdown.deposits.count} transactions, total +${breakdown.deposits.total} sats`)
  console.log(`   Completed Withdrawals: ${breakdown.withdrawals.count} transactions, total -${breakdown.withdrawals.total} sats`)
  console.log(`   Completed Internal:    ${breakdown.internal.count} transactions, net ${breakdown.internal.total >= 0 ? '+' : ''}${breakdown.internal.total} sats`)
  console.log(`   Pending Deposits:      ${breakdown.pendingDeposits.count} transactions, total +${breakdown.pendingDeposits.total} sats`)
  console.log(`   Pending Withdrawals:   ${breakdown.pendingWithdrawals.count} transactions, total -${breakdown.pendingWithdrawals.total} sats`)
  console.log(`   Failed/Other:          ${breakdown.failedTransactions.count} transactions`)

  const calculatedBalance = breakdown.deposits.total - breakdown.withdrawals.total + breakdown.internal.total
  const difference = profile.balance - calculatedBalance

  console.log(`\n🧮 BALANCE ANALYSIS:`)
  console.log(`   Deposits:       +${breakdown.deposits.total}`)
  console.log(`   Withdrawals:    -${breakdown.withdrawals.total}`)
  console.log(`   Internal (net): ${breakdown.internal.total >= 0 ? '+' : ''}${breakdown.internal.total}`)
  console.log(`   ────────────────────────────`)
  console.log(`   Calculated:     ${calculatedBalance}`)
  console.log(`   Profile shows:  ${profile.balance}`)
  console.log(`   DIFFERENCE:     ${difference} sats`)

  // Check for suspicious patterns
  console.log(`\n🔍 ANOMALY CHECK:`)

  // Check for duplicate transactions (same amount, type, timestamp within 1 second)
  const potentialDuplicates = []
  for (let i = 0; i < allTransactions.length; i++) {
    for (let j = i + 1; j < allTransactions.length; j++) {
      const tx1 = allTransactions[i]
      const tx2 = allTransactions[j]
      const timeDiff = Math.abs(new Date(tx1.created_at) - new Date(tx2.created_at))
      if (tx1.amount === tx2.amount && tx1.type === tx2.type && timeDiff < 60000) {
        potentialDuplicates.push({ tx1, tx2, timeDiff })
      }
    }
  }
  if (potentialDuplicates.length > 0) {
    console.log(`   ⚠️  Found ${potentialDuplicates.length} potential duplicate pairs:`)
    potentialDuplicates.forEach(dup => {
      console.log(`      - ${dup.tx1.type} ${dup.tx1.amount} at ${dup.tx1.created_at} vs ${dup.tx2.created_at} (${dup.timeDiff}ms apart)`)
    })
  } else {
    console.log(`   ✅ No duplicate transactions detected`)
  }

  // Check for deposits/internal that might be missing (balance higher than calculated)
  if (difference > 0) {
    console.log(`   ⚠️  Profile balance is HIGHER than calculated by ${difference} sats`)
    console.log(`       Possible causes:`)
    console.log(`       - Manual balance adjustment without transaction`)
    console.log(`       - Bug where balance was added but transaction wasn't recorded`)
    console.log(`       - Transaction marked as completed but then deleted`)
  } else if (difference < 0) {
    console.log(`   ⚠️  Profile balance is LOWER than calculated by ${Math.abs(difference)} sats`)
    console.log(`       Possible causes:`)
    console.log(`       - Withdrawal/transfer not properly recorded`)
    console.log(`       - Transaction exists but balance wasn't updated`)
  }

  // Check for connected accounts (this might explain some discrepancies)
  const { data: connectedAccounts, error: connError } = await supabase
    .from('connected_accounts')
    .select('*')
    .or(`owner_id.eq.${profile.id},connected_id.eq.${profile.id}`)

  if (!connError && connectedAccounts && connectedAccounts.length > 0) {
    console.log(`\n🔗 CONNECTED ACCOUNTS:`)
    connectedAccounts.forEach(conn => {
      const isOwner = conn.owner_id === profile.id
      console.log(`   - ${isOwner ? 'OWNS' : 'CONNECTED TO'}: ${isOwner ? conn.connected_id : conn.owner_id}`)
      console.log(`     Relationship: ${conn.relationship}`)
    })
  }

  // Check for activities that might have rewarded coins
  const { data: activities, error: actError } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', profile.id)
    .eq('coins_awarded', true)
    .order('created_at', { ascending: true })

  if (!actError && activities && activities.length > 0) {
    console.log(`\n🏆 ACTIVITIES WITH COINS AWARDED:`)
    let totalActivityCoins = 0
    activities.forEach(act => {
      console.log(`   - ${act.activity_type}: ${act.reward || 0} coins at ${act.created_at}`)
      totalActivityCoins += act.reward || 0
    })
    console.log(`   Total from activities: ${totalActivityCoins} coins`)
    
    // Check if these match corresponding transactions
    const internalTxForActivities = completedTransactions.filter(tx => 
      tx.type === 'internal' && tx.memo && (tx.memo.includes('activity') || tx.memo.includes('reward') || tx.memo.includes('walk') || tx.memo.includes('daily'))
    )
    console.log(`   Matching internal transactions found: ${internalTxForActivities.length}`)
  }

  return {
    email: userInfo.email,
    profileBalance: profile.balance,
    calculatedBalance,
    difference,
    transactionCount: allTransactions.length,
    completedCount: completedTransactions.length
  }
}

async function main() {
  console.log('🔍 BALANCE DISCREPANCY INVESTIGATION')
  console.log('Date: ' + new Date().toISOString())
  console.log('')

  const results = []
  
  for (const user of usersToInvestigate) {
    const result = await investigateUser(user)
    if (result) {
      results.push(result)
    }
  }

  console.log('\n\n' + '='.repeat(100))
  console.log('📊 SUMMARY OF ALL DISCREPANCIES')
  console.log('='.repeat(100))
  
  results.forEach(r => {
    console.log(`${r.email}:`)
    console.log(`   Profile: ${r.profileBalance}, Calculated: ${r.calculatedBalance}, Difference: ${r.difference}`)
    console.log('')
  })
}

main().catch(console.error)

