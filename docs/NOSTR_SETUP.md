# Ganamos Nostr Integration Setup Guide

## Overview

Ganamos now automatically publishes all new posts to Nostr, a decentralized social protocol. This allows Ganamos content to reach a wider audience across all Nostr clients (Primal, Damus, Amethyst, etc.).

## Features

✅ **Automatic posting** - All new Ganamos posts are published to Nostr  
✅ **Official account** - Single `@Ganamos` Nostr account for all posts  
✅ **Decentralized** - Content is distributed across multiple relays  
✅ **Bitcoin-native** - Nostr community overlaps heavily with Bitcoin users  
✅ **Censorship-resistant** - Cannot be deplatformed or taken down  

## Setup Instructions

### Step 1: Generate Nostr Keys

Run the key generation script:

```bash
node scripts/generate-nostr-keys.js
```

This will output:
- **Private Key (hex)** - Keep this SECRET
- **Public Key (npub)** - Share this with users
- Instructions for next steps

### Step 2: Add Private Key to Environment

Add the private key to your `.env.local` file:

```bash
NOSTR_PRIVATE_KEY=<your_64_character_hex_private_key>
```

⚠️ **IMPORTANT**: Never commit this to git or share it publicly!

### Step 3: Test Locally

1. Restart your dev server
2. Create a new post on Ganamos
3. Check the console logs for `[NOSTR]` messages
4. Verify the post appears on Nostr clients

### Step 4: Deploy to Production

1. Add `NOSTR_PRIVATE_KEY` to your Vercel/production environment variables
2. Deploy the changes
3. Test by creating a post on production

## How It Works

### Post Flow

```
1. User creates post on Ganamos
   ↓
2. Post is saved to Supabase database
   ↓
3. Ganamos automatically publishes to Nostr relays:
   - relay.damus.io
   - nostr.wine
   - relay.snort.social
   - nos.lol
   - relay.primal.net
   ↓
4. Post appears on all Nostr clients
```

### Post Format

Each Ganamos post on Nostr includes:
- 🏙️ Issue title and description
- 💰 Reward amount in sats
- 📍 Location information
- 🔗 Link back to Ganamos
- #️⃣ Hashtags: #Ganamos #Bitcoin #CivicTech
- 📸 Image (if available)
- 🗺️ Geolocation tags

### Example Nostr Post

```
🏙️ New issue reported in Como, Italy!

"Broken streetlight on Via Regina"

Street light is out on Via Regina, making it dangerous at night

💰 Reward: 5,000 sats
📍 Como, Italy

Fix it and earn Bitcoin on Ganamos!

https://www.ganamos.earth/post/abc123

#Ganamos #Bitcoin #CivicTech #FixYourCity
```

## Finding Your Nostr Account

### Share This With Users:

Your Ganamos Nostr account public key (npub):
```
npub1... (generated from the setup script)
```

Users can follow the Ganamos account on:
- **Primal**: https://primal.net/
- **Damus**: https://damus.io/ (iOS)
- **Amethyst**: https://amethyst.social/ (Android)
- **Snort**: https://snort.social/
- **Nostrudel**: https://nostrudel.ninja/

## Monitoring

### Check Nostr Integration Health

View server logs for `[NOSTR]` messages:
- `[NOSTR] Publishing event to relays: <event_id>`
- `[NOSTR] Published to X/5 relays`

### Verify Posts on Nostr

1. Get your npub from the key generation script
2. Visit https://primal.net/
3. Search for your npub
4. Verify posts are appearing

## Troubleshooting

### Posts Not Appearing on Nostr

**Check 1**: Environment Variable
```bash
# Verify NOSTR_PRIVATE_KEY is set
echo $NOSTR_PRIVATE_KEY
```

**Check 2**: Server Logs
```bash
# Look for NOSTR errors
grep "\\[NOSTR\\]" logs
```

**Check 3**: Relay Connectivity
- Some relays may be temporarily down
- Posts will still appear on working relays
- Minimum 1/5 relays needed for success

### "NOSTR_PRIVATE_KEY not configured" Error

- Ensure the key is in `.env.local` (local) or Vercel environment variables (production)
- Restart your dev server after adding the key
- Check for typos in the variable name

### Posts Appearing Without Images

- Ensure image URLs are publicly accessible
- Check that images are uploaded to Supabase Storage before Nostr publishing
- Verify `imageUrl` is included in the API call

## Technical Details

### Files Created

- `lib/nostr.ts` - Nostr integration library
- `app/api/nostr/publish-post/route.ts` - API endpoint for publishing
- `scripts/generate-nostr-keys.js` - Key generation script
- `docs/NOSTR_SETUP.md` - This file

### Files Modified

- `app/post/new/page.tsx` - Adds Nostr publishing after post creation
- `app/actions/post-actions.ts` - Adds Nostr publishing for anonymous posts
- `package.json` - Adds `nostr-tools` dependency

### Dependencies

- **nostr-tools**: Official Nostr JavaScript library
  - Handles key generation, signing, relay connections
  - https://github.com/nbd-wtf/nostr-tools

### Security

- Private keys are stored as environment variables
- Keys are never logged or exposed in client-side code
- Nostr publishing runs server-side only
- Failed Nostr posts don't block Ganamos post creation

## Future Enhancements

Potential future features:
- User-level Nostr integration (users can connect their own Nostr accounts)
- Sync Nostr comments back to Ganamos
- Zaps integration (Lightning tips via Nostr)
- Post fix notifications via Nostr
- Nostr-based user authentication

## Support

For issues or questions:
1. Check server logs for `[NOSTR]` error messages
2. Verify environment variables are set correctly
3. Test with the key generation script
4. Open an issue on GitHub

---

Built with ❤️ using [nostr-tools](https://github.com/nbd-wtf/nostr-tools)

