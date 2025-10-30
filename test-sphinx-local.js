/**
 * Test Sphinx credentials - Edit the values below with your actual credentials
 */

const SPHINX_API_URL = 'https://bots.v2.sphinx.chat/api/action'

// EDIT THESE VALUES WITH YOUR ACTUAL CREDENTIALS FROM VERCEL
const credentials = {
  chat_pubkey: 'PASTE_YOUR_SPHINX_CHAT_PUBKEY_HERE',
  bot_id: 'PASTE_YOUR_SPHINX_BOT_ID_HERE', 
  bot_secret: 'PASTE_YOUR_SPHINX_BOT_SECRET_HERE'
}

async function testCredentials() {
  console.log('Testing Sphinx credentials...\n')
  
  const testMessage = {
    chat_pubkey: credentials.chat_pubkey,
    bot_id: credentials.bot_id,
    bot_secret: credentials.bot_secret,
    action: 'broadcast',
    content: '🧪 Test message from Ganamos - ' + new Date().toISOString()
  }
  
  try {
    const response = await fetch(SPHINX_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    })
    
    const responseText = await response.text()
    console.log(`Status: ${response.status}`)
    console.log(`Response: ${responseText}\n`)
    
    if (response.ok) {
      console.log('✅ SUCCESS! Credentials are valid.')
    } else {
      console.log('❌ FAILED! Check the error above.')
      console.log('\nPossible issues:')
      console.log('- Wrong chat_pubkey (tribe not found)')
      console.log('- Wrong bot_id (bot not recognized)')
      console.log('- Wrong bot_secret (authentication failed)')
      console.log('- Bot not installed in tribe (needs admin to install)')
    }
  } catch (error) {
    console.error('Network error:', error.message)
  }
}

testCredentials()
