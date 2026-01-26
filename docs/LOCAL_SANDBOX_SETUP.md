# Local Development - Sandbox/Testnet API Setup

This guide helps you configure sandbox/testnet APIs for local development to avoid using production services.

## Overview

For local development, you want to use **sandbox/testnet** versions of all APIs to:
- ✅ Avoid spending real money
- ✅ Test without affecting production data
- ✅ Develop safely without rate limits
- ✅ Use test networks that mirror production behavior

---

## Twilio SMS Mock Configuration

The application uses Twilio SMS for security and transactional alerts (large withdrawals, transfers, deposits, bounties, rate limit violations). To test these flows locally without incurring SMS costs or sending real messages:

### 1. Enable Mock Mode (recommended for local development)
```bash
USE_MOCKS=true
```

### 2. Configure Twilio Environment Variables (can use dummy values in mock mode)
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### 3. Testing SMS Flows
- When `USE_MOCKS=true`, all SMS messages are stored in-memory instead of being sent
- View sent messages at: `GET /api/mock/twilio/messages`
- Filter by phone: `GET /api/mock/twilio/messages?phone=+1234567890`
- Clear all messages: `DELETE /api/mock/twilio/messages`

### 4. Mock Inspector
- Admin services page shows Twilio status (Mock/Real/Not Configured)
- Click "View Messages" link to inspect sent SMS in mock mode

### 5. Using Real Twilio (staging/production)
- Set `USE_MOCKS=false`
- Provide real Twilio credentials
- SMS will be sent to real phone numbers (incurs costs)

**Note**: The mock store is in-memory and resets on server restart. No database changes are required.

---

## 1. Voltage Lightning Network (MutinyNet Sandbox)

**Status**: ✅ You found the docs: https://docs.voltage.cloud/dev-sandbox-mutinynet

### Setup Steps:

1. **Sign up for Voltage Sandbox**:
   - Go to: https://voltage.cloud
   - Create a free account (or use existing)
   - Navigate to Sandbox/Testnet section

2. **Create a MutinyNet Node**:
   - Follow: https://docs.voltage.cloud/dev-sandbox-mutinynet
   - Create a new Lightning node on MutinyNet (testnet)
   - This gives you test Bitcoin and test Lightning channels

3. **Get Credentials**:
   - **REST URL**: Your node's API endpoint (e.g., `https://your-node-name.m.voltageapp.io`)
   - **Admin Macaroon**: Download from Voltage dashboard
   - **TLS Certificate**: Download from Voltage dashboard (if needed)

4. **Update `.env.local`**:
```bash
# Voltage MutinyNet Sandbox (Local Dev)
LND_REST_URL=https://your-mutinynet-node.m.voltageapp.io
LND_ADMIN_MACAROON=<your-sandbox-macaroon-hex>
# Optional: If your node requires TLS cert
LND_TLS_CERT=<path-to-cert-or-cert-content>
```

5. **Test**:
   - Create a test invoice - should work with testnet sats
   - No real money involved!

---

## 2. GROQ API (AI/LLM)

**Current**: `GROQ_API_KEY=fake-groq-api-key`

**Sandbox Status**: ❌ **No dedicated sandbox environment**

**But**: GROQ's **free tier is very generous** (generous rate limits) and perfect for local development.

### Setup Steps:

1. **Get GROQ API Key**:
   - Go to: https://console.groq.com/
   - Sign up/login (free account)
   - Create an API key (free tier available)

2. **For Local Dev**:
   - Use the **same API key** as production - the free tier is generous enough
   - OR create a separate test key for extra safety
   - No additional setup needed - just use your real key

3. **Update `.env.local`**:
```bash
GROQ_API_KEY=gsk_your_actual_groq_key_here
```

**Note**: 
- No traditional "sandbox" like Voltage's testnet
- Free tier limits are generous enough for development
- You can use the same key for local and production (or create separate keys)

