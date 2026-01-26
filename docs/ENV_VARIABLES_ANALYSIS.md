# Environment Variables Analysis

## Summary

This analysis reviews your environment variables across `.env.local`, `.env`, and Vercel to identify:
1. Unused/useless variables that can be removed
2. Misplaced variables that should be moved
3. Other issues and optimizations

---

## 🔴 CRITICAL ISSUES

### 1. Typo: `NEXT_PUBLIC_POD_URLst` (in `.env.local`)
- **Issue**: Has extra "st" at the end
- **Should be**: `NEXT_PUBLIC_POD_URL`
- **Status**: Typo - fix immediately

### 2. Invalid Syntax: `GITHUB PERSONAL ACCESS TOKEN` (in `.env.local`)
- **Issue**: Contains spaces (invalid env var syntax)
- **Should be**: `GITHUB_TOKEN` (which you already have)
- **Status**: Remove this line - it's invalid and unused

### 3. Duplicates in `.env.local`
These variables appear **twice** in your `.env.local` list:
- `LND_REST_URL` (appears twice)
- `LND_ADMIN_MACAROON` (appears twice)
- `NODE_ENV` (appears twice)
- `NEXT_PUBLIC_SUPABASE_URL` (commented out, then active)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (commented out, then active)
- `SUPABASE_SERVICE_ROLE_KEY` (commented out, then active)

**Action**: Remove duplicates and clean up commented lines

---

## 🟡 UNUSED VARIABLES (Safe to Remove)

These variables are **not found anywhere in the codebase**:

### In `.env.local`:
- `TEST_G` - Test variable, not used
- `USE_SANDBOX_APIS` - Not referenced anywhere
- `GANAMOS_ENV` - Not referenced anywhere
- `LIGHTNING_NETWORK` - Not referenced anywhere
- `POSTGRES_URL` - Not used (this codebase uses Supabase, not direct Postgres)
- `POSTGRES_PRISMA_URL` - Not used (Prisma not used in this codebase)
- `SUPABASE_URL` (without NEXT_PUBLIC_) - Only `NEXT_PUBLIC_SUPABASE_URL` is used

### In `.env`:
- `SUPABASE_URL` (without NEXT_PUBLIC_) - Only `NEXT_PUBLIC_SUPABASE_URL` is used
- `SUPABASE_ANON_KEY` (without NEXT_PUBLIC_) - Only `NEXT_PUBLIC_SUPABASE_ANON_KEY` is used
- `POSTGRES_URL_NON_POOLING` - Not used
- `POSTGRES_USER` - Not used
- `POSTGRES_HOST` - Not used
- `POSTGRES_URL` - Not used
- `POSTGRES_PRISMA_URL` - Not used
- `VOLTAGE_WALLET_ID` - Not used

### In Vercel:
- `GITHUB_REPO_OWNER` - Not used (code uses `GITHUB_REPO` with format "owner/repo")
- `GITHUB_REPO_NAME` - Not used (code uses `GITHUB_REPO` with format "owner/repo")
- `FROM_EMAIL` - Not used (code uses `RESEND_FROM_EMAIL`)
- `SITE_URL` - Not used
- `NEXT_PUBLIC_MAPTILER_API_KEY` - Not used (only Google Maps is used)
- `VOLTAGE_WALLET_ID` - Not used

---

## 🟢 VARIABLE USAGE REFERENCE

