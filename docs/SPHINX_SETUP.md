# Ganamos Sphinx Integration Setup Guide

## Overview

Ganamos automatically publishes all new posts to the Ganamos Sphinx tribe, a Bitcoin-native messaging community. This allows Ganamos content to reach the Bitcoin community on Sphinx Chat.

## Features

✅ **Automatic posting** - All new Ganamos posts are broadcast to the Sphinx tribe  
✅ **Official bot** - Ganamos bot posts to the official tribe  
✅ **Bitcoin-native** - Sphinx runs on Lightning Network  
✅ **Real-time notifications** - Tribe members get instant updates  
✅ **Direct community engagement** - Bitcoin users can discuss and collaborate  

## Setup Instructions

### Step 1: Get Bot Credentials from Sphinx Admin

Contact the Sphinx tribe administrator (@Bmur) to get:
- **Chat Public Key** - The tribe's public key
- **Bot ID** - Your unique bot identifier
- **Bot Secret** - Keep this SECRET (like a password)

### Step 2: Add Credentials to Environment

Add the credentials to your `.env.local` file (for local development):

```bash
# Sphinx Bot Configuration
SPHINX_CHAT_PUBKEY=027f3516ddb207bbcdad71ca11fa8434aca35a0d735cfc09d536590e40963ec47d
SPHINX_BOT_ID=456A787D12A074A3
SPHINX_BOT_SECRET=your_bot_secret_here
```

⚠️ **IMPORTANT**: 
- Never commit `SPHINX_BOT_SECRET` to git or share it publicly!
- This is your bot's authentication credential
- Treat it like a password or API key

### Step 3: (Optional) Disable Sphinx Integration

To temporarily disable Sphinx posting without removing credentials:

```bash
ENABLE_SPHINX=false
```

The integration will automatically disable if any credentials are missing.

### Step 4: Test Locally

1. Restart your dev server after adding environment variables
2. Create a new post on Ganamos
3. Check the console logs for `[SPHINX]` messages
4. Verify the post appears in the Sphinx tribe

Expected console output:
```
[SPHINX] Starting to publish post abc123
[SPHINX] Sending POST request to Sphinx API
[SPHINX] Successfully published post abc123
```

### Step 5: Deploy to Production

1. Add all three `SPHINX_*` environment variables to your Vercel/production environment
2. Deploy the changes
3. Test by creating a post on production
4. Verify the post appears in the Sphinx tribe

## How It Works

### Post Flow

```
1. User creates post on Ganamos
   ↓
2. Post is saved to Supabase database
   ↓
3. Ganamos automatically broadcasts to Sphinx tribe via bot API:
   - POST request to https://bots.v2.sphinx.chat/api/action
   - Includes bot credentials and formatted message
   ↓
4. Post appears in Sphinx tribe chat
   ↓
5. Tribe members receive real-time notification
```

### Post Format

Each Ganamos post on Sphinx includes:
- 🏙️ Issue title and description
- 💰 Reward amount in sats
- 📍 Location information
- 🔗 Link back to Ganamos
- #️⃣ Hashtags: #Ganamos #Bitcoin

### Example Sphinx Message

```
🏙️ New issue in Como, Italy!

Broken streetlight on Via Regina

Street light is out on Via Regina, making it dangerous at night

💰 Reward: 5,000 sats
📍 Como, Italy

https://www.ganamos.earth/post/abc123

#Ganamos #Bitcoin
```

## Integration Points

### For Public Posts (Non-Group)

Both of these files publish to Sphinx:

1. **Frontend** (`app/post/new/page.tsx`)
   - When authenticated users create public posts
   - Fires async request after post creation
   - Errors don't block post creation

2. **Server Actions** (`app/actions/post-actions.ts`)
   - When anonymous users create posts
   - All anonymous posts are public by default
   - Fires async request after database save

### Group Posts

Group posts are NOT published to Sphinx (only public posts are shared with the tribe).

## Monitoring

### Check Sphinx Integration Health

View server logs for `[SPHINX]` messages:
```bash
# Success messages
[SPHINX] Starting to publish post <id>
[SPHINX] Sending POST request to Sphinx API
[SPHINX] Successfully published post <id>

# Error messages
[SPHINX] Error publishing to Sphinx: <error>
[SPHINX] Failed to publish: <reason>
```

### Verify Posts in Sphinx

1. Open Sphinx Chat
2. Join the Ganamos tribe
3. Check for new Ganamos bot messages
4. Verify formatting and links work correctly

## Troubleshooting

### Posts Not Appearing in Sphinx

