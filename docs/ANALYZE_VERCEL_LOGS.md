# Vercel Log Analysis Guide

This guide helps you analyze Vercel logs to find evidence of hacker activity.

## Quick Start

1. **Export logs from Vercel:**
   - Go to Vercel Dashboard → Your Project → Logs
   - Filter by time window (when you received the alerts)
   - Export as JSON

2. **Run the analysis script:**
   ```bash
   # If you have a log file:
   node scripts/analyze-vercel-logs.js vercel-logs.json
   
   # Or pipe from stdin:
   cat vercel-logs.json | node analyze-vercel-logs.js -
   
   # Save detailed report:
   node analyze-vercel-logs.js vercel-logs.json --save
   ```

## What to Look For

The script searches for:

1. **Balance Reconciliation Failures**
   - Logs containing `[SECURITY] Balance reconciliation failed`
   - These show when withdrawal attempts were blocked due to balance mismatch
   - Look for: IP address, user agent, discrepancy amount

2. **Withdrawal Attempts**
   - Requests to `/api/wallet/withdraw`
   - Look for: IP address, user agent, amount, status code

3. **Suspended Account Attempts**
   - Logs showing suspended account tried to access the system
   - Look for: IP address, user agent

4. **Rate Limit Violations**
   - Logs showing rate limit exceeded
   - Look for: IP address, request count

5. **Deposit Attempts**
   - Requests to `/api/wallet/deposit`
   - Look for: IP address, user agent, amount

## Key Information to Extract

### IP Addresses
- The hacker's IP address(es) - useful for blocking
- Check if they're using VPNs or proxies
- Look for patterns (same IP, rotating IPs, etc.)

### User Agents
- Browser/client information
- Can help identify automation tools or scripts
- Look for unusual patterns

### Timeline
- When exactly did the attempts happen?
- How many attempts per minute/hour?
- What was the sequence of events?

## Expected Log Patterns

Based on the code, you should see logs like:

```
[SECURITY] Balance reconciliation failed: {
  userId: '75c9b493-0608-45bc-bc6d-9c648fbc88da',
  storedBalance: 0,
  calculatedBalance: -375000,
  discrepancy: 375000
}
```

Or:

```
[SECURITY] Suspended account attempted withdrawal: {
  userId: '75c9b493-0608-45bc-bc6d-9c648fbc88da',
  email: 'null@drecks.schule'
}
```

## If No Logs Found

If the script doesn't find any logs, it could mean:

1. **Withdrawals are disabled** - The code returns early before reconciliation check
2. **Logs are from a different time** - Adjust `TIME_WINDOW` in the script
3. **Logs are in a different format** - Check the log structure and adjust parsing
4. **Logs were filtered out** - Check if Vercel filters certain log levels

## Adjusting the Time Window

Edit `TIME_WINDOW` in `analyze-vercel-logs.js`:

```javascript
const TIME_WINDOW = {
  start: '2026-01-03T00:00:00Z', // When alerts started
  end: '2026-01-03T23:59:59Z',   // When alerts stopped
};
```

## Next Steps After Analysis

1. **Block IP addresses** - Add to firewall/rate limiter
2. **Review user agents** - Identify automation tools
3. **Check timeline** - Understand attack pattern
4. **Verify account status** - Confirm account is still suspended
5. **Review security measures** - Ensure all protections are active