### Public Variables (NEXT_PUBLIC_*)
These are exposed to the browser and should be in both `.env.local` and Vercel:
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Used in `lib/env.ts`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Used in `lib/env.ts`
- ✅ `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Used in `lib/env.ts`
- ✅ `NEXT_PUBLIC_POD_URL` - Used in `lib/env.ts`, `components/auth-provider.tsx`

### Server-Only Variables
These should **only** be in `.env.local` (development) and Vercel (production), **NOT** in `.env`:

**Supabase:**
- ✅ `SUPABASE_SECRET_API_KEY` - Preferred (new name)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Legacy fallback (still used as fallback)

**Lightning Network:**
- ✅ `LND_REST_URL` - Used in `lib/env.ts`, `lib/lightning.ts`
- ✅ `LND_ADMIN_MACAROON` - Used in `lib/env.ts`, `lib/lightning.ts`
- ✅ `VOLTAGE_API_KEY` - Used in `lib/lightning.ts`, `lib/env.ts`
- ✅ `VOLTAGE_ORGANIZATION_ID` - Used in `lib/env.ts`
- ✅ `VOLTAGE_ENVIRONMENT_ID` - Used in `lib/env.ts`

**Security:**
- ✅ `CRON_SECRET` - Used in cron routes
- ✅ `L402_ROOT_KEY` - Used in `lib/env.ts`

**External APIs:**
- ✅ `COINMARKETCAP_API_KEY` - Used in Bitcoin price cron (though currently using DIA Data instead)
- ✅ `GROQ_API_KEY` - Used in `lib/env.ts`, `lib/daily-summary.ts`
- ✅ `RESEND_API_KEY` - Used in `lib/email.ts`
- ✅ `RESEND_FROM_EMAIL` - Used in `app/api/email/job-assigned/route.ts`, `app/api/alexa/jobs/[id]/complete/route.ts`
- ✅ `GOOGLE_MAPS_API_KEY` - Server-side Google Maps (different from NEXT_PUBLIC version)

**Alexa:**
- ✅ `ALEXA_CLIENT_SECRET` - Used in `app/api/alexa/token/route.ts`
- ✅ `ALEXA_CLIENT_IDS` - Used in `lib/alexa-auth.ts`
- ✅ `ALEXA_JWT_SECRET` - Used in `lib/alexa-auth.ts`

**Twilio:**
- ✅ `TWILIO_ACCOUNT_SID` - Used in `scripts/test-sms.mjs`, `supabase/config.toml`
- ✅ `TWILIO_AUTH_TOKEN` - Used in `scripts/test-sms.mjs`, `supabase/config.toml`
- ✅ `TWILIO_FROM_NUMBER` - Used in `scripts/test-sms.mjs`
- ✅ `TWILIO_MESSAGING_SERVICE_SID` - Used in `supabase/config.toml`
- ✅ `ADMIN_PHONE_NUMBER` - Used in `scripts/test-sms.mjs`

**GitHub:**
- ✅ `GITHUB_TOKEN` - Used in `lib/env.ts`, `lib/daily-summary.ts`
- ✅ `GITHUB_WEBHOOK_SECRET` - Used in `app/api/webhooks/github/route.ts`
- ✅ `GITHUB_REPO` - Used in `lib/env.ts` (defaults to "brianmurray333/ganamos")

**Nostr:**
- ✅ `NOSTR_PRIVATE_KEY` - Used in `lib/env.ts`, `lib/nostr.ts`

**Sphinx:**
- ✅ `SPHINX_CHAT_PUBKEY` - Used in `lib/env.ts`
- ✅ `SPHINX_BOT_SECRET` - Used in `lib/env.ts`
- ✅ `SPHINX_BOT_ID` - Used in `lib/env.ts`

**System:**
- ✅ `NODE_ENV` - Used throughout (usually set automatically)
- ✅ `USE_MOCKS` - Used in `lib/env.ts` (for testing)

---

## 📍 PLACEMENT RECOMMENDATIONS

### `.env.local` (Local Development Only)
Should contain:
- All `NEXT_PUBLIC_*` variables
- All server-only secrets for local development
- Development-specific overrides

**Should NOT contain:**
- Variables that are only needed in production (Vercel)
- System variables like `NODE_ENV` (set automatically)

### `.env` (Optional - Git-committed Template)
This file is typically committed to git as a template. Should contain:
- Only `NEXT_PUBLIC_*` variables (non-sensitive public vars)
- Placeholder values or examples
- **NO secrets**

**Current issue**: Your `.env` contains database URLs and other sensitive data. This file should NOT contain secrets if it's committed to git.

### Vercel (Production)
Should contain:
- All variables needed for production
- All secrets
- All `NEXT_PUBLIC_*` variables

---

## 🔧 RECOMMENDATIONS

### 1. Clean Up `.env.local`
Remove:
- `TEST_G`
- `NEXT_PUBLIC_POD_URLst` (typo - fix to `NEXT_PUBLIC_POD_URL`)
- `GITHUB PERSONAL ACCESS TOKEN` (invalid syntax)
- `USE_SANDBOX_APIS`
- `GANAMOS_ENV`
- `LIGHTNING_NETWORK`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `SUPABASE_URL` (use `NEXT_PUBLIC_SUPABASE_URL` instead)
- Duplicate entries (LND_REST_URL, LND_ADMIN_MACAROON, NODE_ENV)
- Commented-out lines (clean them up)

### 2. Clean Up `.env`
Remove:
- `SUPABASE_URL` (use `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (use `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `VOLTAGE_WALLET_ID`
- All server-only secrets (move to `.env.local` only)

Keep only:
- `NEXT_PUBLIC_SUPABASE_URL` (with example/placeholder value)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (with example/placeholder value)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (with example/placeholder value)
- `NEXT_PUBLIC_POD_URL` (optional, with example value)

### 3. Clean Up Vercel
Remove:
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `FROM_EMAIL`
- `SITE_URL`
- `NEXT_PUBLIC_MAPTILER_API_KEY`
- `VOLTAGE_WALLET_ID`

Consider adding:
- `GITHUB_REPO` if you want to override the default "brianmurray333/ganamos"

### 4. Variable Naming Consistency
Your codebase uses `SUPABASE_SECRET_API_KEY` as the preferred name, with `SUPABASE_SERVICE_ROLE_KEY` as fallback. Consider:
- Standardizing on one name (preferably `SUPABASE_SECRET_API_KEY`)
- Or document that both are accepted for backward compatibility

### 5. COINMARKETCAP_API_KEY
Currently not actively used (code uses DIA Data API instead). You can:
- Remove it if you're not planning to use it
- Or keep it for future use if you plan to switch back

---

## ✅ VARIABLES THAT ARE CORRECTLY PLACED

These variables are properly configured:
- All `NEXT_PUBLIC_*` variables in both local and Vercel
- Server secrets in `.env.local` and Vercel
- Security keys (CRON_SECRET, L402_ROOT_KEY) in both
- API keys in both

---

## 📝 NOTES

1. **NODE_ENV**: Usually set automatically by Node.js/Next.js. You don't need to set it manually unless you're overriding for a specific reason.

2. **SUPABASE_SECRET_API_KEY vs SUPABASE_SERVICE_ROLE_KEY**: Your code supports both with fallback logic. This is fine for backward compatibility, but you could standardize on one.

3. **GOOGLE_MAPS_API_KEY vs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY**: You have both. The code uses:
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for client-side maps
   - `GOOGLE_MAPS_API_KEY` as fallback for server-side geocoding
   This is intentional and correct.

4. **RESEND_FROM_EMAIL**: Used in some routes but not all. The default email library uses a hardcoded "Ganamos <noreply@ganamos.earth>". Consider standardizing.

5. **GITHUB_REPO**: Uses default "brianmurray333/ganamos" if not set. You have `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` in Vercel, but the code expects `GITHUB_REPO` in format "owner/repo".

