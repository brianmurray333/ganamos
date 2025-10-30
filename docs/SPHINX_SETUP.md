# Ganamos Sphinx Integration

## Overview
Ganamos automatically publishes all new public posts to the Ganamos Sphinx tribe.

## Setup

### Environment Variables
Add these to Vercel (already done) or `.env.local`:

```bash
SPHINX_CHAT_PUBKEY=027f3516ddb207bbcdcdad71ca11fa8434aca35a0d735cfc09d536590e40963ec47d
SPHINX_BOT_ID=456A787D12A074A3
SPHINX_BOT_SECRET=282A7975A262045CA5690D8CE6B3034F
```

⚠️ Never commit `SPHINX_BOT_SECRET` to git!

## How It Works

When a public post is created:
1. Post saved to database
2. Published to NOSTR (existing)
3. **Published to Sphinx** (new)

Both run asynchronously - failures don't block post creation.

## Message Format

```
🏙️ New issue in Como, Italy!

Broken streetlight

Street light is out, making it dangerous at night

💰 Reward: 5,000 sats
📍 Como, Italy

https://www.ganamos.earth/post/abc123
```

## Monitoring

Watch for these log messages:
- `[SPHINX] Publishing post to Sphinx tribe: <postId>`
- `[SPHINX] Successfully published post to Sphinx: <postId>`
- `[SPHINX] Error publishing to Sphinx: <error>`

## Publishing Rules

✅ **Published to Sphinx:**
- Public posts by authenticated users
- Anonymous posts

❌ **NOT published:**
- Group posts (private)

## Files

**Created:**
- `lib/sphinx.ts` - Core library
- `app/api/sphinx/publish-post/route.ts` - API endpoint

**Modified:**
- `app/post/new/page.tsx` - Added Sphinx publishing
- `app/actions/post-actions.ts` - Added Sphinx for anonymous posts

## Troubleshooting

**Posts not appearing in Sphinx?**
1. Check env vars are set
2. Check logs for `[SPHINX]` errors
3. Verify it's a public post (not group)

---

Built for the Ganamos community on Sphinx
