/**
 * Verify Sphinx credentials match the instructions
 */

const EXPECTED = {
  url: 'https://bots.v2.sphinx.chat/api/action',
  chat_pubkey: '027f3516ddb207bbcdad71ca11fa8434aca35a0d735cfc09d536590e40963ec47d',
  bot_id: '456A787D12A074A3',
  bot_secret: '282A7975A262045CA5690D8CE6B3034F',
  action: 'broadcast'
}

async function testExactCredentials() {
  console.log('🧪 Testing with EXACT credentials from Sphinx team...\n')
  
  const payload = {
    chat_pubkey: EXPECTED.chat_pubkey,
    bot_id: EXPECTED.bot_id,
    content: '🧪 Test from Ganamos - ' + new Date().toISOString(),
    bot_secret: EXPECTED.bot_secret,
    action: EXPECTED.action
  }
  
  console.log('📤 Sending to:', EXPECTED.url)
  console.log('📦 Payload (without secret):')
  console.log({
    chat_pubkey: payload.chat_pubkey,
    bot_id: payload.bot_id,
    content: payload.content,
    bot_secret: '***hidden***',
    action: payload.action
  })
  console.log()
  
  try {
    const response = await fetch(EXPECTED.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    console.log(`📊 Status: ${response.status} ${response.statusText}`)
    
    const responseText = await response.text()
    console.log(`📄 Response:`)
    console.log(responseText)
    console.log()

    if (response.ok) {
      console.log('✅ SUCCESS! The credentials work.')
      console.log('📝 Next step: Verify these EXACT values are in your Vercel environment:')
      console.log('   SPHINX_CHAT_PUBKEY=' + EXPECTED.chat_pubkey)
      console.log('   SPHINX_BOT_ID=' + EXPECTED.bot_id)
      console.log('   SPHINX_BOT_SECRET=' + EXPECTED.bot_secret)
    } else {
      console.log('❌ FAILED with the exact credentials from Sphinx team!')
      console.log('🔍 This means:')
      console.log('   1. The bot is NOT installed in the tribe, OR')
      console.log('   2. The credentials provided are incorrect/outdated')
      console.log('   3. You need to contact the Sphinx admin (@Bmur) to:')
      console.log('      - Install the bot in the tribe')
      console.log('      - Verify these credentials are correct')
    }
  } catch (error) {
    console.error('❌ Network error:', error.message)
  }
}

testExactCredentials()
