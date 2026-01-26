const { getDailySummaryData, generateEmailHTML } = require('../lib/daily-summary.ts')

async function testDailySummary() {
  console.log('🧪 Testing daily summary with balance audit...')
  console.log('')

  try {
    console.log('📊 Generating daily summary data...')
    const data = await getDailySummaryData()
    
    console.log('📧 Balance Audit Results:')
    console.log(`   Status: ${data.balanceAudit.status}`)
    console.log(`   Total Users: ${data.balanceAudit.totalUsers}`)
    console.log(`   Users with Discrepancies: ${data.balanceAudit.usersWithDiscrepancies}`)
    console.log(`   Total Discrepancy: ${data.balanceAudit.totalDiscrepancy} sats`)
    
    if (data.balanceAudit.discrepancies.length > 0) {
      console.log('')
      console.log('🚨 Discrepancies found:')
      data.balanceAudit.discrepancies.forEach(d => {
        console.log(`   ${d.email}: Profile ${d.profileBalance} vs Calculated ${d.calculatedBalance} (diff: ${d.difference})`)
      })
    } else {
      console.log('')
      console.log('✅ Balance audit check confirmed')
    }

    console.log('')
    console.log('📧 Email Preview:')
    console.log('================')
    const emailHTML = generateEmailHTML(data)
    console.log(emailHTML)

  } catch (error) {
    console.error('❌ Error testing daily summary:', error)
  }
}

testDailySummary()
