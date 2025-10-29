# Integration Tests for Child Account Creation

## Overview

This directory contains integration tests for the `/api/child-account` endpoint. These tests use a **real Supabase database** (not mocks) to validate the complete child account creation workflow.

## What's Tested

### Child Account Creation Workflow (5 Steps)
1. **Authentication**: Session validation and primary_user_id extraction
2. **Credential Generation**: UUID-based email (`child-{uuid}@ganamos.app`), random password
3. **Auth User Creation**: Service role creation with metadata flags
4. **Profile Creation**: Upsert with username slug, initial balance
5. **Account Linking**: `connected_accounts` relationship creation

### Test Coverage
- ✅ Happy path: Full creation workflow succeeds
- ✅ Email pattern validation: UUID-based `child-*@ganamos.app`
- ✅ Username generation: Slug creation (lowercase, hyphens, max 20 chars)
- ✅ Balance initialization: Child accounts start with 0 balance
- ✅ Metadata validation: `is_child_account=true`, `primary_user_id` set
- ✅ Linking verification: `connected_accounts` table relationships
- ✅ Idempotency: Duplicate prevention (upsert profile, unique constraints)
- ✅ RLS policies: Parent access to child data via `connected_accounts`
- ✅ Error handling: Invalid inputs, authentication failures

## Setup Instructions

### 1. Create Test Database

**Option A: Separate Supabase Test Project (Recommended for CI/CD)**
```bash
# Create a new Supabase project specifically for testing
# Copy all migrations from your production database
# Get credentials from project settings
```

**Option B: Local Supabase Instance (Recommended for Development)**
```bash
# Install Supabase CLI
npm install -g supabase

# Initialize local Supabase
supabase init

# Start local Supabase
supabase start

# This will output local database credentials
```

### 2. Configure Environment Variables

```bash
# Copy the example file
cp .env.test.example .env.test

# Edit .env.test with your test database credentials
# NEVER use production credentials in tests!
```

Example `.env.test`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-test-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key
```

### 3. Run Migrations on Test Database

Ensure your test database has the same schema as production:
- `profiles` table
- `connected_accounts` table
- `auth.users` (Supabase managed)
- RLS policies for family account management

### 4. Run Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run with watch mode (useful during development)
npm run test:watch tests/integration

# Run with coverage
npm run test:coverage tests/integration
```

## Test Utilities

### `tests/utils/test-helpers.ts`

Provides reusable utilities for integration testing:

#### Client Creation
```typescript
import { createTestAdminClient, createTestAuthClient } from '../utils/test-helpers'

// Admin client with service role (bypasses RLS)
const adminClient = createTestAdminClient()

// Authenticated client (subject to RLS)
const authClient = createTestAuthClient()
```

#### Test Data Factories
```typescript
import { createTestParentUser, createTestChildAccount } from '../utils/test-helpers'

// Create parent user for testing
const parent = await createTestParentUser(adminClient, {
  email: 'test@example.com',
  name: 'Test Parent',
  username: 'testparent'
})

// Create child account
const child = await createTestChildAccount(adminClient, parent.userId, {
  displayName: 'Test Child',
  avatarUrl: 'https://example.com/avatar.png'
})
```

#### Database Cleanup
```typescript
import { deleteTestUser, cleanupTestUsers } from '../utils/test-helpers'

// Delete specific test user
await deleteTestUser(adminClient, userId)

// Cleanup all test users (by email pattern)
await cleanupTestUsers(adminClient)
```

#### Verification Helpers
```typescript
import { verifyChildAccountCreation } from '../utils/test-helpers'

// Verify complete child account setup
const verification = await verifyChildAccountCreation(
  adminClient,
  childUserId,
  parentUserId,
  displayName
)

// Returns: { authUser, profile, connection }
```

## Best Practices

### Test Isolation
- Each test creates its own data
- `afterEach` cleanup ensures no test pollution
- Use unique identifiers (timestamps) for test data

### Real Database Operations
- Tests use actual Supabase database
- No mocked responses (validates real RLS policies)
- Catches production issues early

### Manual Script Conversion
These tests replace manual scripts:
- `scripts/test-activities-rls.js` → RLS policy validation
- `scripts/test-account-switching.js` → Activity isolation
- `scripts/test-soft-deletion.js` → Deletion workflows
- `scripts/balance-check.js` → Balance integrity

### CI/CD Integration
```yaml
# .github/workflows/ci.yml
- name: Run Integration Tests
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SERVICE_ROLE_KEY }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_ANON_KEY }}
  run: npm run test:integration
```

## Troubleshooting

### Error: Missing environment variables
```
Missing required test environment variables: NEXT_PUBLIC_SUPABASE_URL
```
**Solution**: Create `.env.test` file with test database credentials

### Error: Failed to create test parent user
```
Failed to create test parent user: Invalid API key
```
**Solution**: Verify `SUPABASE_SERVICE_ROLE_KEY` is correct and has admin permissions

### Error: RLS policy prevents access
```
Failed to verify connection: new row violates row-level security policy
```
**Solution**: Check that test database has correct RLS policies applied

### Tests run slowly
**Solution**: Use local Supabase instance instead of remote test project

## Next Steps

1. **Add E2E Tests**: Test actual API endpoint with HTTP requests
2. **Add Deletion Tests**: Convert `test-soft-deletion.js` to automated tests
3. **Add Activity Tests**: Convert `test-account-switching.js` to automated tests
4. **Add Balance Tests**: Convert `balance-check.js` to automated tests
5. **Add RLS Tests**: Convert `test-activities-rls.js` to automated tests

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Supabase Testing Guide](https://supabase.com/docs/guides/testing)
- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Child Account Endpoint Implementation](../../app/api/child-account/route.ts)