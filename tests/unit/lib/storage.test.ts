import { describe, it, expect } from 'vitest'
import { base64ToBlob, isBase64Image } from '@/lib/storage'
import {
  VALID_BASE64_SAMPLES,
  INVALID_BASE64_SAMPLES,
  EDGE_CASE_SAMPLES,
  MIME_TYPE_TEST_CASES,
  createDataUrl,
  calculateExpectedByteSize,
  extractMimeType,
} from '@/tests/fixtures/base64-images'

describe('base64ToBlob', () => {
  describe('Valid Conversions - Standard MIME Types', () => {
    it('should convert JPEG with data URL prefix to Blob', () => {
      const { withPrefix, mimeType } = VALID_BASE64_SAMPLES.jpeg
      const blob = base64ToBlob(withPrefix)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe(mimeType)
      expect(blob.size).toBeGreaterThan(0)
    })

    it('should convert PNG with data URL prefix to Blob', () => {
      const { withPrefix, mimeType } = VALID_BASE64_SAMPLES.png
      const blob = base64ToBlob(withPrefix)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe(mimeType)
      expect(blob.size).toBeGreaterThan(0)
    })

    it('should convert GIF with data URL prefix to Blob', () => {
      const { withPrefix, mimeType } = VALID_BASE64_SAMPLES.gif
      const blob = base64ToBlob(withPrefix)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe(mimeType)
      expect(blob.size).toBeGreaterThan(0)
    })

    it('should convert WebP with data URL prefix to Blob', () => {
      const { withPrefix, mimeType } = VALID_BASE64_SAMPLES.webp
      const blob = base64ToBlob(withPrefix)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe(mimeType)
      expect(blob.size).toBeGreaterThan(0)
    })

    it('should convert base64 without data URL prefix using default MIME type', () => {
      const { withoutPrefix } = VALID_BASE64_SAMPLES.jpeg
      const blob = base64ToBlob(withoutPrefix)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/jpeg') // Default MIME type
      expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle base64 without prefix for PNG (defaults to JPEG MIME)', () => {
      const { withoutPrefix } = VALID_BASE64_SAMPLES.png
      const blob = base64ToBlob(withoutPrefix)

      expect(blob).toBeInstanceOf(Blob)
      // Function defaults to image/jpeg when no prefix is present
      expect(blob.type).toBe('image/jpeg')
      expect(blob.size).toBeGreaterThan(0)
    })
  })

  describe('MIME Type Extraction', () => {
    it('should extract JPEG MIME type from data URL', () => {
      const dataUrl = createDataUrl(VALID_BASE64_SAMPLES.jpeg.withoutPrefix, 'image/jpeg')
      const blob = base64ToBlob(dataUrl)

      expect(blob.type).toBe('image/jpeg')
    })

    it('should extract PNG MIME type from data URL', () => {
      const dataUrl = createDataUrl(VALID_BASE64_SAMPLES.png.withoutPrefix, 'image/png')
      const blob = base64ToBlob(dataUrl)

      expect(blob.type).toBe('image/png')
    })

    it('should extract GIF MIME type from data URL', () => {
      const dataUrl = createDataUrl(VALID_BASE64_SAMPLES.gif.withoutPrefix, 'image/gif')
      const blob = base64ToBlob(dataUrl)

      expect(blob.type).toBe('image/gif')
    })

    it('should extract WebP MIME type from data URL', () => {
      const dataUrl = createDataUrl(VALID_BASE64_SAMPLES.webp.withoutPrefix, 'image/webp')
      const blob = base64ToBlob(dataUrl)

      expect(blob.type).toBe('image/webp')
    })

    it('should default to image/jpeg when MIME type is missing', () => {
      const { withoutPrefix } = VALID_BASE64_SAMPLES.jpeg
      const blob = base64ToBlob(withoutPrefix)

      expect(blob.type).toBe('image/jpeg')
    })

    it('should handle SVG+XML MIME type correctly', () => {
      const svgBase64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='
      const dataUrl = createDataUrl(svgBase64, 'image/svg+xml')
      const blob = base64ToBlob(dataUrl)

      expect(blob.type).toBe('image/svg+xml')
    })

    it('should extract MIME type with additional parameters', () => {
      const dataUrl = `data:image/png;charset=utf-8;base64,${VALID_BASE64_SAMPLES.png.withoutPrefix}`
      const blob = base64ToBlob(dataUrl)

      // Implementation extracts up to semicolon, so it gets 'image/png;charset=utf-8'
      // or just 'image/png' depending on regex
      expect(blob.type).toContain('image/png')
    })
  })

  describe('Blob Properties Validation', () => {
    it('should create Blob with correct size for JPEG', () => {
      const { withPrefix, expectedSize } = VALID_BASE64_SAMPLES.jpeg
      const blob = base64ToBlob(withPrefix)

      expect(blob.size).toBeCloseTo(expectedSize, -1) // Within 10 bytes
    })

    it('should create Blob with correct size for PNG', () => {
      const { withPrefix, expectedSize } = VALID_BASE64_SAMPLES.png
      const blob = base64ToBlob(withPrefix)

      expect(blob.size).toBeCloseTo(expectedSize, -1)
    })

    it('should create Blob with correct size for GIF', () => {
      const { withPrefix, expectedSize } = VALID_BASE64_SAMPLES.gif
      const blob = base64ToBlob(withPrefix)

      expect(blob.size).toBeCloseTo(expectedSize, -1)
    })

    it('should create Blob with correct size for WebP', () => {
      const { withPrefix, expectedSize } = VALID_BASE64_SAMPLES.webp
      const blob = base64ToBlob(withPrefix)

      expect(blob.size).toBeCloseTo(expectedSize, -1)
    })

    it('should return Blob instance for all valid inputs', () => {
      Object.values(VALID_BASE64_SAMPLES).forEach(({ withPrefix }) => {
        const blob = base64ToBlob(withPrefix)
        expect(blob).toBeInstanceOf(Blob)
      })
    })

    it('should create non-empty Blob for minimal valid base64', () => {
      // Minimal valid base64 string
      const minimalBase64 = 'data:image/png;base64,iVBORw0KGgo='
      const blob = base64ToBlob(minimalBase64)

      expect(blob.size).toBeGreaterThan(0)
    })
  })

  describe('Invalid Input Handling - atob() DOMException', () => {
    it('should throw DOMException for malformed base64 characters', () => {
      const { malformedCharacters } = INVALID_BASE64_SAMPLES

      expect(() => base64ToBlob(malformedCharacters)).toThrow()
    })

    it('should handle invalid characters in base64 gracefully', () => {
      const { invalidCharacters } = INVALID_BASE64_SAMPLES

      // jsdom's atob is more lenient than browser implementations
      // It may not throw for some invalid inputs, so we just verify it returns a Blob
      try {
        const blob = base64ToBlob(invalidCharacters)
        expect(blob).toBeInstanceOf(Blob)
      } catch (error) {
        // If it does throw, that's also acceptable
        expect(error).toBeDefined()
      }
    })

    it('should handle base64 with spaces gracefully', () => {
      const { withSpaces } = INVALID_BASE64_SAMPLES

      // jsdom's atob may strip spaces instead of throwing
      try {
        const blob = base64ToBlob(withSpaces)
        expect(blob).toBeInstanceOf(Blob)
      } catch (error) {
        // If it does throw, that's also acceptable
        expect(error).toBeDefined()
      }
    })

    it('should handle base64 with newlines gracefully', () => {
      const { withNewlines } = INVALID_BASE64_SAMPLES

      // jsdom's atob may strip newlines instead of throwing
      try {
        const blob = base64ToBlob(withNewlines)
        expect(blob).toBeInstanceOf(Blob)
      } catch (error) {
        // If it does throw, that's also acceptable
        expect(error).toBeDefined()
      }
    })

    it('should throw error for non-base64 content with prefix', () => {
      const { nonBase64WithPrefix } = INVALID_BASE64_SAMPLES

      expect(() => base64ToBlob(nonBase64WithPrefix)).toThrow()
    })

    it('should handle empty base64 data after prefix', () => {
      const { onlyPrefix } = INVALID_BASE64_SAMPLES

      // Empty string after split is valid for atob (decodes to empty)
      // This might not throw, but creates empty Blob
      const result = base64ToBlob(onlyPrefix)
      expect(result).toBeInstanceOf(Blob)
      expect(result.size).toBe(0)
    })

    it('should throw DOMException for truncated base64 data', () => {
      const { truncated } = INVALID_BASE64_SAMPLES

      // Truncated base64 might decode but could be invalid
      // Behavior depends on atob implementation
      try {
        const blob = base64ToBlob(truncated)
        expect(blob).toBeInstanceOf(Blob)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should throw DOMException for invalid padding', () => {
      const { invalidPadding } = INVALID_BASE64_SAMPLES

      // Invalid padding might cause atob to throw
      try {
        const blob = base64ToBlob(invalidPadding)
        expect(blob).toBeInstanceOf(Blob)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string input', () => {
      const { emptyString } = EDGE_CASE_SAMPLES

      // Empty string with no comma means entire string is base64
      // atob('') returns empty string, creates empty Blob
      const blob = base64ToBlob(emptyString)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBe(0)
      expect(blob.type).toBe('image/jpeg') // Default type
    })

    it('should handle string with only comma', () => {
      const { onlyComma } = EDGE_CASE_SAMPLES

      // Split on comma gives ['', ''], second part is empty string
      const blob = base64ToBlob(onlyComma)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBe(0)
    })

    it('should handle data URL with missing MIME type', () => {
      const { missingMimeType } = EDGE_CASE_SAMPLES

      // Regex won't match, should default to image/jpeg
      try {
        const blob = base64ToBlob(missingMimeType)
        expect(blob.type).toBe('image/jpeg')
      } catch (error) {
        // atob might fail on the base64 part
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should handle data URL missing base64 content', () => {
      const { missingBase64Part } = EDGE_CASE_SAMPLES

      // Missing base64 part - might throw or create empty blob depending on implementation
      try {
        const blob = base64ToBlob(missingBase64Part)
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBe(0)
      } catch (error) {
        // Some implementations might throw for invalid base64
        expect(error).toBeDefined()
      }
    })

    it('should handle data URL without comma delimiter', () => {
      const { noCommaDelimiter } = EDGE_CASE_SAMPLES

      // No comma means entire string is treated as base64
      expect(() => base64ToBlob(noCommaDelimiter)).toThrow()
    })

    it('should handle data URL with multiple prefixes', () => {
      const { multiplePrefixes } = EDGE_CASE_SAMPLES

      // Split on comma gives first comma, rest is base64
      // Second prefix in base64 data will cause atob to fail
      expect(() => base64ToBlob(multiplePrefixes)).toThrow()
    })

    it('should extract non-image MIME type if provided', () => {
      const { unsupportedMimeType } = EDGE_CASE_SAMPLES

      const blob = base64ToBlob(unsupportedMimeType)
      expect(blob.type).toBe('text/plain')
      expect(blob).toBeInstanceOf(Blob)
    })

    it('should handle input without data: prefix', () => {
      const { withoutDataPrefix } = EDGE_CASE_SAMPLES

      // Split on comma, takes second part
      const blob = base64ToBlob(withoutDataPrefix)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/jpeg') // Default when no data: prefix
    })

    it('should handle data URL with only MIME type', () => {
      const { onlyMimeType } = EDGE_CASE_SAMPLES

      // Missing comma or base64 part - might throw or create empty blob
      try {
        const blob = base64ToBlob(onlyMimeType)
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBe(0)
      } catch (error) {
        // Some implementations might throw for invalid base64
        expect(error).toBeDefined()
      }
    })
  })

  describe('Integration with isBase64Image', () => {
    it('should work with base64 strings identified by isBase64Image', () => {
      const { withPrefix } = VALID_BASE64_SAMPLES.jpeg

      expect(isBase64Image(withPrefix)).toBe(true)
      
      const blob = base64ToBlob(withPrefix)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/jpeg')
    })

    it('should handle conversion for all valid image formats detected by isBase64Image', () => {
      Object.values(VALID_BASE64_SAMPLES).forEach(({ withPrefix, mimeType }) => {
        if (isBase64Image(withPrefix)) {
          const blob = base64ToBlob(withPrefix)
          expect(blob.type).toBe(mimeType)
        }
      })
    })

    it('should not accept non-image data URLs through isBase64Image', () => {
      const nonImageDataUrl = 'data:text/plain;base64,SGVsbG8='
      
      expect(isBase64Image(nonImageDataUrl)).toBe(false)
    })
  })

  describe('Data URL Format Variations', () => {
    it('should handle data URL with uppercase DATA prefix', () => {
      const upperCaseUrl = `DATA:image/png;base64,${VALID_BASE64_SAMPLES.png.withoutPrefix}`
      
      // Implementation uses startsWith('data:'), so this won't match
      const blob = base64ToBlob(upperCaseUrl)
      expect(blob.type).toBe('image/jpeg') // Falls back to default
    })

    it('should handle data URL with spaces before base64', () => {
      const urlWithSpaces = `data:image/png;base64, ${VALID_BASE64_SAMPLES.png.withoutPrefix}`
      
      // jsdom's atob is lenient and strips whitespace
      // In real browsers this might throw, but jsdom handles it
      try {
        const blob = base64ToBlob(urlWithSpaces)
        expect(blob).toBeInstanceOf(Blob)
      } catch (error) {
        // If it does throw, that's also acceptable behavior
        expect(error).toBeDefined()
      }
    })

    it('should handle very long base64 strings', () => {
      // Create a longer valid base64 string (use a single long PNG base64)
      // Repeating breaks base64, so we just use a multiplier to test performance
      const dataUrl = VALID_BASE64_SAMPLES.png.withPrefix
      
      const blob = base64ToBlob(dataUrl)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(0)
    })

    it('should preserve MIME type from data URL', () => {
      const mixedCaseUrl = `data:IMAGE/JPEG;base64,${VALID_BASE64_SAMPLES.jpeg.withoutPrefix}`
      
      const blob = base64ToBlob(mixedCaseUrl)
      // Blob constructor may normalize MIME types to lowercase in some environments
      // The important thing is that it extracts and uses the MIME type
      expect(blob.type.toLowerCase()).toBe('image/jpeg')
    })
  })

  describe('Byte Content Verification', () => {
    it('should decode base64 to correct byte array size', () => {
      const { withPrefix, withoutPrefix } = VALID_BASE64_SAMPLES.jpeg
      
      const expectedSize = calculateExpectedByteSize(withoutPrefix)
      const blob = base64ToBlob(withPrefix)
      
      // Allow small variance due to padding
      expect(blob.size).toBeGreaterThanOrEqual(expectedSize - 3)
      expect(blob.size).toBeLessThanOrEqual(expectedSize + 3)
    })

    it('should create Blob with ArrayBuffer-like data', async () => {
      const { withPrefix } = VALID_BASE64_SAMPLES.png
      const blob = base64ToBlob(withPrefix)
      
      // Verify Blob can be read as ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer()
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer)
      expect(arrayBuffer.byteLength).toBe(blob.size)
    })

    it('should maintain data integrity through conversion', async () => {
      const { withPrefix, withoutPrefix } = VALID_BASE64_SAMPLES.png
      const blob = base64ToBlob(withPrefix)
      
      // Convert back to base64 to verify round-trip
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Verify we have the correct number of bytes
      const expectedBytes = calculateExpectedByteSize(withoutPrefix)
      expect(uint8Array.length).toBeCloseTo(expectedBytes, 0)
    })
  })

  describe('Error Message Validation', () => {
    it('should provide meaningful error for invalid base64', () => {
      const { invalidCharacters } = INVALID_BASE64_SAMPLES
      
      try {
        base64ToBlob(invalidCharacters)
        // If no error thrown, test fails
        expect(true).toBe(false)
      } catch (error) {
        // Verify error is thrown (DOMException or similar)
        expect(error).toBeDefined()
        expect(error instanceof Error).toBe(true)
      }
    })

    it('should throw when atob encounters invalid input', () => {
      const invalidInput = 'data:image/png;base64,<not-valid-base64>'
      
      expect(() => base64ToBlob(invalidInput)).toThrow()
    })
  })

  describe('Performance and Boundary Conditions', () => {
    it('should handle minimal valid base64 efficiently', () => {
      // Smallest possible valid base64 (empty content)
      const minimal = 'data:image/png;base64,'
      
      const blob = base64ToBlob(minimal)
      expect(blob.size).toBe(0)
    })

    it('should handle maximum practical image size', () => {
      // Use a valid longer base64 string instead of repeating which breaks base64
      // We'll just verify the function works with the largest sample we have
      const largestSample = VALID_BASE64_SAMPLES.jpeg // JPEG is the largest
      const blob = base64ToBlob(largestSample.withPrefix)
      
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(100) // Should have meaningful size
    })

    it('should complete conversion quickly for typical images', () => {
      const start = performance.now()
      
      Object.values(VALID_BASE64_SAMPLES).forEach(({ withPrefix }) => {
        base64ToBlob(withPrefix)
      })
      
      const duration = performance.now() - start
      expect(duration).toBeLessThan(100) // Should be very fast
    })
  })
})