---

## 3. Google Maps API

**Current**: `GOOGLE_MAPS_API_KEY=fake-googlemaps-key`

**Sandbox Status**: ❌ **No dedicated sandbox environment**

**But**: Google provides **$200/month free credit** which is very generous for development/testing.

### Setup Steps:

1. **Get Google Maps API Key**:
   - Go to: https://console.cloud.google.com/
   - Create a project (or use existing)
   - Enable "Maps JavaScript API" and "Geocoding API"
   - Create an API key
   - **Set up billing** (required, but you get $200/month free credit)

2. **For Local Dev** (Recommended):
   - Create a **separate development API key** with restrictions:
     - **Application restrictions**: HTTP referrers (web sites)
     - **Website restrictions**: `http://localhost:3457/*` (only works on localhost)
     - **API restrictions**: Enable only the APIs you need
   - This prevents accidental usage on production domains

3. **Alternative Setup**:
   - Use **IP restrictions** instead of referrer restrictions:
     - Add `127.0.0.1` and `localhost` to allowed IPs
   - Good if referrer restrictions don't work for your setup

4. **Update `.env.local`**:
```bash
GOOGLE_MAPS_API_KEY=AIzaSy_your_dev_key_here
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy_your_dev_key_here
```

**Important Notes**:
- No traditional "sandbox" like Voltage's testnet
- **$200/month free credit** is very generous for development
- Always use **separate dev keys with localhost restrictions** to prevent production charges
- Monitor usage in Google Cloud Console to stay within free tier

---

## 4. Resend (Email)

**Current**: `RESEND_API_KEY=re_test_fake_resend_key_123456`

**Sandbox Status**: ❌ **No dedicated sandbox/test mode**

**But**: Resend's **free tier (100 emails/day)** is enough for local development.

### Setup Steps:

1. **Get Resend API Key**:
   - Go to: https://resend.com/
   - Sign up/login (free account)
   - Navigate to API Keys section
   - Click **"+ Create API key"**

2. **For Local Dev** (Recommended):
   - Create a **separate development API key** with a name like "Local Dev" or "Testing"
   - Choose **"Sending access"** permission (safer than full access)
   - Optionally restrict to a test domain (if you have one set up)
   - **Free tier**: 100 emails/day (usually enough for development)

3. **Alternative Option**:
   - Use your existing production key if you want to share limits
   - Not recommended - better to keep dev/prod separate

4. **Update `.env.local`**:
```bash
# Use a separate dev key (recommended)
RESEND_API_KEY=re_your_dev_key_here

# OR use production key (not recommended)
# RESEND_API_KEY=re_your_production_key_here
```

**Important Notes**:
- ❌ **No test mode** - all keys send real emails
- ✅ **Free tier**: 100 emails/day (enough for local dev)
- ✅ **Separate dev key**: Recommended to keep dev/prod separate
- ✅ **Monitor usage**: Check Resend dashboard to stay within free tier
- ⚠️ **All emails are real** - be careful not to spam during development

---

## 5. Bitcoin Price API

**Current**: Uses DIA Data API (free, no API key needed)

### Setup Steps:

**Good news**: Your current setup uses DIA Data which is **free and doesn't require an API key**!

**Current implementation**:
- Uses: `https://api.diadata.org/v1/assetQuotation/Bitcoin/...`
- No authentication needed
- Free to use
- Perfect for local dev ✅

**No changes needed** - your current setup is already sandbox-friendly!

**Note**: The app uses **DIA Data API** which is free and requires no API key. No CoinMarketCap needed!

---

## 6. Nostr (Decentralized Social)

**Current**: Uses public Nostr relays (no API key needed)

### Setup Steps:

**Good news**: Nostr is **already testnet-friendly**!

**Current setup**:
- Uses public Nostr relays (free, no API key)
- Test keys work fine
- No sandbox needed

