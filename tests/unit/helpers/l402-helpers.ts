/**
 * Helper functions for l402 unit tests
 * Provides test constants and factory functions for macaroon testing
 */

import crypto from 'crypto'
import { Caveat } from '@/lib/l402'

/**
 * Test constants for deterministic macaroon testing
 */
export const TEST_ROOT_KEY = 'test-root-key-for-unit-testing-do-not-use-in-production'
export const TEST_IDENTIFIER = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
export const TEST_LOCATION = 'https://test-api.example.com'
export const TEST_LOCATION_WITH_PATH = 'https://test-api.example.com/api/posts'

/**
 * Standard test caveats
 */
export const TEST_CAVEAT_ACTION: Caveat = {
  condition: 'action',
  value: 'create_post'
}

export const TEST_CAVEAT_AMOUNT: Caveat = {
  condition: 'amount',
  value: '1010'
}

export const TEST_CAVEAT_EXPIRES: Caveat = {
  condition: 'expires',
  value: '1704067200000' // 2024-01-01T00:00:00.000Z
}

/**
 * Standard caveats array for testing
 */
export const TEST_STANDARD_CAVEATS: Caveat[] = [
  TEST_CAVEAT_ACTION,
  TEST_CAVEAT_AMOUNT,
  TEST_CAVEAT_EXPIRES
]

/**
 * Helper function to calculate expected HMAC-SHA256 signature
 * Mirrors the logic in createMacaroon for test validation
 */
export function calculateExpectedSignature(
  identifier: string,
  location: string,
  rootKey: string,
  caveats: Caveat[] = []
): string {
  const data = identifier + location + rootKey + JSON.stringify(caveats)
  return crypto.createHmac('sha256', rootKey).update(data).digest('hex')
}

/**
 * Factory function to create test caveats with custom values
 */
export function createTestCaveat(condition: string, value: string): Caveat {
  return { condition, value }
}

/**
 * Factory function to create test caveats array
 */
export function createTestCaveats(overrides?: Partial<{
  action?: string
  amount?: string
  expires?: string
}>): Caveat[] {
  return [
    { condition: 'action', value: overrides?.action || 'create_post' },
    { condition: 'amount', value: overrides?.amount || '1010' },
    { condition: 'expires', value: overrides?.expires || '1704067200000' }
  ]
}

/**
 * Test constants for edge cases
 */
export const TEST_EMPTY_CAVEATS: Caveat[] = []
export const TEST_IDENTIFIER_WITH_SPECIAL_CHARS = 'test-id-with-special-!@#$%^&*()_+-=[]{}|;:,.<>?'
export const TEST_LOCATION_WITH_SPECIAL_CHARS = 'https://api.example.com/test?param=value&foo=bar#fragment'

/**
 * Alternative root keys for testing different signatures
 */
export const TEST_ROOT_KEY_ALTERNATIVE = 'alternative-root-key-for-signature-testing'
export const TEST_ROOT_KEY_EMPTY = ''

/**
 * Test identifiers for different scenarios
 */
export const TEST_IDENTIFIER_ALTERNATIVE = 'different-payment-hash-for-alternative-tests'
export const TEST_IDENTIFIER_EMPTY = ''

/**
 * Test locations for different scenarios
 */
export const TEST_LOCATION_ALTERNATIVE = 'https://alternative-api.example.com'
export const TEST_LOCATION_EMPTY = ''