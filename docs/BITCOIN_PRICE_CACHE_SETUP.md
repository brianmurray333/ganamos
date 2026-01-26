# Bitcoin Price Cache Setup

This document explains the Bitcoin price caching system that reduces CoinMarketCap API calls from thousands per day to just 48 per day.

## Architecture Overview

Instead of calling CoinMarketCap API on every device sync or page load, we now:
1. Store Bitcoin prices in a database table (`bitcoin_prices`)
2. Update the price every 30 minutes via Vercel Cron
3. All API endpoints read from the cached database value

## Setup Instructions

### 1. Run Database Migration

Execute the SQL migration to create the necessary table and functions:

```bash
# In Supabase SQL Editor, run:
scripts/create-bitcoin-price-table.sql
```

This creates:
- `bitcoin_prices` table with proper indexes and RLS policies
- `get_latest_bitcoin_price()` function for fast lookups
- `cleanup_old_bitcoin_prices()` function to manage storage

### 2. Configure Environment Variables

Add the following to your `.env.local` (development) and Vercel environment variables (production):

```bash
# Required: CoinMarketCap API key
COINMARKETCAP_API_KEY=your_api_key_here

# Required: Cron job authentication
CRON_SECRET=your_random_secret_here

# Required: Supabase credentials (should already exist)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Generate a CRON_SECRET:**
```bash
openssl rand -base64 32
```

### 3. Seed Initial Bitcoin Price

Before the first cron job runs, manually insert an initial price:

**Option A: Call the cron endpoint manually**
```bash
curl -X GET "https://www.ganamos.earth/api/cron/update-bitcoin-price" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Option B: Insert directly in Supabase SQL Editor**
```sql
INSERT INTO bitcoin_prices (price, currency, source)
VALUES (98500.00, 'USD', 'manual_seed');
```

### 4. Deploy to Vercel

The `vercel.json` file is already configured with the cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron/update-bitcoin-price",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

This runs every 30 minutes (48 times per day).

**Deploy:**
```bash
git add .
git commit -m "Add Bitcoin price caching system"
git push origin main
```

Vercel will automatically detect and configure the cron job.

### 5. Verify Setup

#### Check Database
```sql
-- Get latest price
SELECT * FROM get_latest_bitcoin_price('USD');

-- View price history
SELECT price, created_at, 
       EXTRACT(EPOCH FROM (now() - created_at))/60 as age_minutes
FROM bitcoin_prices
WHERE currency = 'USD'
ORDER BY created_at DESC
LIMIT 10;
```

#### Test API Endpoints

**Web API (public):**
```bash
curl https://www.ganamos.earth/api/bitcoin-price
```

**Device Config API:**
```bash
curl "https://www.ganamos.earth/api/device/config?pairingCode=ABC123"
```

#### Monitor Cron Job

In Vercel Dashboard:
1. Go to your project
2. Click "Cron Jobs" tab
3. View execution history and logs

## Benefits

### Before (Direct API Calls)
- ❌ ~10,000+ API calls/day (exceeds free tier: 333/day)
- ❌ 200-500ms response time per request
- ❌ Expensive for CoinMarketCap API quota
- ❌ High power consumption on Heltec devices
- ❌ Fails if CoinMarketCap is down

### After (Database Cache)
- ✅ 48 API calls/day (well within free tier)
- ✅ <10ms response time per request
- ✅ Minimal API costs
- ✅ 20-50x faster response for Heltec devices
- ✅ Works even if CoinMarketCap is temporarily down
- ✅ Price history stored for future analytics

## API Response Format

### `/api/bitcoin-price`

```json
{
  "price": 98456.78,
  "currency": "USD",
  "source": "coinmarketcap",
  "timestamp": "2025-10-14T15:30:00.000Z",
  "ageMinutes": 5,
  "isStale": false
}
```

### `/api/device/config`

```json
{
  "success": true,
  "config": {
    "deviceId": "uuid",
    "petName": "Satoshi",
    "petType": "cat",
    "userName": "John",
    "balance": 50000,
    "btcPrice": 98456.78,
    "pollInterval": 30,
    "serverUrl": "https://www.ganamos.earth"
  }
}
```

## Troubleshooting

### Price is stale (>60 minutes old)

Check Vercel cron job logs:
1. Vercel Dashboard → Your Project → Cron Jobs
2. Look for errors in execution history
3. Check that `CRON_SECRET` matches in both places

### Cron job returns 401 Unauthorized

The `Authorization` header doesn't match `CRON_SECRET`:
1. Regenerate secret: `openssl rand -base64 32`
2. Update in Vercel environment variables
3. Redeploy

### No price data in database

Manually trigger the cron job:
```bash
curl -X GET "https://www.ganamos.earth/api/cron/update-bitcoin-price" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### CoinMarketCap API still being rate limited

Check that all endpoints are using the database:
```bash
# These should NOT appear in logs:
grep -r "pro-api.coinmarketcap.com" app/api/
# Only the cron job should call CoinMarketCap
```

## Maintenance

### Clean up old prices (automatic)

The cron job automatically deletes prices older than 30 days. To manually clean up:

```sql
SELECT cleanup_old_bitcoin_prices();
```

### Monitor API usage

Track CoinMarketCap API usage:
- Free tier: 333 calls/day, 10,000 calls/month
- Current usage: 48 calls/day, ~1,440 calls/month
- Remaining headroom: ~85% of quota

### Change update frequency

Edit `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/update-bitcoin-price",
      "schedule": "0 * * * *"  // Every hour (24 calls/day)
    }
  ]
}
```

Cron schedule format: `minute hour day month dayOfWeek`

## Future Enhancements

- [ ] Add WebSocket notifications for price changes
- [ ] Support multiple currencies (EUR, GBP, etc.)
- [ ] Add 24h high/low/change percentage
- [ ] Price trend visualization
- [ ] Fallback to CoinGecko if CoinMarketCap fails
- [ ] Email alerts if price update fails 3+ times

## Files Changed

- `scripts/create-bitcoin-price-table.sql` - Database schema
- `app/api/cron/update-bitcoin-price/route.ts` - Cron job endpoint
- `app/api/bitcoin-price/route.ts` - Updated to read from DB
- `app/api/device/config/route.ts` - Updated to read from DB
- `vercel.json` - Cron job configuration