**For Local Dev**:
1. **Generate a test Nostr key** (if you don't have one):
```bash
node scripts/generate-nostr-keys.js
```

2. **Update `.env.local`**:
```bash
# Use a separate test key for local dev
NOSTR_PRIVATE_KEY=<your-test-nostr-private-key-hex>
```

**Note**: 
- Posts to Nostr will appear on test relays (that's fine for dev)
- You can use a separate test account for local development
- No additional setup needed!

---

## 6b. Nostr Mock Relay (Local Development - Offline Mode)

**Status**: ✅ **Mock relay supported via `USE_MOCKS=true`**

**Mock Status**: Enables **fully offline Nostr development** without external relays or WebSocket connections

### Setup Steps:

1. **Enable Mock Mode**:
   - Set `USE_MOCKS=true` in `.env.local`
   - No external relays or NOSTR_PRIVATE_KEY required
   - Works completely offline

2. **Update `.env.local`**:
```bash
# Enable mock mode for all services (Lightning, Maps, Email, Nostr, etc.)
USE_MOCKS=true

# Mock Nostr automatically configured - no additional setup needed!
# - No NOSTR_PRIVATE_KEY required
# - No external relay connections
# - Events stored in-memory
# - Debug endpoints available
```

3. **How It Works**:
   - Mock relay stores events in-memory (Map-based storage)
   - No WebSocket connections to real relays
   - Simulates partial relay acceptance (4/5 relays succeed, 1 fails)
   - Events accessible via debug API endpoints
   - Works completely offline for local development
   - Console logs with `[MOCK NOSTR]` prefix indicate mock activity

4. **Testing Mock Relay**:

**Publish a Post**:
```bash
curl -X POST http://localhost:3457/api/nostr/publish-post \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Test Issue",
    "description": "Testing mock Nostr relay",
    "postId": "test-123",
    "reward": 1000
  }'

# Response: 
# {
#   "success": true,
#   "eventId": "abc123...",
#   "relaysPublished": 4,
#   "relaysFailed": 1
# }
```

**Setup Ganamos Profile**:
```bash
curl -X POST http://localhost:3457/api/nostr/setup-profile

# Response:
# {
#   "success": true,
#   "eventId": "def456...",
#   "relaysPublished": 4
# }
```

**Inspect Published Events**:
```bash
# List all events
curl http://localhost:3457/api/mock/nostr/events

# Filter by kind (0=profile, 1=post)
curl http://localhost:3457/api/mock/nostr/events?kind=1&limit=10

# Get single event by ID
curl http://localhost:3457/api/mock/nostr/events/abc123...

# Response:
# {
#   "events": [...],
#   "stats": {
#     "eventCount": 2,
#     "byKind": { "0": 1, "1": 1 },
#     "lastPublished": 1234567890
#   }
# }
```

**Reset Mock Store** (for testing):
```bash
curl -X DELETE http://localhost:3457/api/mock/nostr/events

# Response:
# {
#   "message": "Store reset",
#   "deletedCount": 2
# }
```

5. **Switching Back to Real Relays**:
   - Remove `USE_MOCKS=true` or set `USE_MOCKS=false` in `.env.local`
   - Add `NOSTR_PRIVATE_KEY=<your-key-hex>` to `.env.local`
   - Real relay publishing will resume automatically

### Console Logging:

Watch console output to confirm mock mode:
```bash
# Mock mode (USE_MOCKS=true):
[MOCK NOSTR] Publishing event to mock relay: abc123...
[MOCK NOSTR] Event kind: 1 | Content length: 150
[MOCK NOSTR] Published to 4/5 relays (1 failed)

# Real mode (USE_MOCKS=false):
[NOSTR] Publishing event to relays: abc123...
[NOSTR] Published to 5/5 relays (0 failed)
```

### Debug Endpoints:

**All endpoints return 403 if `USE_MOCKS != true`**

**List/Filter Events**:
```
GET /api/mock/nostr/events

Query parameters:
  - kind: Filter by event kind (0=profile, 1=post)
  - pubkey: Filter by publisher public key
  - since: Unix timestamp filter (events after)
  - until: Unix timestamp filter (events before)
  - limit: Number of events (default 100)

Response:
{
  "events": [
    {
      "id": "abc123...",
      "kind": 1,
      "created_at": 1234567890,
      "content": "🏙️ New issue posted...",
      "tags": [...],
      "pubkey": "def456...",
      "sig": "789abc..."
    }
  ],
  "stats": {
    "eventCount": 2,
    "byKind": { "0": 1, "1": 1 },
    "lastPublished": 1234567890
  }
}
```

**Get Single Event**:
```
GET /api/mock/nostr/events/[id]

Response: NostrEvent object or 404 if not found
```

**Reset Store**:
```
DELETE /api/mock/nostr/events

Response:
{
  "message": "Store reset",
  "deletedCount": 2
}
```

### Limitations of Mock Relay:

- **In-memory only**: Events cleared on app restart (no persistence)
- **Single instance**: No multi-server or distributed relay simulation
- **Simulated relay behavior**: Always returns 4/5 relays published, 1 failed
- **No WebSocket subscriptions**: Only publishing supported, not event listening
- **No relay-specific features**: NIP-specific features not implemented

### Benefits:

- ✅ **Completely offline development** - no internet required
- ✅ **Zero cost** - no real relay fees or rate limits
- ✅ **Fast testing** - instant publish, no network latency
- ✅ **Event inspection** - debug endpoints for viewing/filtering events
- ✅ **Clean testing** - reset store between test runs
- ✅ **Safe experimentation** - no impact on real Nostr network

### Full Example `.env.local` with Mock Nostr:

```bash
# ============================================
# Mock Mode (For Local Development)
# ============================================
USE_MOCKS=true  # Enables all mocks: Lightning, Maps, Email, Nostr, etc.

# Nostr in mock mode:
# - No NOSTR_PRIVATE_KEY needed
# - No external relays required
# - Events stored in-memory
# - Debug endpoints available at /api/mock/nostr/events
# - Console logs show [MOCK NOSTR] prefix
```

### Testing Pattern Example:

```bash
# 1. Enable mock mode
echo "USE_MOCKS=true" >> .env.local

# 2. Restart dev server
npm run dev

# 3. Publish test event
curl -X POST http://localhost:3457/api/nostr/publish-post \
  -H 'Content-Type: application/json' \
  -d '{"title": "Test", "description": "Test", "postId": "test-123", "reward": 100}'

# 4. Verify event was stored
curl http://localhost:3457/api/mock/nostr/events

# 5. Reset for next test
curl -X DELETE http://localhost:3457/api/mock/nostr/events

# 6. Switch to real relays when ready
echo "USE_MOCKS=false" >> .env.local
echo "NOSTR_PRIVATE_KEY=your-real-key-here" >> .env.local
```

---

## 7. Sphinx Chat

**Current**: Uses production Sphinx API

### Setup Steps:

**Challenge**: Sphinx doesn't have a public sandbox/testnet API

**Options**:

**Option A: Disable Sphinx for Local Dev** (Recommended):
```bash
# In .env.local
ENABLE_SPHINX=false
```

This will skip Sphinx posting during local development.

**Option B: Use Test Bot Credentials**:
- Contact Sphinx admin to create a test bot
- Use test bot credentials in `.env.local`
- Posts will go to a test tribe (if available)

**Option C: Keep Production Credentials** (Not Recommended):
- Only if you want posts to appear in production tribe during dev
- Not recommended for local development

**Recommended Setup**:
```bash
# Disable Sphinx for local dev
ENABLE_SPHINX=false

# OR use test credentials (if available)
# SPHINX_CHAT_PUBKEY=<test-tribe-pubkey>
# SPHINX_BOT_ID=<test-bot-id>
# SPHINX_BOT_SECRET=<test-bot-secret>
```

---

## Complete `.env.local` Template

Here's a complete template with all sandbox/testnet configs:

```bash
# ============================================
# Supabase (Local)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54324
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SECRET_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
# Or use legacy key name: SUPABASE_SERVICE_ROLE_KEY=...

# ============================================
# Voltage Lightning (MutinyNet Sandbox)
# ============================================
LND_REST_URL=https://your-mutinynet-node.m.voltageapp.io
LND_ADMIN_MACAROON=<your-mutinynet-macaroon-hex>

# ============================================
# GROQ (AI/LLM)
# ============================================
GROQ_API_KEY=gsk_your_groq_key_here

# ============================================
# Google Maps
# ============================================
GOOGLE_MAPS_API_KEY=AIzaSy_your_dev_key_here
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy_your_dev_key_here

# ============================================
# Resend (Email - Free Tier for Dev)
# ============================================
# Create a separate dev key in Resend dashboard
# Free tier: 100 emails/day (enough for local dev)
RESEND_API_KEY=re_your_dev_key_here

# ============================================
# Bitcoin Price (Already Sandbox-Friendly)
# ============================================
# Uses DIA Data API (free, no key needed)
# No configuration required - works automatically!

# ============================================
# Nostr (Already Sandbox-Friendly)
# ============================================
# Option 1: Real Nostr relays (with test key)
NOSTR_PRIVATE_KEY=<your-test-nostr-key-hex>

# Option 2: Mock Nostr relay (fully offline)
# Just set USE_MOCKS=true above - mock Nostr auto-configured
# - No NOSTR_PRIVATE_KEY needed
# - No external relays required
# - Events stored in-memory
# - Debug endpoints: /api/mock/nostr/events

# ============================================
# Sphinx (Disable for Local Dev)
# ============================================
ENABLE_SPHINX=false
# SPHINX_CHAT_PUBKEY=<only-if-using-test-bot>
# SPHINX_BOT_ID=<only-if-using-test-bot>
# SPHINX_BOT_SECRET=<only-if-using-test-bot>

# ============================================
# Other
# ============================================
NODE_ENV=development
CRON_SECRET=<local-dev-secret>
```

---

## Quick Setup Checklist

- [ ] **Voltage**: Create MutinyNet node, get credentials
- [ ] **GROQ**: Get API key from console.groq.com
- [ ] **Google Maps**: Create dev API key with localhost restrictions
- [ ] **Resend**: Create separate dev API key (free tier: 100/day)
- [ ] **Bitcoin Price**: Already using free API (no changes needed)
- [ ] **Nostr**: Generate test key (optional, can reuse)
- [ ] **Sphinx**: Set `ENABLE_SPHINX=false` for local dev

---

## Testing Your Setup

After configuring, test each service:

1. **Voltage**: Create a test invoice - should work with testnet sats
2. **GROQ**: Make a test AI request - should return response
3. **Google Maps**: Load a map - should show without errors
4. **Resend**: Send a test email - should appear in test inbox
5. **Bitcoin Price**: Check price endpoint - should return price
6. **Nostr**: Create a test post - should publish to relays
7. **Sphinx**: Should be disabled (no errors expected)

---

## Resources

- **Voltage MutinyNet**: https://docs.voltage.cloud/dev-sandbox-mutinynet
- **GROQ Console**: https://console.groq.com/
- **Google Cloud Console**: https://console.cloud.google.com/
- **Resend Dashboard**: https://resend.com/
- **DIA Data API**: https://docs.diadata.org/ (free, no signup needed)
- **Nostr Tools**: https://github.com/nbd-wtf/nostr-tools
- **Sphinx Chat**: https://sphinx.chat/

---

## Questions?

If any service doesn't have a clear sandbox option, let me know and I can help find alternatives or workarounds!

