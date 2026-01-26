import { describe, it, expect } from 'vitest'

/**
 * Unit tests for the 'Me' function from axios.min.js (v1.13.2)
 * 
 * Function signature: function Me(e){return e&&String(e).trim().toLowerCase()}
 * 
 * Purpose: String normalization utility used by axios for normalizing headers and properties
 * in HTTP request/response processing. NOT the main HTTP request handler.
 * 
 * Note: Since this is a minified function in an external dependency (axios),
 * we test it through its observable behavior. The function name 'Me' is the
 * minified identifier in axios v1.13.2.
 */

// Since axios.min.js is minified, we need to import the actual axios library
// and test the equivalent functionality through axios's public API or by
// recreating the function behavior for testing purposes.
// For testing the minified function directly, we'll recreate its implementation.

/**
 * Recreation of the 'Me' function from axios.min.js for testing purposes
 * This matches the minified implementation: function Me(e){return e&&String(e).trim().toLowerCase()}
 */
const Me = (e: any): string | undefined | null | false => {
  return e && String(e).trim().toLowerCase()
}

describe('axios Me function - String Normalization Utility', () => {
  describe('Null and Undefined Handling', () => {
    it('should return falsy when input is null', () => {
      const result = Me(null)
      expect(result).toBeFalsy()
      expect(result).toBe(null)
    })

    it('should return falsy when input is undefined', () => {
      const result = Me(undefined)
      expect(result).toBeFalsy()
      expect(result).toBe(undefined)
    })

    it('should return falsy when input is false', () => {
      const result = Me(false)
      expect(result).toBeFalsy()
      expect(result).toBe(false)
    })

    it('should return falsy when input is 0', () => {
      const result = Me(0)
      expect(result).toBeFalsy()
      expect(result).toBe(0)
    })
  })

  describe('String Trimming', () => {
    it('should trim leading whitespace', () => {
      const result = Me('   hello')
      expect(result).toBe('hello')
    })

    it('should trim trailing whitespace', () => {
      const result = Me('hello   ')
      expect(result).toBe('hello')
    })

    it('should trim both leading and trailing whitespace', () => {
      const result = Me('   hello   ')
      expect(result).toBe('hello')
    })

    it('should trim tabs and newlines', () => {
      const result = Me('\t\nHello\n\t')
      expect(result).toBe('hello')
    })

    it('should preserve internal whitespace', () => {
      const result = Me('  hello   world  ')
      expect(result).toBe('hello   world')
    })
  })

  describe('Case Conversion', () => {
    it('should convert uppercase to lowercase', () => {
      const result = Me('HELLO')
      expect(result).toBe('hello')
    })

    it('should convert mixed case to lowercase', () => {
      const result = Me('HeLLo WoRLd')
      expect(result).toBe('hello world')
    })

    it('should leave lowercase strings unchanged', () => {
      const result = Me('hello')
      expect(result).toBe('hello')
    })

    it('should handle strings that are already lowercase', () => {
      const result = Me('content-type')
      expect(result).toBe('content-type')
    })
  })

  describe('Edge Cases', () => {
    it('should return empty string when input is empty string', () => {
      const result = Me('')
      expect(result).toBe('')
    })

    it('should return empty string when input is whitespace-only', () => {
      const result = Me('   ')
      expect(result).toBe('')
    })

    it('should handle special characters', () => {
      const result = Me('Content-Type: application/json')
      expect(result).toBe('content-type: application/json')
    })

    it('should handle numbers by converting to string', () => {
      const result = Me(123)
      expect(result).toBe('123')
    })

    it('should handle negative numbers', () => {
      const result = Me(-456)
      expect(result).toBe('-456')
    })

    it('should handle decimal numbers', () => {
      const result = Me(3.14159)
      expect(result).toBe('3.14159')
    })

    it('should handle boolean true by converting to string', () => {
      const result = Me(true)
      expect(result).toBe('true')
    })

    it('should handle objects by converting to string', () => {
      const result = Me({ key: 'value' })
      expect(result).toBe('[object object]')
    })

    it('should handle arrays by converting to string', () => {
      const result = Me(['a', 'b', 'c'])
      expect(result).toBe('a,b,c')
    })
  })

  describe('HTTP Header Normalization Context', () => {
    it('should normalize HTTP header names (Content-Type)', () => {
      const result = Me('Content-Type')
      expect(result).toBe('content-type')
    })

    it('should normalize HTTP header names (Authorization)', () => {
      const result = Me('AUTHORIZATION')
      expect(result).toBe('authorization')
    })

    it('should normalize HTTP header names with spaces', () => {
      const result = Me('  X-Custom-Header  ')
      expect(result).toBe('x-custom-header')
    })

    it('should normalize Accept header', () => {
      const result = Me('ACCEPT')
      expect(result).toBe('accept')
    })

    it('should normalize User-Agent header', () => {
      const result = Me('User-Agent')
      expect(result).toBe('user-agent')
    })
  })

  describe('Error Scenario Context', () => {
    it('should not throw error on null input', () => {
      expect(() => Me(null)).not.toThrow()
    })

    it('should not throw error on undefined input', () => {
      expect(() => Me(undefined)).not.toThrow()
    })

    it('should not throw error on complex objects', () => {
      const complexObject = { nested: { deep: { value: 'test' } } }
      expect(() => Me(complexObject)).not.toThrow()
    })

    it('should not throw error on circular reference objects', () => {
      const circular: any = { key: 'value' }
      circular.self = circular
      expect(() => Me(circular)).not.toThrow()
    })
  })

  describe('Usage in Axios Request/Response Pipeline', () => {
    it('should normalize request header names for consistent comparison', () => {
      const headerName1 = Me('Content-Type')
      const headerName2 = Me('content-type')
      const headerName3 = Me('CONTENT-TYPE')
      
      expect(headerName1).toBe(headerName2)
      expect(headerName2).toBe(headerName3)
      expect(headerName1).toBe('content-type')
    })

    it('should handle header values with mixed casing', () => {
      const result = Me('Application/JSON')
      expect(result).toBe('application/json')
    })

    it('should normalize property names for axios config', () => {
      const propName = Me('  ResponseType  ')
      expect(propName).toBe('responsetype')
    })
  })

  describe('Performance and Immutability', () => {
    it('should not mutate the input when input is a string', () => {
      const input = '  HELLO  '
      const result = Me(input)
      
      expect(input).toBe('  HELLO  ') // Original unchanged
      expect(result).toBe('hello')
    })

    it('should handle large strings efficiently', () => {
      const largeString = 'A'.repeat(10000)
      const result = Me(largeString)
      
      expect(result).toBe('a'.repeat(10000))
      expect(result.length).toBe(10000)
    })

    it('should handle Unicode characters', () => {
      const result = Me('  CAFÉ  ')
      expect(result).toBe('café')
    })

    it('should handle emoji and special Unicode', () => {
      const result = Me('  HELLO 👋  ')
      expect(result).toBe('hello 👋')
    })
  })
})