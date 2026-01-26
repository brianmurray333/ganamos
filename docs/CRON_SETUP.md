# Daily Email Cron Job Setup

## Overview

The app sends daily summary emails at 6pm PT (1:00 UTC) to the configured admin email address.

## How It Works

### Production (Vercel)
- Uses **Vercel Cron Jobs** (configured in `vercel.json`)
- Triggers `/api/admin/daily-summary` endpoint daily at `0 1 * * *` (1:00 UTC / 6pm PT)
- Requires environment variables to be set in Vercel dashboard

### Local Development
- Uses `node-cron` (in `lib/scheduler.ts`)
- Only runs if `NODE_ENV=production` or `ENABLE_SCHEDULER=true`

## Deployment Steps

### 1. Push Changes to Vercel
```bash
git add vercel.json app/api/admin/daily-summary/route.ts lib/scheduler.ts
git commit -m "Add Vercel Cron for daily emails"
git push
```

### 2. Set Environment Variables in Vercel
Go to your Vercel project settings and add these environment variables:

#### Required:
- `RESEND_API_KEY` - Your Resend API key (already should be set)
- `CRON_SECRET` - A random secret string to secure the cron endpoint

#### Already configured:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### 3. Generate a CRON_SECRET

Run this command to generate a secure random secret:
```bash
openssl rand -base64 32
```

Add this value as the `CRON_SECRET` environment variable in Vercel.

### 4. Verify Deployment

After deployment, the cron job will automatically start running. You can:

1. Check Vercel's Cron Jobs dashboard to see execution logs
2. Manually trigger the endpoint to test:
   ```bash
   curl -X POST https://www.ganamos.earth/api/admin/daily-summary \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

## Troubleshooting

### Check Resend API Key
Make sure `RESEND_API_KEY` is set and valid in Vercel environment variables.

### Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → Logs
2. Filter by the cron job execution times (6pm PT / 1:00 UTC)
3. Look for errors in the daily summary email sending

### Manual Test
You can manually trigger the email by calling:
```bash
curl -X POST https://www.ganamos.earth/api/admin/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Verify Domain Configuration in Resend
Make sure `ganamos.earth` is verified in your Resend account and can send emails.

## Files Involved

- `vercel.json` - Vercel Cron configuration
- `app/api/admin/daily-summary/route.ts` - API endpoint that sends the email
- `lib/daily-summary.ts` - Email generation and data collection logic
- `lib/email.ts` - Resend email sending wrapper
- `lib/scheduler.ts` - Local development cron (doesn't work in production)

## Email Schedule

- **Time**: 6:00 PM Pacific Time (PT)
- **Cron Expression**: `0 1 * * *` (1:00 AM UTC next day)
- **Frequency**: Daily
- **Recipient**: Configured admin email (set via `ADMIN_EMAIL` or `NEXT_PUBLIC_ADMIN_EMAIL` environment variable)

Note: During Daylight Saving Time (PDT), 6pm PDT = 1:00 AM UTC next day.
During Standard Time (PST), 6pm PST = 2:00 AM UTC next day.

