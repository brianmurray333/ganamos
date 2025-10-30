# E2E Test Suite: Authentication/Login User Journey

## Overview

This test suite provides comprehensive End-to-End (E2E) testing for the authentication and login flow in the application. The tests are organized following best practices with modular, maintainable code using the Page Object Model pattern.

## Test Structure

```
tests/e2e/
├── auth.spec.ts                    # Main auth test suite
├── homepage.spec.ts                # Homepage tests
├── page-objects/                   # Page Object Model classes
│   ├── HomePage.ts                 # Homepage page object
│   └── LoginPage.ts                # Login page page object
└── helpers/                        # Shared test utilities
    └── test-credentials.ts         # Test data and credentials
```

## Test Coverage

### 1. Homepage to Login Navigation Test
**Test:** `should navigate from homepage to login and attempt email authentication`

- Navigates to homepage
- Clicks the "Log In" link
- Reveals the email login form
- Fills in email and password
- Submits the login form
- Verifies the authentication attempt

### 2. Login Page Direct Access Test
**Test:** `should load login page directly and display all sign-in options`

- Directly navigates to `/auth/login`
- Verifies all sign-in options are visible:
  - Sign in with Google
  - Sign in with Email
  - Sign in with Phone
- Verifies page title and sign-up link

### 3. Email Form Toggle Test
**Test:** `should toggle email form visibility`

- Verifies email form is initially hidden
- Clicks "Sign in with Email" to reveal form
- Verifies form is visible
- Clicks "Back to all sign in options"
- Verifies form is hidden again
- Verifies main options are visible

### 4. Form Validation Test
**Test:** `should disable submit button with empty credentials`

- Verifies submit button is disabled with empty fields
- Tests various combinations:
  - Email only (button disabled)
  - Password only (button disabled)
  - Both fields filled (button enabled)

## Page Objects

### HomePage
**Purpose:** Handles interactions with the landing/homepage

**Methods:**
- `goto()` - Navigate to homepage
- `navigateToLogin()` - Click login link and wait for navigation
- `navigateToSignup()` - Click signup link
- `navigateToMap()` - Click "Earn Bitcoin" button

### LoginPage
**Purpose:** Handles all login page interactions

**Methods:**
- `goto()` - Navigate to login page
- `showEmailForm()` - Click "Sign in with Email" button (with retry logic)
- `fillEmail(email)` - Fill email field
- `fillPassword(password)` - Fill password field
- `submitLogin()` - Submit the login form
- `login(email, password)` - Complete login flow (convenience method)
- `signInWithGoogle()` - Initiate Google OAuth
- `signInWithPhone()` - Navigate to phone auth
- `useMockLogin()` - Use development mock login
- `goBackToOptions()` - Return to main login options
- `assertEmailFormVisible()` - Verify form is displayed
- `assertLoginOptionsVisible()` - Verify main options are displayed
- `assertSuccessfulLogin(path)` - Verify successful navigation after login
- `assertErrorDisplayed()` - Verify error message is shown

## Running Tests

### Run all E2E tests
```bash
npx playwright test tests/e2e/
```

### Run only auth tests
```bash
npx playwright test tests/e2e/auth.spec.ts
```

### Run with a specific browser
```bash
npx playwright test tests/e2e/auth.spec.ts --project=chromium
npx playwright test tests/e2e/auth.spec.ts --project=firefox
npx playwright test tests/e2e/auth.spec.ts --project=webkit
```

### Run in headed mode (see browser)
```bash
npx playwright test tests/e2e/auth.spec.ts --headed
```

### Run with UI mode (interactive)
```bash
npx playwright test tests/e2e/auth.spec.ts --ui
```

### Debug a specific test
```bash
npx playwright test tests/e2e/auth.spec.ts:26 --debug
```

## Best Practices Implemented

### 1. **Page Object Model (POM)**
- Separates page structure from test logic
- Reusable page interactions
- Easier maintenance when UI changes

### 2. **DRY Principles**
- Shared page objects across tests
- Reusable helper functions
- Centralized test data

### 3. **Stable Selectors**
- Uses ID selectors (`#email`, `#password`)
- Falls back to semantic selectors (`a[href="/auth/login"]`)
- Avoids brittle nth-child or positional selectors

### 4. **Built-in Waiting**
- Uses Playwright's automatic waiting
- Explicit waits only where necessary
- Retry logic for flaky interactions

### 5. **Modular Test Data**
- Centralized test credentials in `helpers/test-credentials.ts`
- Easy to update and maintain
- Supports multiple test scenarios

### 6. **Clear Test Structure**
- Descriptive test names
- Step-by-step comments
- Organized with test.describe blocks

## Known Issues & Workarounds

### Flaky Button Clicks
The "Sign in with Email" button click occasionally doesn't trigger the React state update due to timing issues. 

**Workaround:** Implemented retry logic in `LoginPage.showEmailForm()` with up to 3 attempts.

### Homepage Auth Timeout
The homepage has a 3-second authentication check that shows a loading spinner.

**Workaround:** `HomePage.goto()` includes logic to wait for the spinner to disappear and the login link to appear.

## Future Improvements

1. **Add data-testid attributes** to components for more stable selectors
2. **Create authenticated user fixtures** for testing protected routes
3. **Add API mocking** for controlled test scenarios
4. **Implement visual regression testing** with Playwright's screenshot comparison
5. **Add tests for successful login** with valid credentials (requires test user setup)
6. **Test error scenarios** with invalid credentials and network failures

## Maintenance

When updating the application:

1. **UI Changes:** Update the relevant page object selectors
2. **New Features:** Add new methods to page objects
3. **New Flows:** Create new test specs following the existing pattern
4. **Test Data:** Update `helpers/test-credentials.ts` as needed

## Contributing

When adding new E2E tests:

1. Use existing page objects when possible
2. Create new page objects for new pages
3. Follow the naming conventions
4. Add descriptive comments
5. Use stable selectors (prefer IDs and semantic attributes)
6. Avoid hardcoded timeouts unless absolutely necessary
7. Group related tests in `test.describe` blocks
