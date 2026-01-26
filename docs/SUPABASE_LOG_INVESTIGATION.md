# Supabase Log Investigation Guide

## Critical Time Window
- **Start:** Dec 29, 2025 05:44:54 UTC (account creation)
- **End:** Dec 29, 2025 05:55:41 UTC (first withdrawal)
- **Window:** ~10-11 minutes

---

## 1. Database Logs (Postgres Logs)

### Location
- Supabase Dashboard → **Logs** → **Postgres Logs**
- Or: **Database** → **Logs** → **Postgres**

### What to Look For

#### A. Direct UPDATE Statements
Search for SQL queries containing:
```sql
UPDATE profiles SET balance
UPDATE profiles SET balance = 10100000
UPDATE profiles SET balance = 9725000
UPDATE profiles WHERE id = '75c9b493-0608-45bc-bc6d-9c648fbc88da'
```

#### B. Time Range Filter
- Set filter to: **Dec 29, 2025 05:44:00 - 05:56:00 UTC**
- Look for any UPDATE statements on the `profiles` table

#### C. Service Role Operations
Look for queries executed with:
- `service_role` key
- Admin-level access
- Bypassed RLS policies

#### D. Unusual Patterns
- Queries that don't create transactions
- Queries that update balance without corresponding activity
- Queries from unexpected IP addresses

---

## 2. API Logs (PostgREST Logs)

### Location
- Supabase Dashboard → **Logs** → **API Logs**
- Or: **API** → **Logs**

### What to Look For

#### A. PATCH/PUT Requests to Profiles
Search for:
- `PATCH /rest/v1/profiles`
- `PUT /rest/v1/profiles`
- Requests with `id=eq.75c9b493-0608-45bc-bc6d-9c648fbc88da`

#### B. Request Bodies
Look for request bodies containing:
```json
{"balance": 10100000}
{"balance": 9725000}
{"balance": 10000000}
```

#### C. Authentication Headers
Check for:
- `apikey` header (service role key usage)
- `Authorization: Bearer` with service role token
- Unusual authentication patterns

#### D. Time Range
- Filter: **Dec 29, 2025 05:44:00 - 05:56:00 UTC**

---

## 3. Auth Logs

### Location
- Supabase Dashboard → **Authentication** → **Logs**
- Or: **Auth** → **Logs**

### What to Look For

#### A. User Creation
- Account creation at 05:44:54 UTC
- Email confirmation at 05:45:06 UTC
- Any suspicious auth events

#### B. Token Generation
- Service role tokens generated
- Admin tokens created
- Unusual token usage

#### C. Sign-in Events
- First sign-in at 05:45:08 UTC
- Any admin sign-ins around that time

---

## 4. Database Audit Logs (if enabled)

### Location
- Supabase Dashboard → **Database** → **Audit Logs**
- Note: This may require enabling audit logging first

### What to Look For

#### A. Table Changes
- Changes to `profiles` table
- Balance column updates
- Any DML operations (INSERT, UPDATE, DELETE)

#### B. User Activity
- Who made the changes
- What SQL was executed
- When it happened

---

## 5. Realtime Logs (if applicable)

### Location
- Supabase Dashboard → **Realtime** → **Logs**

### What to Look For
- Any realtime subscriptions to profiles table
- Unusual realtime activity around the time window

---

## 6. Edge Functions Logs (if applicable)

### Location
- Supabase Dashboard → **Edge Functions** → **Logs**

### What to Look For
- Any edge functions that might update balance
- Functions called around the critical time window

---

## Search Strategies

### Strategy 1: Search by User ID
```
75c9b493-0608-45bc-bc6d-9c648fbc88da
```

### Strategy 2: Search by Balance Value
```
10100000
9725000
10000000
```

### Strategy 3: Search by SQL Pattern
```
UPDATE profiles SET balance
```

### Strategy 4: Search by Time
- Exact window: **05:44:54 - 05:55:41 UTC**
- Extended window: **05:44:00 - 06:00:00 UTC** (to catch everything)

---

## What Each Log Type Will Reveal

### If Found in Postgres Logs:
- **Direct SQL execution** - Someone ran SQL directly
- **Service role usage** - Admin credentials were used
- **SQL injection** - Malicious SQL was injected

### If Found in API Logs:
- **REST API call** - Balance updated via Supabase REST API
- **Service role key usage** - Admin key was used in API call
- **Application-level exploit** - Your app made the call (but we didn't see it in Vercel logs)

### If Found in Auth Logs:
- **Account compromise** - Auth system was exploited
- **Token theft** - Service role token was stolen

### If NOT Found in Any Logs:
- **Direct database connection** - Attacker had direct DB access
- **Logs were deleted** - Attacker cleaned up traces
- **Audit logging disabled** - No audit trail exists

---

## SQL Query to Check Supabase Logs (if accessible)

If you have direct database access, you can query:

```sql
-- Check for any balance updates in the time window
SELECT 
  *
FROM pg_stat_statements
WHERE query LIKE '%UPDATE profiles%balance%'
  AND query LIKE '%75c9b493-0608-45bc-bc6d-9c648fbc88da%'
ORDER BY query_time DESC;

-- Check for service role usage
SELECT 
  *
FROM pg_stat_activity
WHERE usename = 'service_role'
  AND query_start BETWEEN 
    '2025-12-29 05:44:00'::timestamp 
    AND '2025-12-29 05:56:00'::timestamp;
```

**Note:** These queries require `pg_stat_statements` extension and may not be available in Supabase managed instances.

---

## If No Logs Are Found

If you can't find any logs showing the balance update, it confirms:

1. **Direct Database Access** - Attacker had database credentials
2. **Logs Were Deleted** - Attacker cleaned up traces (requires admin access)
3. **Audit Logging Disabled** - No audit trail was created
4. **Different Supabase Project** - Balance was set in a different project/environment

---

## Next Steps After Reviewing Logs

1. **If logs found:**
   - Identify the attack vector
   - Patch the vulnerability
   - Rotate compromised credentials

2. **If logs NOT found:**
   - Assume direct database access
   - Rotate ALL credentials (service role key, database passwords)
   - Enable audit logging
   - Review access controls

3. **Either way:**
   - Implement balance validation triggers
   - Add monitoring/alerts
   - Review security practices

---

## Priority Order

1. **Postgres Logs** (most important - shows SQL execution)
2. **API Logs** (shows REST API calls)
3. **Auth Logs** (shows authentication events)
4. **Database Audit Logs** (if enabled)
5. **Edge Functions Logs** (if applicable)

---

**Remember:** The balance was set between **05:44:54 and 05:55:41 UTC on Dec 29, 2025**. Focus your search on that exact window.

