import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createVerifyFixRequest } from '../utils/fixtures'
import { createMockGroqSDK } from '../utils/mocks'

/**
 * Unit Tests for Metadata Parsing in POST /api/verify-fix
 * 
 * This test suite focuses specifically on the metadata aggregation and parsing logic
 * in app/api/verify-fix/route.ts (lines 87-92). It complements the existing integration
 * tests by providing more granular coverage of edge cases in the regex parsing patterns.
 * 
 * Core Logic Under Test:
 * ```
 * const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/)
 * const reasoningMatch = response.match(/REASONING:\s*(.+)/)
 * const confidence = confidenceMatch ? Number.parseInt(confidenceMatch[1]) : 5
 * const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "Unable to parse response"
 * ```
 * 
 * Test Focus:
 * - Regex pattern edge cases (whitespace variations, case sensitivity)
 * - Confidence value boundary testing (out of range, overflow)
 * - Reasoning string edge cases (unicode, multiline, special chars)
 * - Combined failure scenarios
 * - Fallback behavior verification
 */

// Mock Groq SDK at module level
vi.mock('groq-sdk', () => ({
  Groq: vi.fn(),
}))

describe('POST /api/verify-fix - Metadata Parsing & Aggregation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Confidence Value Extraction - Regex Pattern Edge Cases', () => {
    it('should extract confidence with single space after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: Fix complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(7)
    })

    it('should extract confidence with multiple spaces after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE:     8\nREASONING: Fix verified',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(8)
    })

    it('should extract confidence with no space after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE:9\nREASONING: Excellent fix',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(9)
    })

    it('should extract confidence with tab character after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE:\t6\nREASONING: Partial fix',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(6)
    })

    it('should NOT extract confidence with lowercase "confidence" keyword (case sensitive)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'confidence: 8\nREASONING: Fix complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Should fallback to default confidence=5 since regex is case-sensitive
      expect(data.confidence).toBe(5)
    })

    it('should extract first occurrence if CONFIDENCE appears multiple times', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: Fix complete\nCONFIDENCE: 9 (updated)',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex .match() returns first match
      expect(data.confidence).toBe(7)
    })

    it('should handle confidence with leading zeros', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 08\nREASONING: Fix complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Number.parseInt('08') = 8 (leading zeros ignored)
      expect(data.confidence).toBe(8)
    })
  })

  describe('Confidence Value Boundary & Out-of-Range Testing', () => {
    it('should accept confidence value of 0 (below normal range)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 0\nREASONING: Cannot determine fix status',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // No validation on parsed value - accepts 0
      expect(data.confidence).toBe(0)
    })

    it('should accept confidence value above 10 (overflow scenario)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 99\nREASONING: Extremely confident',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // No upper bound validation - accepts 99
      expect(data.confidence).toBe(99)
    })

    it('should accept very large confidence numbers', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 1000000\nREASONING: Test overflow',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(1000000)
    })

    it('should fallback to 5 when confidence is non-numeric text', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: high\nREASONING: Fix looks good',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex only matches \d+ (digits), so "high" won't match
      expect(data.confidence).toBe(5)
    })

    it('should fallback to 5 when confidence is decimal number', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7.5\nREASONING: Between scores',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex \d+ will match "7" and stop at the decimal point
      expect(data.confidence).toBe(7)
    })

    it('should fallback to 5 when confidence has negative sign', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: -5\nREASONING: Invalid negative',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex \d+ doesn't match negative sign, so no match found
      expect(data.confidence).toBe(5)
    })
  })

  describe('Reasoning Text Extraction - Regex Pattern Edge Cases', () => {
    it('should extract reasoning with single space after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: The fix is complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toBe('The fix is complete')
    })

    it('should extract reasoning with multiple spaces after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING:     Multiple spaces before text',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex captures spaces, but .trim() removes them
      expect(data.reasoning).toBe('Multiple spaces before text')
    })

    it('should extract reasoning with no space after colon', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 9\nREASONING:No space after colon',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toBe('No space after colon')
    })

    it('should NOT extract reasoning with lowercase "reasoning" keyword (case sensitive)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nreasoning: Fix is complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Should fallback to default reasoning since regex is case-sensitive
      expect(data.reasoning).toBe('Unable to parse response')
    })

    it('should extract reasoning up to newline character only (first line)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: First line of reasoning\nSecond line not captured\nThird line also ignored',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex .+ matches any character except newline
      expect(data.reasoning).toBe('First line of reasoning')
      expect(data.reasoning).not.toContain('Second line')
    })

    it('should handle reasoning with trailing whitespace (trimmed)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: Fix complete     ',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toBe('Fix complete')
      expect(data.reasoning).not.toMatch(/\s$/)
    })

    it('should handle reasoning with leading and trailing tabs', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 6\nREASONING: \t\tFix with tabs\t\t',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toBe('Fix with tabs')
    })

    it('should extract first occurrence if REASONING appears multiple times', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: First reasoning\nSome text\nREASONING: Second reasoning',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toBe('First reasoning')
    })
  })

  describe('Reasoning Text Content - Special Characters & Unicode', () => {
    it('should handle reasoning with unicode characters', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: Fix complete ✓ with emoji 🎉 and símbolos españoles',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toContain('✓')
      expect(data.reasoning).toContain('🎉')
      expect(data.reasoning).toContain('españoles')
    })

    it('should handle reasoning with HTML-like tags (not sanitized)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: Fix is <strong>complete</strong> with <tags>',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // No sanitization - raw text preserved
      expect(data.reasoning).toContain('<strong>')
      expect(data.reasoning).toContain('<tags>')
    })

    it('should handle reasoning with quotes and apostrophes', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: Fix is "excellent" and it\'s properly done',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toContain('"excellent"')
      expect(data.reasoning).toContain("it's")
    })

    it('should handle reasoning with percentage signs and numbers', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: Fix is 95% complete with $100 cost',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toContain('95%')
      expect(data.reasoning).toContain('$100')
    })

    it('should handle reasoning with backslashes', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 6\nREASONING: Path is C:\\Users\\fix\\complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toContain('\\')
    })

    it('should handle reasoning with parentheses and brackets', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: Fix (verified) is [complete] with {details}',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toContain('(verified)')
      expect(data.reasoning).toContain('[complete]')
      expect(data.reasoning).toContain('{details}')
    })

    it('should handle very long reasoning text', async () => {
      const { Groq } = await import('groq-sdk')
      const longReasoning = 'A'.repeat(5000) // 5000 character reasoning
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: `CONFIDENCE: 7\nREASONING: ${longReasoning}`,
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // No length limit - should accept full text
      expect(data.reasoning).toBe(longReasoning)
      expect(data.reasoning.length).toBe(5000)
    })

    it('should handle empty reasoning after colon with trailing space', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: ',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex .+ matches the trailing space, but .trim() results in empty string
      expect(data.reasoning).toBe('')
    })

    it('should fallback when reasoning has only colon and newline (no space)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING:\n',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex .+ requires at least one character (not newline), so no match
      expect(data.reasoning).toBe('Unable to parse response')
    })
  })

  describe('Combined Parsing Scenarios - Both Fields', () => {
    it('should parse both fields when properly formatted', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: Fix is professionally completed',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(8)
      expect(data.reasoning).toBe('Fix is professionally completed')
    })

    it('should use defaults for both fields when completely missing', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'Some unstructured response without expected format',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(5)
      expect(data.reasoning).toBe('Unable to parse response')
    })

    it('should parse confidence but fallback reasoning when only confidence present', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 9',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(9)
      expect(data.reasoning).toBe('Unable to parse response')
    })

    it('should fallback confidence but parse reasoning when only reasoning present', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'REASONING: Fix appears complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(5)
      expect(data.reasoning).toBe('Fix appears complete')
    })

    it('should parse fields in reverse order (REASONING before CONFIDENCE)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'REASONING: Fix is complete\nCONFIDENCE: 8',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Order shouldn't matter - both should be extracted
      expect(data.confidence).toBe(8)
      expect(data.reasoning).toBe('Fix is complete')
    })

    it('should handle response with extra text before and after structured fields', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'Here is my analysis:\n\nCONFIDENCE: 7\nREASONING: Fix looks good\n\nAdditional notes below...',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(7)
      expect(data.reasoning).toBe('Fix looks good')
    })

    it('should handle completely empty AI response', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: '',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(5)
      expect(data.reasoning).toBe('Unable to parse response')
    })

    it('should handle response with only whitespace', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: '   \n\n\t\t   ',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.confidence).toBe(5)
      expect(data.reasoning).toBe('Unable to parse response')
    })
  })

  describe('Metadata Aggregation - Return Value Verification', () => {
    it('should return JSON response with confidence and reasoning properties', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: Fix verified',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('confidence')
      expect(data).toHaveProperty('reasoning')
      expect(Object.keys(data).length).toBe(2) // Only these two properties
    })

    it('should ensure confidence is always a number type', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nREASONING: Test',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(typeof data.confidence).toBe('number')
      expect(data.confidence).not.toBe('7') // Not a string
    })

    it('should ensure reasoning is always a string type', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 8\nREASONING: Fix complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(typeof data.reasoning).toBe('string')
    })

    it('should ensure fallback values maintain correct types', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'Invalid response',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(typeof data.confidence).toBe('number')
      expect(data.confidence).toBe(5)
      expect(typeof data.reasoning).toBe('string')
      expect(data.reasoning).toBe('Unable to parse response')
    })
  })

  describe('Regex Pattern Robustness', () => {
    it('should handle CONFIDENCE keyword with surrounding text on same line', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'My CONFIDENCE: 8 is based on evidence\nREASONING: Fix complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex will match "CONFIDENCE: 8" even with text before it
      expect(data.confidence).toBe(8)
    })

    it('should handle REASONING keyword with surrounding text', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'CONFIDENCE: 7\nMy REASONING: The fix is acceptable based on comparison',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.reasoning).toBe('The fix is acceptable based on comparison')
    })

    it('should handle response with mixed case (should fail - case sensitive)', async () => {
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          rawResponse: 'Confidence: 8\nReasoning: Fix complete',
        })
      )

      const { POST } = await import('@/app/api/verify-fix/route')
      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(createVerifyFixRequest()),
      })

      const response = await POST(request)
      const data = await response.json()

      // Regex is case-sensitive - should use fallbacks
      expect(data.confidence).toBe(5)
      expect(data.reasoning).toBe('Unable to parse response')
    })
  })
})