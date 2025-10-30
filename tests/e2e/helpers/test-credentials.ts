/**
 * Test data and credentials for E2E authentication tests
 */

export interface TestCredentials {
  email: string
  password: string
}

/**
 * Valid test credentials for successful login scenarios
 */
export const VALID_TEST_USER: TestCredentials = {
  email: 'test@example.com',
  password: 'TestPassword123!',
}

/**
 * Invalid test credentials for error scenarios
 */
export const INVALID_TEST_USER: TestCredentials = {
  email: 'invalid@example.com',
  password: 'WrongPassword123!',
}

/**
 * Malformed credentials for validation testing
 */
export const MALFORMED_CREDENTIALS = {
  INVALID_EMAIL: {
    email: 'not-an-email',
    password: 'SomePassword123!',
  },
  EMPTY_EMAIL: {
    email: '',
    password: 'SomePassword123!',
  },
  EMPTY_PASSWORD: {
    email: 'test@example.com',
    password: '',
  },
  BOTH_EMPTY: {
    email: '',
    password: '',
  },
}