**Check 1**: Environment Variables
```bash
# Verify all three variables are set (local)
cat .env.local | grep SPHINX

# Verify in Vercel (production)
# Go to: Project Settings > Environment Variables
```

**Check 2**: Server Logs
```bash
# Look for SPHINX errors
grep "\\[SPHINX\\]" logs
```

**Check 3**: API Response
- Check if Sphinx API is returning errors
- Verify bot credentials are correct
- Confirm bot has permission to post to the tribe

### "Sphinx integration is not enabled" Message

This means one or more environment variables are missing:
- `SPHINX_CHAT_PUBKEY`
- `SPHINX_BOT_ID`
- `SPHINX_BOT_SECRET`

Or `ENABLE_SPHINX=false` is set.

**Fix**: 
1. Add all three variables to `.env.local` (local) or Vercel (production)
2. Restart your dev server
3. Check for typos in variable names

### "Sphinx API error: 401" or "403"

This means authentication failed:
- `SPHINX_BOT_SECRET` is incorrect
- Bot credentials may have been revoked
- Bot may not have permission to post

**Fix**: Contact Sphinx admin (@Bmur) to verify credentials

### "Sphinx API error: 500"

This means the Sphinx API had an internal error:
- May be temporary - try again later
- Check Sphinx service status
- Verify message format is correct

### Posts Succeeding But Not Visible

- Ensure you're in the correct Sphinx tribe
- Check if bot is muted or blocked
- Verify bot has posting permissions
- Refresh your Sphinx client

## Technical Details

### Files Created

- `lib/sphinx.ts` - Sphinx integration library
- `app/api/sphinx/publish-post/route.ts` - API endpoint for publishing
- `docs/SPHINX_SETUP.md` - This file

### Files Modified

- `app/post/new/page.tsx` - Adds Sphinx publishing after post creation
- `app/actions/post-actions.ts` - Adds Sphinx publishing for anonymous posts

### API Endpoint

**URL**: `https://bots.v2.sphinx.chat/api/action`

**Method**: `POST`

**Headers**: 
```json
{
  "Content-Type": "application/json"
}
```

**Body**:
```json
{
  "chat_pubkey": "<tribe_public_key>",
  "bot_id": "<bot_identifier>",
  "content": "<formatted_message>",
  "bot_secret": "<bot_authentication_secret>",
  "action": "broadcast"
}
```

### Security

- Bot secret is stored as environment variable
- Secret is never logged or exposed in client-side code
- Sphinx publishing runs server-side only
- Failed Sphinx posts don't block Ganamos post creation
- Fire-and-forget pattern ensures non-blocking behavior

### Error Handling

The integration is designed to be **error-tolerant**:
- ✅ Post creation succeeds even if Sphinx publishing fails
- ✅ Errors are logged but don't throw exceptions
- ✅ No retry logic (fire-and-forget)
- ✅ Integration can be disabled without code changes

## Comparison: Sphinx vs Nostr

| Feature | Sphinx | Nostr |
|---------|--------|-------|
| **Type** | Centralized tribe/group chat | Decentralized relay network |
| **Protocol** | HTTP REST API | WebSocket + cryptographic signing |
| **Authentication** | Bot credentials (API-style) | Private key signing |
| **Distribution** | Single endpoint (Sphinx tribe) | Multiple relays (5+) |
| **Audience** | Ganamos tribe members only | All Nostr users globally |
| **Complexity** | Simple HTTP POST | Multiple relay connections |
| **Dependencies** | None (native fetch) | `nostr-tools` library |
| **Real-time** | Instant tribe notifications | Eventual consistency across relays |

Both integrations run in parallel - posts go to both Sphinx and Nostr simultaneously!

## Future Enhancements

Potential future features:
- Two-way sync: Import Sphinx replies as Ganamos comments
- Lightning tips integration via Sphinx
- User-level Sphinx integration (users connect their accounts)
- Status updates when posts are fixed
- Rich media support (if Sphinx adds support)

## Support

For issues or questions:

1. **Environment Issues**: Check that all three `SPHINX_*` variables are set correctly
2. **API Errors**: Review server logs for `[SPHINX]` error messages  
3. **Credential Issues**: Contact Sphinx admin (@Bmur) to verify bot credentials
4. **Code Issues**: Open an issue on the Ganamos GitHub repository

## Resources

- **Sphinx Chat**: https://sphinx.chat/
- **Sphinx Documentation**: https://sphinx.chat/docs
- **Ganamos Sphinx Tribe**: (Get invite link from tribe admin)

---

Built with ⚡ for the Bitcoin community on Sphinx
