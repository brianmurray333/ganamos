# Daily PR Summary to Sphinx

## Overview
The daily admin email cron job now also sends a PR summary to the Sphinx group.

## Implementation
- **Location**: Single cron job at `/api/admin/daily-summary`
- **Schedule**: Daily at 1:00 AM UTC
- **Actions**:
  1. Sends admin email to `admin@example.com` (existing)
  2. Posts PR summary to Sphinx tribe (new)

## What Gets Posted to Sphinx
Only the merged pull requests from the last 24 hours, formatted as:

```
📊 Ganamos Daily Development Update - [Date]

🚀 X pull requests merged:

1. Title of PR #123
   https://github.com/...

2. Title of PR #124
   https://github.com/...

Keep building! 💪
```

If no PRs were merged: "No pull requests were merged in the last 24 hours."

## Error Handling
- If Sphinx posting fails, it logs the error but **doesn't fail the email send**
- The cron job returns info about both email and Sphinx in the response

## Testing
You can test manually with the test script:

```bash
npx tsx scripts/test-pr-summary.ts
```

Or trigger the full cron job:

```bash
# With CRON_SECRET
curl -X POST http://localhost:3457/api/admin/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Files Modified
- `lib/daily-summary.ts` - Added `sendPRSummaryToSphinx()` function
- `app/api/admin/daily-summary/route.ts` - Updated to call Sphinx function
- `scripts/test-pr-summary.ts` - New test script (optional)

## Configuration Required
The Sphinx integration must be enabled and configured:
- `SPHINX_ENABLED=true`
- `SPHINX_BOT_ID`
- `SPHINX_BOT_SECRET`
- `SPHINX_CHAT_PUBKEY`

## Notes
- Simple implementation - no separate cron job needed
- Reuses existing PR fetching logic (`getMergedPRs()`)
- Follows same authentication pattern as admin email
- Lightweight addition to existing workflow
