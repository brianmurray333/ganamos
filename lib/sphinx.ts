/**
 * Sphinx integration for Ganamos
 * Posts new Ganamos issues to Sphinx tribe via bot API
 */

const SPHINX_API_URL = 'https://bots.v2.sphinx.chat/api/action'

interface SphinxConfig {
  chatPubkey: string
  botId: string
  botSecret: string
}

/**
 * Check if Sphinx integration is enabled
 */
export function isSphinxEnabled(): boolean {
  return !!(
    process.env.SPHINX_CHAT_PUBKEY &&
    process.env.SPHINX_BOT_ID &&
    process.env.SPHINX_BOT_SECRET &&
    process.env.ENABLE_SPHINX !== 'false'
  )
}

/**
 * Get Sphinx configuration from environment variables
 */
function getSphinxConfig(): SphinxConfig {
  const chatPubkey = process.env.SPHINX_CHAT_PUBKEY
  const botId = process.env.SPHINX_BOT_ID
  const botSecret = process.env.SPHINX_BOT_SECRET

  if (!chatPubkey || !botId || !botSecret) {
    throw new Error('[SPHINX] Configuration incomplete in environment variables')
  }

  return { chatPubkey, botId, botSecret }
}

interface PostToSphinxParams {
  title: string
  description: string
  location?: string
  city?: string
  reward: number
  postId: string
  imageUrl?: string
}

/**
 * Post a new Ganamos issue to Sphinx tribe
 */
export async function postToSphinx(params: PostToSphinxParams) {
  try {
    console.log('[SPHINX] Starting to publish post', params.postId)

    if (!isSphinxEnabled()) {
      console.log('[SPHINX] Sphinx integration is disabled')
      return {
        success: false,
        error: 'Sphinx integration is not enabled'
      }
    }

    const { title, description, location, city, reward, postId, imageUrl } = params
    const config = getSphinxConfig()

    // Format message similar to NOSTR format
    const locationText = city || location || 'Unknown location'
    const content = `🏙️ New issue in ${locationText}!

${title}

${description}

💰 Reward: ${reward.toLocaleString()} sats
📍 ${locationText}

https://www.ganamos.earth/post/${postId}`

    // Note: Image URL removed as Sphinx doesn't render it properly

    console.log('[SPHINX] Sending POST request to Sphinx API')

    // Make POST request to Sphinx bot API
    const response = await fetch(SPHINX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    // Check if response indicates an error
    if (result.success === false || result.error) {
      throw new Error(`Sphinx returned error: ${result.error || 'Unknown error'}`)
    }

    console.log('[SPHINX] Successfully published post', postId)

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
