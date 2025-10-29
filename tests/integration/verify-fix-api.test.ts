import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createVerifyFixRequest } from '../utils/fixtures'
import {
  createMockGroqSDK,
  mockHighConfidenceResponse,
  mockLowConfidenceResponse,
  mockMediumConfidenceResponse,
  mockAIServiceFailure,
  mockMalformedResponse,
  mockResponseMissingReasoning,
} from '../utils/mocks'

/**
 * Integration tests for POST /api/verify-fix endpoint
 * 
 * Tests cover:
 * - Request validation (missing required fields)
 * - Successful AI verification (confidence + reasoning)
 * - AI service failures (500 errors)
 * - Response parsing (regex extraction, fallback logic)
 * 
 * Note: This endpoint does not interact with the database. It only:
 * 1. Validates request fields (beforeImage, afterImage, description)
 * 2. Calls Groq AI service for image analysis
 * 3. Parses and returns confidence score + reasoning
 */

// Mock Groq SDK at module level
vi.mock('groq-sdk', () => ({
  Groq: vi.fn(),
}))

describe('POST /api/verify-fix - Integration Tests', () => {
  afterEach(() => {
    // Clean up mocks and reset modules after each test
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Request Validation', () => {
    it('should return 400 when beforeImage is missing', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const requestPayload = createVerifyFixRequest({ beforeImage: undefined })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('Missing required fields')
      expect(data.error).toContain('beforeImage')
    })

    it('should return 400 when afterImage is missing', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const requestPayload = createVerifyFixRequest({ afterImage: undefined })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('Missing required fields')
      expect(data.error).toContain('afterImage')
    })

    it('should return 400 when description is missing', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const requestPayload = createVerifyFixRequest({ description: undefined })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toContain('Missing required fields')
      expect(data.error).toContain('description')
    })

    it('should accept request when title is missing (title is optional)', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const requestPayload = createVerifyFixRequest({ title: undefined })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(200)
    })
  })

  describe('Successful AI Verification', () => {
    it('should return high confidence score (9) with reasoning', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(9)
      expect(data.reasoning).toContain('Issue clearly fixed')
      expect(data.reasoning).toBeTruthy()
    })

    it('should return medium confidence score (7) with reasoning', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockMediumConfidenceResponse())

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(7)
      expect(data.reasoning).toContain('reasonable confidence')
    })

    it('should return low confidence score (4) with reasoning', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockLowConfidenceResponse())

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(4)
      expect(data.reasoning).toContain('Unable to confirm fix')
    })

    it('should handle confidence score at boundary (1)', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          confidence: 1,
          reasoning: 'Issue clearly NOT fixed',
        })
      )

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(1)
      expect(data.reasoning).toContain('NOT fixed')
    })

    it('should handle confidence score at boundary (10)', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          confidence: 10,
          reasoning: 'Issue perfectly fixed with complete confidence',
        })
      )

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(10)
      expect(data.reasoning).toContain('perfectly fixed')
    })
  })

  describe('AI Service Failures', () => {
    it('should return 500 when AI service is unavailable', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockAIServiceFailure())

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to verify fix with AI')
      expect(data.details).toContain('AI service')
      expect(data.errorType).toBe('Error')
    })

    it('should return 500 with detailed error information on API failure', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          shouldFail: true,
          failureMessage: 'Network timeout after 30 seconds',
        })
      )

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to verify fix with AI')
      expect(data.details).toContain('timeout')
    })
  })

  describe('Response Parsing', () => {
    it('should parse confidence using regex from AI response', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          confidence: 8,
          reasoning: 'Issue appears fixed',
        })
      )

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(data.confidence).toBe(8)
      expect(typeof data.confidence).toBe('number')
    })

    it('should parse reasoning using regex from AI response', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      const customReasoning = 'The street light is now functioning properly based on the after image'
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          confidence: 9,
          reasoning: customReasoning,
        })
      )

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(data.reasoning).toBe(customReasoning)
    })

    it('should fallback to confidence=5 when AI response is malformed', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockMalformedResponse())

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(5) // Fallback value
      expect(data.reasoning).toBeTruthy()
    })

    it('should handle AI response missing reasoning field', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockResponseMissingReasoning())

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(6) // Should still parse confidence
      expect(data.reasoning).toBeTruthy() // Should have fallback reasoning
    })

    it('should trim whitespace from parsed reasoning', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() =>
        createMockGroqSDK({
          confidence: 8,
          reasoning: '   Issue fixed with spaces   ',
        })
      )

      const requestPayload = createVerifyFixRequest()
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(data.reasoning).toBe('Issue fixed with spaces')
      expect(data.reasoning).not.toMatch(/^\s/)
      expect(data.reasoning).not.toMatch(/\s$/)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long descriptions', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const longDescription = 'a'.repeat(10000) // 10,000 character description
      const requestPayload = createVerifyFixRequest({ description: longDescription })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - should handle long descriptions without error
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(9)
    })

    it('should handle special characters in description and title', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const specialCharsDescription = 'Issue with $pecial ch@rs: <tag> & "quotes" & \'apostrophes\' & émojis 🔥'
      const specialCharsTitle = 'Test & "Title" with \'quotes\' & émojis 💡'
      
      const requestPayload = createVerifyFixRequest({
        description: specialCharsDescription,
        title: specialCharsTitle,
      })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - should handle special characters without error
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(9)
    })

    it('should handle data URL images (base64 encoded)', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      
      const requestPayload = createVerifyFixRequest({
        beforeImage: base64Image,
        afterImage: base64Image,
      })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - should accept base64 images
      expect(response.status).toBe(200)
      expect(data.confidence).toBe(9)
    })

    it('should handle empty string title (treated as missing)', async () => {
      // Arrange
      const { Groq } = await import('groq-sdk')
      ;(Groq as any).mockImplementation(() => mockHighConfidenceResponse())

      const requestPayload = createVerifyFixRequest({ title: '' })
      const { POST } = await import('@/app/api/verify-fix/route')

      const request = new NextRequest('http://localhost:3000/api/verify-fix', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)

      // Assert - empty title is acceptable (title is optional)
      expect(response.status).toBe(200)
    })
  })
})