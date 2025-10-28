# Integration Tests

This directory contains integration tests for API endpoints and external service integrations.

## Setup

Integration tests use Vitest and mock external dependencies like LND REST API calls.

### Running Tests

```bash
# Run all tests
npm test

# Run only integration tests
npm run test:unit -- tests/integration

# Run specific test file
npm run test:unit -- tests/integration/api/admin/node-balance.test.ts

# Watch mode for development
npm run test:watch -- tests/integration

# View test UI
npm run test:ui
```

## Test Structure

```
tests/
├── integration/
│   ├── api/
│   │   └── admin/
│   │       └── node-balance.test.ts
│   └── README.md (this file)
└── setup.ts
```

## Writing Integration Tests

### Admin API Endpoints

Admin endpoints require authentication using `CRON_SECRET` environment variable:

```typescript
const createMockRequest = (authToken?: string): NextRequest => {
  const headers = new Headers()
  if (authToken !== undefined) {
    headers.set('authorization', authToken)
  }
  return new NextRequest('http://localhost:3457/api/admin/endpoint', {
    method: 'GET',
    headers
  })
}

// Test with valid auth
const request = createMockRequest('Bearer test-secret-123')

// Test without auth (should fail)
const requestNoAuth = createMockRequest()
```

### Mocking External APIs

Mock external dependencies using Vitest's `vi.mock()`:

```typescript
import * as lightning from '../../../lib/lightning'

vi.mock('../../../lib/lightning', () => ({
  lndRequest: vi.fn()
}))

// In tests:
const mockLndRequest = vi.mocked(lightning.lndRequest)
mockLndRequest.mockResolvedValueOnce({
  success: true,
  data: { balance: '100000' }
})
```

### Test Coverage Requirements

Each API endpoint should have tests for:

1. **Authentication** - Verify authorization requirements
2. **Success Path** - Valid responses with expected data
3. **Error Handling** - External API failures, network errors, invalid data
4. **Edge Cases** - Zero values, large values, missing fields
5. **Response Format** - Correct structure and content types

## Environment Variables

Tests should set up mock environment variables in `beforeEach`:

```typescript
beforeEach(() => {
  process.env = {
    ...originalEnv,
    CRON_SECRET: 'test-secret-123',
    LND_REST_URL: 'https://test-lnd.example.com',
    LND_ADMIN_MACAROON: 'test-macaroon'
  }
})
```

## Best Practices

1. **Independent Tests** - Each test should be self-contained and not depend on others
2. **Clear Test Names** - Use descriptive names that explain what's being tested
3. **Mock External Services** - Never make real API calls in tests
4. **Reset State** - Use `beforeEach` and `afterEach` to reset mocks and environment
5. **Test Observable Behavior** - Focus on API responses, not internal implementation