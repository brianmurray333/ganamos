/**
 * Sphinx integration for Ganamos
 * Posts new Ganamos issues to Sphinx tribe
 */

const SPHINX_API_URL = 'https://bots.v2.sphinx.chat/api/action'

interface SphinxConfig {
  chatPubkey: string
  botId: string
  botSecret: string
}

/**
 * Get Sphinx configuration from environment variables
 */
function getSphinxConfig(): SphinxConfig {
  const chatPubkey = process.env.SPHINX_CHAT_PUBKEY
  const botId = process.env.SPHINX_BOT_ID
  const botSecret = process.env.SPHINX_BOT_SECRET
  
  if (!chatPubkey || !botId || !botSecret) {
    throw new Error('Sphinx configuration incomplete in environment variables')
  }
  
  return { chatPubkey, botId, botSecret }
}

/**
 * Post a Ganamos issue to Sphinx tribe
 */
export async function postToSphinx(params: {
  title: string
  description: string
  location?: string
  city?: string
  latitude?: number
  longitude?: number
  reward: number
  postId: string
  imageUrl?: string
}) {
  try {
    const { title, description, location, city, reward, postId, imageUrl } = params
    
    // Get configuration
    const config = getSphinxConfig()
    
    // Format the message content
    const locationText = city || location || 'Unknown location'
    const content = `🏙️ New issue in ${locationText}!

${title}

${description}

💰 Reward: ${reward.toLocaleString()} sats
📍 ${locationText}

https://www.ganamos.earth/post/${postId}`

    console.log('[SPHINX] Publishing post to Sphinx tribe:', postId)
    
    // Make POST request to Sphinx API
    const response = await fetch(SPHINX_API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_pubkey: config.chatPubkey,
        bot_id: config.botId,
        content: content,
        bot_secret: config.botSecret,
        action: 'broadcast'
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Sphinx API error: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json()
    console.log('[SPHINX] Successfully published post to Sphinx:', postId)
    
    return {
      success: true,
      result
    }
  } catch (error) {
    console.error('[SPHINX] Error publishing to Sphinx:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
