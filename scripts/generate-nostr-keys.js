#!/usr/bin/env node

/**
 * Generate Nostr key pair for Ganamos official account
 * Run this once to set up the keys
 */

const { generateSecretKey, getPublicKey } = require('nostr-tools')
const { nip19 } = require('nostr-tools')

console.log('🔑 Generating Nostr Key Pair for Ganamos\n')
console.log('='.repeat(60))

// Generate new key pair
const sk = generateSecretKey()
const pk = getPublicKey(sk)

// Convert to hex strings
const skHex = Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('')
const pkHex = Array.from(pk).map(b => b.toString(16).padStart(2, '0')).join('')

// Encode in bech32 format (npub/nsec)
const nsec = nip19.nsecEncode(sk)
const npub = nip19.npubEncode(pk)

console.log('\n📋 Ganamos Nostr Account Details:\n')
console.log('Private Key (hex):')
console.log(skHex)
console.log()
console.log('Public Key (hex):')
console.log(pkHex)
console.log()
console.log('Private Key (nsec - KEEP SECRET):')
console.log(nsec)
console.log()
console.log('Public Key (npub - Share this):')
console.log(npub)
console.log()
console.log('='.repeat(60))
console.log('\n📝 Setup Instructions:\n')
console.log('1. Add this to your .env.local file:')
console.log()
console.log(`NOSTR_PRIVATE_KEY=${skHex}`)
console.log()
console.log('2. Share this public key (npub) with users:')
console.log(`   ${npub}`)
console.log()
console.log('3. Users can follow the Ganamos account on Nostr clients like:')
console.log('   - Primal: https://primal.net/')
console.log('   - Damus: https://damus.io/')
console.log('   - Amethyst: https://amethyst.social/')
console.log()
console.log('⚠️  IMPORTANT: Keep the nsec/private key SECRET!')
console.log('   Never commit it to git or share it publicly.')
console.log()

