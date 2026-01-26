/**
 * Test fixtures for base64 image testing
 * Contains minimal valid base64 images (1x1 pixels) and invalid samples
 */

/**
 * Valid 1x1 pixel images in base64 format
 * These are actual valid image data that can be decoded
 */

// 1x1 red pixel JPEG
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k='

// 1x1 blue pixel PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// 1x1 green pixel GIF
const GIF_BASE64 = 'R0lGODlhAQABAPAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='

// 1x1 pixel WebP (red)
const WEBP_BASE64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA='

/**
 * Valid base64 image samples with data URL prefixes
 */
export const VALID_BASE64_SAMPLES = {
  jpeg: {
    withPrefix: `data:image/jpeg;base64,${JPEG_BASE64}`,
    withoutPrefix: JPEG_BASE64,
    mimeType: 'image/jpeg',
    expectedSize: 287, // Actual byte size after decoding
  },
  png: {
    withPrefix: `data:image/png;base64,${PNG_BASE64}`,
    withoutPrefix: PNG_BASE64,
    mimeType: 'image/png',
    expectedSize: 68,
  },
  gif: {
    withPrefix: `data:image/gif;base64,${GIF_BASE64}`,
    withoutPrefix: GIF_BASE64,
    mimeType: 'image/gif',
    expectedSize: 43,
  },
  webp: {
    withPrefix: `data:image/webp;base64,${WEBP_BASE64}`,
    withoutPrefix: WEBP_BASE64,
    mimeType: 'image/webp',
    expectedSize: 44, // Actual byte size after decoding
  },
}

/**
 * Invalid base64 samples that should cause errors
 */
export const INVALID_BASE64_SAMPLES = {
  malformedCharacters: 'data:image/png;base64,!!!invalid!!!',
  invalidCharacters: 'data:image/jpeg;base64,this is not base64',
  withSpaces: 'data:image/png;base64,iVBORw0K Ggo AAAA',
  withNewlines: 'data:image/png;base64,iVBORw0K\nGgoAAAA',
  truncated: 'data:image/jpeg;base64,/9j/4AAQ', // Too short to be valid
  onlyPrefix: 'data:image/png;base64,',
  invalidPadding: 'data:image/png;base64,iVBORw0KGgo=', // Incorrect padding
  nonBase64WithPrefix: 'data:image/jpeg;base64,<html>not base64</html>',
}

/**
 * Edge case samples
 */
export const EDGE_CASE_SAMPLES = {
  emptyString: '',
  onlyComma: ',',
  missingMimeType: 'data:;base64,iVBORw0KGgoAAAA',
  missingBase64Part: 'data:image/png;base64',
  noCommaDelimiter: 'data:image/pngbase64iVBORw0KGgoAAAA',
  multiplePrefixes: 'data:image/png;base64,data:image/jpeg;base64,iVBORw0KGgoAAAA',
  unsupportedMimeType: `data:text/plain;base64,${PNG_BASE64}`,
  withoutDataPrefix: `image/png;base64,${PNG_BASE64}`,
  onlyMimeType: 'data:image/png;',
}

/**
 * Helper: Create a data URL from base64 and MIME type
 */
export function createDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`
}

/**
 * Helper: Calculate expected byte size from base64 string
 * Base64 encoding increases size by ~33%, so decoded size ≈ base64.length * 0.75
 */
export function calculateExpectedByteSize(base64: string): number {
  // Remove padding characters and calculate
  const cleanBase64 = base64.replace(/=/g, '')
  return Math.floor((cleanBase64.length * 3) / 4)
}

/**
 * Helper: Verify Blob has expected properties
 */
export function createBlobExpectation(mimeType: string, minSize: number = 0) {
  return {
    type: mimeType,
    minSize,
  }
}

/**
 * Helper: Extract MIME type from data URL (matches implementation logic)
 */
export function extractMimeType(dataUrl: string): string {
  if (dataUrl.startsWith('data:')) {
    const matches = dataUrl.match(/data:([^;]+);/)
    if (matches && matches[1]) {
      return matches[1]
    }
  }
  return 'image/jpeg' // Default fallback
}

/**
 * Test data for MIME type extraction validation
 */
export const MIME_TYPE_TEST_CASES = [
  { input: 'data:image/jpeg;base64,abc', expected: 'image/jpeg' },
  { input: 'data:image/png;base64,abc', expected: 'image/png' },
  { input: 'data:image/gif;base64,abc', expected: 'image/gif' },
  { input: 'data:image/webp;base64,abc', expected: 'image/webp' },
  { input: 'data:image/svg+xml;base64,abc', expected: 'image/svg+xml' },
  { input: 'abc', expected: 'image/jpeg' }, // No prefix, should default
  { input: 'data:;base64,abc', expected: 'image/jpeg' }, // Empty MIME type
]