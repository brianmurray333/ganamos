# Integration Tests

This directory contains integration tests for API endpoints and database operations.

## Structure

- `child-account-deletion.test.ts` - Integration tests for `/api/delete-child-account` endpoint
- `helpers/` - Shared test utilities and fixtures
  - `child-account-fixtures.ts` - Test data fixtures for parent/child account relationships
  - `api-test-helpers.ts` - Mock Supabase client and request helpers

## Running Tests

```bash
# Run all integration tests
npm run test:unit

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test file
npx vitest run tests/integration/child-account-deletion.test.ts
```

## Test Database Setup

Currently, integration tests use **enhanced mocks** that track state changes in memory. This allows testing without a real database while still verifying:
- Authentication and authorization logic
- Soft-delete behavior (status, timestamps, deleted_by)
- Data consistency (connected_accounts cleanup, profile preservation)
- Edge cases and error handling

### Future: Real Test Database

To use a real Supabase test database instead of mocks:

1. Create a test Supabase project or use Supabase local development
2. Configure test environment variables in `.env.test`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-test-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key
   ```
3. Replace mocks in test files with real Supabase client
4. Add database seeding/cleanup in `beforeEach`/`afterEach` hooks

## Test Coverage

### `/api/delete-child-account` Endpoint

- ✅ Authentication (401 for unauthenticated requests)
- ✅ Authorization (403 for non-owners, 403 when no connection exists)
- ✅ Validation (400 for missing ID, 404 for non-existent accounts, 400 for non-child accounts)
- ✅ Soft Delete (status='deleted', deleted_at timestamp, deleted_by field)
- ✅ Data Consistency (connected_accounts cleanup, auth.users preservation)
- ✅ Edge Cases (already deleted accounts, concurrent deletions, connection cleanup failures)

## Writing New Integration Tests

When adding new integration tests:

1. **Reuse existing fixtures** from `helpers/child-account-fixtures.ts`
2. **Follow Vitest conventions** (globals enabled, describe/it structure)
3. **Use MockDatabaseState** for state tracking in tests
4. **Test the full request-response cycle** (authentication → validation → operation → response)
5. **Verify both success and error paths**
6. **Check data consistency** after operations

Example:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createParentChildFixture } from './helpers/child-account-fixtures'
import { MockDatabaseState } from './helpers/api-test-helpers'

describe('POST /api/my-endpoint', () => {
  let mockDbState: MockDatabaseState

  beforeEach(() => {
    mockDbState = new MockDatabaseState()
  })

  it('should perform expected operation', async () => {
    // Arrange: Set up test data
    const { parent, child } = createParentChildFixture()
    mockDbState.addProfile(parent)
    mockDbState.addProfile(child)

    // Act: Call endpoint
    const response = await POST(request)

    // Assert: Verify results
    expect(response.status).toBe(200)
  })
})
```

## Related Manual Test Scripts

The following manual test scripts in `scripts/` can be used for reference:
- `test-soft-deletion.js` - Manual validation of soft-delete behavior
- `check-charlotte-deletion.js` - Verification of deleted child account metadata
- `restore-charlotte.js` - Restoration of soft-deleted accounts

These scripts demonstrate real database queries and can be adapted into integration tests as needed.