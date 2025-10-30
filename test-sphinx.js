/**
 * Test script for Sphinx integration
 * This tests the Sphinx bot API directly
 */

const SPHINX_API_URL = 'https://bots.v2.sphinx.chat/api/action'

const testData = {
  chat_pubkey: '027f3516ddb207bbcdad71ca11fa8434aca35a0d735cfc09d536590e40963ec47d',
  bot_id: '456A787D12A074A3',
  bot_secret: '282A7975A262045CA5690D8CE6B3034F',
  action: 'broadcast',
  content: `🏙️ New issue in Test City!

TEST POST

This is a test message from the Ganamos Sphinx integration. If you see this, the integration is working!

💰 Reward: 1,000 sats
📍 Test City

https://www.ganamos.earth/post/test-${Date.now()}

https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800`
}

async function testSphinxIntegration() {
  console.log('🧪 Testing Sphinx Integration...\n')
  console.log('📤 Sending test message to Sphinx tribe...')
  
  try {
    const response = await fetch(SPHINX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    })

    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`)

    const responseText = await response.text()
    console.log(`\n📦 Response Body:`)
    console.log(responseText)

    if (!response.ok) {
      console.error('\n❌ Test FAILED - API returned error status')
      console.error(`Status: ${response.status}`)
      console.error(`Body: ${responseText}`)
      process.exit(1)
    }

    // Try to parse as JSON
    let result
    try {
      result = JSON.parse(responseText)
      console.log('\n📋 Parsed JSON Response:')
      console.log(JSON.stringify(result, null, 2))
    } catch (e) {
      console.log('\n⚠️  Response is not JSON (may be plain text success message)')
    }

    // Check for error indicators
    if (result && (result.success === false || result.error)) {
      console.error('\n❌ Test FAILED - API returned error in response body')
      console.error(`Error: ${result.error || 'Unknown error'}`)
      process.exit(1)
    }

    console.log('\n✅ Test PASSED - Message sent successfully!')
    console.log('\n🔍 Next steps:')
    console.log('   1. Check the Ganamos Sphinx tribe for the test message')
    console.log('   2. Verify the message formatting looks correct')
    console.log('   3. If you see the message, the integration is working!')
    
  } catch (error) {
    console.error('\n❌ Test FAILED - Network or fetch error')
    console.error('Error:', error.message)
    console.error('\nFull error:', error)
    process.exit(1)
  }
}

// Run the test
testSphinxIntegration()
