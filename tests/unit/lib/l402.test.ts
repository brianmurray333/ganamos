/**
 * Unit tests for l402.ts - createMacaroon function
 * Tests macaroon generation, HMAC-SHA256 signature, and caveat processing
 */

import { describe, it, expect } from 'vitest'
import { createMacaroon, verifyMacaroon, Macaroon, Caveat } from '@/lib/l402'
import {
  TEST_ROOT_KEY,
  TEST_IDENTIFIER,
  TEST_LOCATION,
  TEST_LOCATION_WITH_PATH,
  TEST_STANDARD_CAVEATS,
  TEST_CAVEAT_ACTION,
  TEST_CAVEAT_AMOUNT,
  TEST_CAVEAT_EXPIRES,
  TEST_EMPTY_CAVEATS,
  TEST_IDENTIFIER_WITH_SPECIAL_CHARS,
  TEST_LOCATION_WITH_SPECIAL_CHARS,
  TEST_ROOT_KEY_ALTERNATIVE,
  TEST_IDENTIFIER_ALTERNATIVE,
  TEST_LOCATION_ALTERNATIVE,
  calculateExpectedSignature,
  createTestCaveat,
  createTestCaveats
} from '../helpers/l402-helpers'

describe('createMacaroon', () => {
  describe('Basic Macaroon Creation', () => {
    it('should create a macaroon with required fields', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)

      expect(macaroon).toBeDefined()
      expect(macaroon.identifier).toBe(TEST_IDENTIFIER)
      expect(macaroon.location).toBe(TEST_LOCATION)
      expect(macaroon.signature).toBeDefined()
      expect(typeof macaroon.signature).toBe('string')
      expect(macaroon.caveats).toEqual([])
    })

    it('should create a macaroon with empty caveats array by default', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)

      expect(Array.isArray(macaroon.caveats)).toBe(true)
      expect(macaroon.caveats.length).toBe(0)
    })

    it('should create a macaroon with provided caveats', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )

      expect(macaroon.caveats).toEqual(TEST_STANDARD_CAVEATS)
      expect(macaroon.caveats.length).toBe(3)
    })

    it('should preserve caveat structure with condition and value', () => {
      const caveats: Caveat[] = [TEST_CAVEAT_ACTION, TEST_CAVEAT_AMOUNT]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)

      expect(macaroon.caveats[0]).toEqual({ condition: 'action', value: 'create_post' })
      expect(macaroon.caveats[1]).toEqual({ condition: 'amount', value: '1010' })
    })
  })

  describe('HMAC-SHA256 Signature Generation', () => {
    it('should generate correct HMAC-SHA256 signature with no caveats', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      const expectedSignature = calculateExpectedSignature(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        []
      )

      expect(macaroon.signature).toBe(expectedSignature)
      expect(macaroon.signature.length).toBe(64) // SHA256 hex is 64 characters
    })

    it('should generate correct HMAC-SHA256 signature with caveats', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      const expectedSignature = calculateExpectedSignature(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )

      expect(macaroon.signature).toBe(expectedSignature)
    })

    it('should generate different signatures for different identifiers', () => {
      const macaroon1 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      const macaroon2 = createMacaroon(TEST_IDENTIFIER_ALTERNATIVE, TEST_LOCATION, TEST_ROOT_KEY)

      expect(macaroon1.signature).not.toBe(macaroon2.signature)
    })

    it('should generate different signatures for different locations', () => {
      const macaroon1 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      const macaroon2 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION_ALTERNATIVE, TEST_ROOT_KEY)

      expect(macaroon1.signature).not.toBe(macaroon2.signature)
    })

    it('should generate different signatures for different root keys', () => {
      const macaroon1 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      const macaroon2 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY_ALTERNATIVE)

      expect(macaroon1.signature).not.toBe(macaroon2.signature)
    })

    it('should generate different signatures for different caveats', () => {
      const caveats1: Caveat[] = [TEST_CAVEAT_ACTION]
      const caveats2: Caveat[] = [TEST_CAVEAT_ACTION, TEST_CAVEAT_AMOUNT]
      
      const macaroon1 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats1)
      const macaroon2 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats2)

      expect(macaroon1.signature).not.toBe(macaroon2.signature)
    })

    it('should generate signature as lowercase hexadecimal string', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      
      expect(macaroon.signature).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('Round-Trip Validation with verifyMacaroon', () => {
    it('should create a macaroon that passes verifyMacaroon with correct root key', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      
      const isValid = verifyMacaroon(macaroon, TEST_ROOT_KEY)
      
      expect(isValid).toBe(true)
    })

    it('should create a macaroon with caveats that passes verifyMacaroon', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      
      const isValid = verifyMacaroon(macaroon, TEST_ROOT_KEY)
      
      expect(isValid).toBe(true)
    })

    it('should fail verifyMacaroon when using wrong root key', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      
      const isValid = verifyMacaroon(macaroon, TEST_ROOT_KEY_ALTERNATIVE)
      
      expect(isValid).toBe(false)
    })

    it('should fail verifyMacaroon when signature is tampered', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      const tamperedMacaroon: Macaroon = {
        ...macaroon,
        signature: 'tampered-signature-0000000000000000000000000000000000000000000000'
      }
      
      const isValid = verifyMacaroon(tamperedMacaroon, TEST_ROOT_KEY)
      
      expect(isValid).toBe(false)
    })

    it('should fail verifyMacaroon when identifier is tampered', () => {
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
      const tamperedMacaroon: Macaroon = {
        ...macaroon,
        identifier: 'tampered-identifier'
      }
      
      const isValid = verifyMacaroon(tamperedMacaroon, TEST_ROOT_KEY)
      
      expect(isValid).toBe(false)
    })

    it('should fail verifyMacaroon when caveats are tampered', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      const tamperedMacaroon: Macaroon = {
        ...macaroon,
        caveats: [createTestCaveat('action', 'tampered_action')]
      }
      
      const isValid = verifyMacaroon(tamperedMacaroon, TEST_ROOT_KEY)
      
      expect(isValid).toBe(false)
    })
  })

  describe('Standard Caveats Processing', () => {
    it('should correctly process action caveat', () => {
      const caveats: Caveat[] = [TEST_CAVEAT_ACTION]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(macaroon.caveats[0]).toEqual({ condition: 'action', value: 'create_post' })
    })

    it('should correctly process amount caveat', () => {
      const caveats: Caveat[] = [TEST_CAVEAT_AMOUNT]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(macaroon.caveats[0]).toEqual({ condition: 'amount', value: '1010' })
    })

    it('should correctly process expires caveat', () => {
      const caveats: Caveat[] = [TEST_CAVEAT_EXPIRES]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(macaroon.caveats[0]).toEqual({ condition: 'expires', value: '1704067200000' })
    })

    it('should process all standard caveats (action, amount, expires)', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      
      expect(macaroon.caveats.length).toBe(3)
      expect(macaroon.caveats[0].condition).toBe('action')
      expect(macaroon.caveats[1].condition).toBe('amount')
      expect(macaroon.caveats[2].condition).toBe('expires')
    })

    it('should preserve caveat order', () => {
      const caveats: Caveat[] = [
        TEST_CAVEAT_EXPIRES,
        TEST_CAVEAT_ACTION,
        TEST_CAVEAT_AMOUNT
      ]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(macaroon.caveats[0].condition).toBe('expires')
      expect(macaroon.caveats[1].condition).toBe('action')
      expect(macaroon.caveats[2].condition).toBe('amount')
    })

    it('should handle custom caveat conditions', () => {
      const customCaveats: Caveat[] = [
        createTestCaveat('custom_condition', 'custom_value'),
        createTestCaveat('another_condition', 'another_value')
      ]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, customCaveats)
      
      expect(macaroon.caveats[0]).toEqual({ condition: 'custom_condition', value: 'custom_value' })
      expect(macaroon.caveats[1]).toEqual({ condition: 'another_condition', value: 'another_value' })
    })

    it('should handle large caveat values', () => {
      const largeCaveats: Caveat[] = [
        createTestCaveat('amount', '999999999999'),
        createTestCaveat('expires', '9999999999999')
      ]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, largeCaveats)
      
      expect(macaroon.caveats[0].value).toBe('999999999999')
      expect(macaroon.caveats[1].value).toBe('9999999999999')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty caveats array', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_EMPTY_CAVEATS
      )
      
      expect(macaroon.caveats).toEqual([])
      expect(macaroon.signature).toBeDefined()
    })

    it('should handle identifier with special characters', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER_WITH_SPECIAL_CHARS,
        TEST_LOCATION,
        TEST_ROOT_KEY
      )
      
      expect(macaroon.identifier).toBe(TEST_IDENTIFIER_WITH_SPECIAL_CHARS)
      expect(macaroon.signature).toBeDefined()
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle location with special characters and query params', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION_WITH_SPECIAL_CHARS,
        TEST_ROOT_KEY
      )
      
      expect(macaroon.location).toBe(TEST_LOCATION_WITH_SPECIAL_CHARS)
      expect(macaroon.signature).toBeDefined()
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle location with path segments', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION_WITH_PATH,
        TEST_ROOT_KEY
      )
      
      expect(macaroon.location).toBe(TEST_LOCATION_WITH_PATH)
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle caveat values with special characters', () => {
      const specialCaveats: Caveat[] = [
        createTestCaveat('action', 'create_post!@#$%'),
        createTestCaveat('note', 'Test with "quotes" and \'apostrophes\'')
      ]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, specialCaveats)
      
      expect(macaroon.caveats[0].value).toBe('create_post!@#$%')
      expect(macaroon.caveats[1].value).toBe('Test with "quotes" and \'apostrophes\'')
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle caveat values with unicode characters', () => {
      const unicodeCaveats: Caveat[] = [
        createTestCaveat('action', 'create_post_😀'),
        createTestCaveat('note', '日本語テスト中文测试')
      ]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, unicodeCaveats)
      
      expect(macaroon.caveats[0].value).toBe('create_post_😀')
      expect(macaroon.caveats[1].value).toBe('日本語テスト中文测试')
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle caveat with empty value string', () => {
      const caveats: Caveat[] = [createTestCaveat('action', '')]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(macaroon.caveats[0].value).toBe('')
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle caveat with empty condition string', () => {
      const caveats: Caveat[] = [createTestCaveat('', 'some_value')]
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(macaroon.caveats[0].condition).toBe('')
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle very long identifier', () => {
      const longIdentifier = 'a'.repeat(1000)
      const macaroon = createMacaroon(longIdentifier, TEST_LOCATION, TEST_ROOT_KEY)
      
      expect(macaroon.identifier).toBe(longIdentifier)
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle very long location', () => {
      const longLocation = 'https://example.com/' + 'path/'.repeat(100)
      const macaroon = createMacaroon(TEST_IDENTIFIER, longLocation, TEST_ROOT_KEY)
      
      expect(macaroon.location).toBe(longLocation)
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })

    it('should handle many caveats', () => {
      const manyCaveats: Caveat[] = Array.from({ length: 50 }, (_, i) => 
        createTestCaveat(`condition_${i}`, `value_${i}`)
      )
      const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, manyCaveats)
      
      expect(macaroon.caveats.length).toBe(50)
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
    })
  })

  describe('Deterministic Behavior', () => {
    it('should generate identical macaroons for identical inputs', () => {
      const macaroon1 = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      const macaroon2 = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      
      expect(macaroon1.identifier).toBe(macaroon2.identifier)
      expect(macaroon1.location).toBe(macaroon2.location)
      expect(macaroon1.signature).toBe(macaroon2.signature)
      expect(macaroon1.caveats).toEqual(macaroon2.caveats)
    })

    it('should generate consistent signatures across multiple calls', () => {
      const signatures = new Set<string>()
      
      for (let i = 0; i < 10; i++) {
        const macaroon = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY)
        signatures.add(macaroon.signature)
      }
      
      expect(signatures.size).toBe(1) // All signatures should be identical
    })

    it('should not mutate the input caveats array', () => {
      const caveats: Caveat[] = [...TEST_STANDARD_CAVEATS]
      const caveatsSnapshot = JSON.parse(JSON.stringify(caveats))
      
      createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats)
      
      expect(caveats).toEqual(caveatsSnapshot)
    })
  })

  describe('Cryptographic Properties', () => {
    it('should generate unique signatures for different inputs', () => {
      const testCases = [
        { id: 'id1', loc: 'loc1', key: 'key1' },
        { id: 'id2', loc: 'loc1', key: 'key1' },
        { id: 'id1', loc: 'loc2', key: 'key1' },
        { id: 'id1', loc: 'loc1', key: 'key2' }
      ]
      
      const signatures = testCases.map(tc => 
        createMacaroon(tc.id, tc.loc, tc.key).signature
      )
      
      const uniqueSignatures = new Set(signatures)
      expect(uniqueSignatures.size).toBe(testCases.length)
    })

    it('should produce signature that depends on caveat order', () => {
      const caveats1: Caveat[] = [TEST_CAVEAT_ACTION, TEST_CAVEAT_AMOUNT]
      const caveats2: Caveat[] = [TEST_CAVEAT_AMOUNT, TEST_CAVEAT_ACTION]
      
      const macaroon1 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats1)
      const macaroon2 = createMacaroon(TEST_IDENTIFIER, TEST_LOCATION, TEST_ROOT_KEY, caveats2)
      
      expect(macaroon1.signature).not.toBe(macaroon2.signature)
    })

    it('should produce valid signature that verifies with correct key', () => {
      const macaroon = createMacaroon(
        TEST_IDENTIFIER,
        TEST_LOCATION,
        TEST_ROOT_KEY,
        TEST_STANDARD_CAVEATS
      )
      
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY)).toBe(true)
      expect(verifyMacaroon(macaroon, TEST_ROOT_KEY_ALTERNATIVE)).toBe(false)
      expect(verifyMacaroon(macaroon, 'wrong-key')).toBe(false)
    })
  })
})