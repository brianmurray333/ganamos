import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createVerifyFixRequest } from '../mocks'

/**
 * Unit tests for POST /api/verify-fix endpoint
 * 
 * Tests cover:
 * - Request validation (missing required fields)
 * - Successful AI verification (confidence + reasoning)
 * - AI service failures (500 errors)
 * - Response parsing (regex extraction, fallback logic)
 * 
 * Note: This endpoint does not interact with the database. It only:
 * 1. Validates request fields (beforeImage, afterImage, description)
 * 2. Calls Groq AI service via wrapper for image analysis
 * 3. Parses and returns confidence score + reasoning
 */

// Mock the groq-wrapper module to avoid any HTTP calls or SDK initialization
const mockCreateChatCompletion = vi.fn()

vi.mock('@/lib/groq-wrapper', () => ({
  createChatCompletion: mockCreateChatCompletion,
}))

// Helper to create mock AI responses
function createMockAIResponse(confidence: number, reasoning: string) {
  return {
    choices: [
      {
        message: {
          content: `CONFIDENCE: ${confidence}\nREASONING: ${reasoning}`,
        },
      },
    ],
  }
}

describe('POST /api/verify-fix - Unit Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Request Validation', () => {
    it('should return 400 when beforeImage is missing', async () => {
      // Arrange
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
      expect(mockCreateChatCompletion).not.toHaveBeenCalled()
    })

    it('should return 400 when afterImage is missing', async () => {
      // Arrange
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
      expect(mockCreateChatCompletion).not.toHaveBeenCalled()
    })

    it('should return 400 when description is missing', async () => {
      // Arrange
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
      expect(mockCreateChatCompletion).not.toHaveBeenCalled()
    })

    it('should accept request when title is missing (title is optional)', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(8, 'Issue appears fixed')
      )

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
      expect(mockCreateChatCompletion).toHaveBeenCalledOnce()
    })
  })

  describe('Successful AI Verification', () => {
    it('should return high confidence score (9) with reasoning', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(9, 'Issue clearly fixed. The after image shows the problem has been completely resolved.')
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
      expect(data.confidence).toBe(9)
      expect(data.reasoning).toContain('Issue clearly fixed')
      expect(data.reasoning).toBeTruthy()
      expect(mockCreateChatCompletion).toHaveBeenCalledOnce()
    })

    it('should return medium confidence score (7) with reasoning', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(7, 'Issue appears to be fixed with reasonable confidence.')
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
      expect(data.confidence).toBe(7)
      expect(data.reasoning).toContain('reasonable confidence')
    })

    it('should return low confidence score (4) with reasoning', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(4, 'Unable to confirm fix. The after image is unclear or does not show the problem area.')
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
      expect(data.confidence).toBe(4)
      expect(data.reasoning).toContain('Unable to confirm fix')
    })

    it('should handle confidence score at boundary (1)', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(1, 'Issue clearly NOT fixed')
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
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(10, 'Issue perfectly fixed with complete confidence')
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
      mockCreateChatCompletion.mockRejectedValueOnce(
        new Error('AI service temporarily unavailable')
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
      expect(data.details).toContain('AI service')
      expect(data.errorType).toBe('Error')
    })

    it('should return 500 with detailed error information on API failure', async () => {
      // Arrange
      mockCreateChatCompletion.mockRejectedValueOnce(
        new Error('Network timeout after 30 seconds')
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
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(8, 'Issue appears fixed')
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
      const customReasoning = 'The street light is now functioning properly based on the after image'
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(9, customReasoning)
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
      mockCreateChatCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'This is a malformed response without proper formatting',
            },
          },
        ],
      })

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
      expect(data.reasoning).toBe('Unable to parse response')
    })

    it('should handle AI response missing reasoning field', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'CONFIDENCE: 6\nSome text but no REASONING label',
            },
          },
        ],
      })

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
      expect(data.reasoning).toBe('Unable to parse response') // Fallback reasoning
    })

    it('should trim whitespace from parsed reasoning', async () => {
      // Arrange
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(8, '   Issue fixed with spaces   ')
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
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(9, 'Issue clearly fixed')
      )

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
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(9, 'Issue clearly fixed')
      )

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
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(9, 'Issue clearly fixed')
      )

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
      mockCreateChatCompletion.mockResolvedValueOnce(
        createMockAIResponse(8, 'Issue appears fixed')
      )

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
