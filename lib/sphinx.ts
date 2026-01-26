/**
 * Sphinx integration for Ganamos
 * Posts new Ganamos issues to Sphinx tribe via bot API
 */

import { serverEnv } from './env'

/**
 * Get Sphinx API URL from environment configuration
 * This allows for automatic switching between real and mock APIs
 */
function getSphinxApiUrl(): string {
  if (!serverEnv) {
    throw new Error('[SPHINX] Cannot access server environment')
  }
  return serverEnv.integrations.sphinx.apiUrl
}

interface SphinxConfig {
  chatPubkey: string
  botId: string
  botSecret: string
}

/**
 * Check if Sphinx integration is enabled
 */
export function isSphinxEnabled(): boolean {
  if (!serverEnv) {
    return false
  }
  
  // Check if feature flag is enabled
  if (!serverEnv.features.enableSphinx) {
    return false
  }
  
  // Check if configuration is complete
  return serverEnv.integrations.sphinx.isConfigured
}

/**
 * Get Sphinx configuration from environment variables
 */
function getSphinxConfig(): SphinxConfig {
  if (!serverEnv) {
    throw new Error('[SPHINX] Cannot access server environment')
  }
  
  const { chatPubkey, botId, botSecret } = serverEnv.integrations.sphinx

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
    const response = await fetch(getSphinxApiUrl(), {
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
