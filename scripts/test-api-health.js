const { getDailySummaryData, generateEmailHTML } = require('../lib/daily-summary.ts')

async function testAPIHealth() {
  console.log('🧪 Testing API health checks...')
  console.log('')

  try {
    console.log('📊 Generating daily summary data with API health checks...')
    const data = await getDailySummaryData()
    
    console.log('📧 API Health Results:')
    console.log('====================')
    console.log('')
    
    console.log('⚡ Voltage Lightning Node:')
    console.log(`   Status: ${data.apiHealth.voltage.status}`)
    console.log(`   Node Balance: ${data.apiHealth.voltage.nodeBalance.toLocaleString()} sats`)
    console.log(`   Discrepancy: ${data.apiHealth.voltage.discrepancy.toLocaleString()} sats`)
    if (data.apiHealth.voltage.error) {
      console.log(`   Error: ${data.apiHealth.voltage.error}`)
    }
    console.log('')
    
    console.log('🤖 Groq AI API:')
    console.log(`   Status: ${data.apiHealth.groq.status}`)
    if (data.apiHealth.groq.error) {
      console.log(`   Error: ${data.apiHealth.groq.error}`)
    }
    console.log('')

    console.log('📧 EMAIL PREVIEW:')
    console.log('================')
    const emailHTML = generateEmailHTML(data)
    console.log(emailHTML)

  } catch (error) {
    console.error('❌ Error testing API health:', error)
  }
}

testAPIHealth()
