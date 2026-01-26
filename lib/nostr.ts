import { SimplePool, Event, getPublicKey, finalizeEvent, generateSecretKey } from 'nostr-tools'
import { serverEnv } from './env'
import { mockNostrStore } from './mock-nostr-store'

/**
 * Nostr integration for Ganamos
 * Posts new Ganamos issues to Nostr relays
 * 
 * When USE_MOCKS=true, routes all publishing through in-memory mock relay
 * to enable local development without external WebSocket connections.
 */

// Popular Nostr relays
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nostr.wine',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://relay.primal.net',
]

let pool: SimplePool | null = null

function getPool() {
  if (!pool) {
    pool = new SimplePool()
  }
  return pool
}

/**
 * Get Ganamos Nostr private key from environment
 * If not set, this will need to be generated once and stored
 * 
 * In mock mode (USE_MOCKS=true), uses a test private key
 */
function getGanamosNostrKey(): Uint8Array {
  // Use mock key in mock mode, real key otherwise
  const nostrPrivateKeyHex = serverEnv.integrations.nostr.useMock
    ? serverEnv.integrations.nostr.mockPrivateKey
    : serverEnv.integrations.nostr.privateKey
  
  if (!nostrPrivateKeyHex) {
    throw new Error('NOSTR_PRIVATE_KEY not configured in environment variables')
  }
  
  // Convert hex string to Uint8Array
  const hexArray = nostrPrivateKeyHex.match(/.{1,2}/g)
  if (!hexArray || hexArray.length !== 32) {
    throw new Error('NOSTR_PRIVATE_KEY must be a 64-character hex string (32 bytes)')
  }
  
  return new Uint8Array(hexArray.map(byte => parseInt(byte, 16)))
}

/**
 * Generate a new Nostr key pair (run this once to set up the Ganamos account)
 */
export function generateNostrKeyPair() {
  const sk = generateSecretKey()
  const pk = getPublicKey(sk)
  
  // Convert to hex strings for storage
  const skHex = Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('')
  const pkHex = Array.from(pk).map(b => b.toString(16).padStart(2, '0')).join('')
  
  return {
    privateKey: skHex,
    publicKey: pkHex,
    // npub format (for sharing with users)
    npub: `Add NOSTR_PRIVATE_KEY=${skHex} to .env.local`,
  }
}

/**
 * Set up the Ganamos Nostr profile (name and avatar)
 * This should be called once to establish the profile
 */
export async function setupGanamosProfile() {
  try {
    const sk = getGanamosNostrKey()
    const pk = getPublicKey(sk)
    
    // Create profile metadata
    const profileData = {
      name: 'Ganamos!',
      about: 'Fix your city, earn Bitcoin. Report and fix local issues to earn sats on Ganamos.',
      picture: 'https://www.ganamos.earth/images/ganamos-logo.png', // Update with actual logo URL
      website: 'https://www.ganamos.earth',
      lud16: 'ganamos@ganamos.earth', // Lightning address if available
    }
    
    const content = JSON.stringify(profileData)
    
    // Create the profile event (kind 0)
    const eventTemplate = {
      kind: 0, // Profile metadata
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content,
    }
    
    // Sign the event
    const signedEvent = finalizeEvent(eventTemplate, sk)
    
    // Route to mock or real relays based on mode
    if (serverEnv.integrations.nostr.useMock) {
      console.log('[MOCK NOSTR] Publishing profile to mock relay:', signedEvent.id)
      return await mockNostrStore.publish(signedEvent)
    } else {
      console.log('[NOSTR] Publishing profile to relays:', signedEvent.id)
      
      // Publish to relays
      const publishPool = getPool()
      const publishPromises = publishPool.publish(RELAYS, signedEvent)
      
      // Wait for at least one relay to confirm
      const results = await Promise.allSettled(publishPromises)
      
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      
      console.log(`[NOSTR] Profile published to ${successful}/${RELAYS.length} relays (${failed} failed)`)
      
      return {
        success: successful > 0,
        eventId: signedEvent.id,
        relaysPublished: successful,
        relaysFailed: failed,
      }
    }
  } catch (error) {
    console.error('[NOSTR] Error publishing profile:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Post a Ganamos issue to Nostr
 */
export async function postToNostr(params: {
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
    const { title, description, location, city, latitude, longitude, reward, postId, imageUrl } = params
    
    // Get Ganamos Nostr key
    const sk = getGanamosNostrKey()
    const pk = getPublicKey(sk)
    
    // Format the post content
    const locationText = city || location || 'Unknown location'
    const content = `🏙️ New issue posted in ${locationText}!

${title}

${description}
💰 Reward: ${reward.toLocaleString()} sats
📍 ${locationText}

Fix it and earn Bitcoin on Ganamos!

https://www.ganamos.earth/post/${postId}

#Ganamos #Bitcoin`

    // Build tags
    const tags: string[][] = [
      ['t', 'ganamos'],
      ['t', 'bitcoin'],
      ['r', `https://www.ganamos.earth/post/${postId}`], // reference URL
    ]
    
    // Add geolocation if available
    if (latitude && longitude) {
      tags.push(['g', `${latitude.toFixed(6)},${longitude.toFixed(6)}`])
    }
    
    // Add image if available
    if (imageUrl) {
      tags.push(['imeta', `url ${imageUrl}`])
    }
    
    // Add city tag
    if (city) {
      tags.push(['t', city.toLowerCase().replace(/\s+/g, '')])
    }
    
    // Create the Nostr event
    const eventTemplate = {
      kind: 1, // Short text note
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    }
    
    // Sign the event
    const signedEvent = finalizeEvent(eventTemplate, sk)
    
    // Route to mock or real relays based on mode
    if (serverEnv.integrations.nostr.useMock) {
      console.log('[MOCK NOSTR] Publishing event to mock relay:', signedEvent.id)
      return await mockNostrStore.publish(signedEvent)
    } else {
      console.log('[NOSTR] Publishing event to relays:', signedEvent.id)
      
      // Publish to relays
      const publishPool = getPool()
      const publishPromises = publishPool.publish(RELAYS, signedEvent)
      
      // Wait for at least one relay to confirm
      const results = await Promise.allSettled(publishPromises)
      
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      
      console.log(`[NOSTR] Published to ${successful}/${RELAYS.length} relays (${failed} failed)`)
      
      return {
        success: successful > 0,
        eventId: signedEvent.id,
        relaysPublished: successful,
        relaysFailed: failed,
      }
    }
  } catch (error) {
    console.error('[NOSTR] Error publishing to Nostr:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Close the connection pool (call this on app shutdown)
 * In mock mode, this is a no-op since no real connections exist
 */
export function closeNostrPool() {
  if (serverEnv.integrations.nostr.useMock) {
    console.log('[MOCK NOSTR] Pool close (no-op in mock mode)')
    return
  }
  
  if (pool) {
    pool.close(RELAYS)
    pool = null
  }
}

