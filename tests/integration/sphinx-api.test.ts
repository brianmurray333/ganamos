import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/sphinx/publish-post/route'
import * as sphinxLib from '@/lib/sphinx'
import {
  createSphinxPublishRequest,
  createSphinxPublishRequestRaw,
  minimalValidSphinxPost,
  fullSphinxPost,
  mockSuccessfulSphinxResponse,
  createMockFailureResponse,
  setupSphinxTestEnvironment,
  clearSphinxTestEnvironment,
} from '../helpers/sphinx-test-helpers'

describe('POST /api/sphinx/publish-post', () => {
  let mockPostToSphinx: any

  beforeEach(() => {
    // Setup Sphinx environment variables
    setupSphinxTestEnvironment()

    // Mock postToSphinx function to avoid actual Sphinx API calls
    mockPostToSphinx = vi.spyOn(sphinxLib, 'postToSphinx')
    mockPostToSphinx.mockResolvedValue(mockSuccessfulSphinxResponse)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearSphinxTestEnvironment()
  })

  describe('Request Validation', () => {
    it.each([
      { field: 'title', body: { description: 'Test description', postId: 'test-post-id', reward: 1000 } },
      { field: 'description', body: { title: 'Test Issue', postId: 'test-post-id', reward: 1000 } },
      { field: 'postId', body: { title: 'Test Issue', description: 'Test description', reward: 1000 } },
    ])('should return 400 when $field is missing', async ({ body }) => {
      const request = createSphinxPublishRequest(body)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters: title, description, postId')
      expect(mockPostToSphinx).not.toHaveBeenCalled()
    })

    it('should return 400 when multiple required fields are missing', async () => {
      const request = createSphinxPublishRequest({ location: 'Via Regina' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(mockPostToSphinx).not.toHaveBeenCalled()
    })

    it('should return 400 when reward is missing', async () => {
      const request = createSphinxPublishRequest({
        title: 'Test Issue',
        description: 'Test description',
        postId: 'test-post-id',
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid reward value')
      expect(mockPostToSphinx).not.toHaveBeenCalled()
    })

    it('should return 400 when reward is negative', async () => {
      const request = createSphinxPublishRequest({
        ...minimalValidSphinxPost,
        reward: -100,
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid reward value')
      expect(mockPostToSphinx).not.toHaveBeenCalled()
    })

    it('should return 400 when reward is not a number', async () => {
      const request = createSphinxPublishRequest({
        title: 'Test Issue',
        description: 'Test description',
        postId: 'test-post-id',
        reward: '1000',
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid reward value')
      expect(mockPostToSphinx).not.toHaveBeenCalled()
    })

    it('should accept request with only required fields', async () => {
      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Successful Publishing', () => {
    it('should call postToSphinx with minimal required parameters', async () => {
      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining(minimalValidSphinxPost)
      )
    })

    it('should call postToSphinx with all optional parameters', async () => {
      const request = createSphinxPublishRequest(fullSphinxPost)
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledWith(fullSphinxPost)
    })

    it('should return 200 with success response', async () => {
      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
      })
    })

    it('should return success even with custom Sphinx response', async () => {
      mockPostToSphinx.mockResolvedValueOnce({
        success: true,
        result: {
          message_id: 'custom-msg-id-789',
          chat_pubkey: 'custom-pubkey',
        },
      })

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle undefined optional parameters', async () => {
      const request = createSphinxPublishRequest({
        ...minimalValidSphinxPost,
        location: undefined,
        city: undefined,
        imageUrl: undefined,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({
          ...minimalValidSphinxPost,
          location: undefined,
          city: undefined,
          imageUrl: undefined,
        })
      )
    })
  })

  describe('Publishing Failures', () => {
    it('should return 500 when postToSphinx returns failure', async () => {
      mockPostToSphinx.mockResolvedValueOnce(
        createMockFailureResponse('Sphinx API error: 500 - Internal Server Error')
      )

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Sphinx API error: 500 - Internal Server Error')
    })

    it('should return 500 when postToSphinx throws error', async () => {
      mockPostToSphinx.mockRejectedValueOnce(new Error('Network error'))

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Sphinx')
    })

    it('should handle Sphinx configuration missing error', async () => {
      mockPostToSphinx.mockResolvedValueOnce(
        createMockFailureResponse('Sphinx configuration incomplete in environment variables')
      )

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Sphinx configuration incomplete')
    })

    it('should handle Sphinx API authentication failure', async () => {
      mockPostToSphinx.mockResolvedValueOnce(
        createMockFailureResponse('Sphinx API error: 401 - Unauthorized')
      )

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('401')
    })

    it('should handle Sphinx API rate limiting', async () => {
      mockPostToSphinx.mockResolvedValueOnce(
        createMockFailureResponse('Sphinx API error: 429 - Too Many Requests')
      )

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('429')
    })
  })

  describe('Error Response Format', () => {
    it('should return consistent error structure for validation errors', async () => {
      const request = createSphinxPublishRequest({ title: 'Test Issue' })
      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })

    it('should return consistent error structure for publishing failures', async () => {
      mockPostToSphinx.mockResolvedValueOnce(createMockFailureResponse('Publishing failed'))

      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
    })

    it('should return consistent success structure', async () => {
      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data.success).toBe(true)
    })
  })

  describe('Parameter Forwarding', () => {
    it('should forward reward parameter correctly', async () => {
      const request = createSphinxPublishRequest({ ...minimalValidSphinxPost, reward: 10000 })
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({ reward: 10000 })
      )
    })

    it('should forward location and city parameters correctly', async () => {
      const request = createSphinxPublishRequest({
        ...minimalValidSphinxPost,
        location: 'Via Regina',
        city: 'Como',
      })
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({
          location: 'Via Regina',
          city: 'Como',
        })
      )
    })

    it('should forward imageUrl parameter correctly', async () => {
      const request = createSphinxPublishRequest({
        ...minimalValidSphinxPost,
        imageUrl: 'https://storage.example.com/images/test.jpg',
      })
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://storage.example.com/images/test.jpg',
        })
      )
    })

    it('should forward all parameters together', async () => {
      const request = createSphinxPublishRequest(fullSphinxPost)
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledWith(fullSphinxPost)
    })
  })

  describe('Edge Cases', () => {
    it('should handle malformed JSON request body', async () => {
      const request = createSphinxPublishRequestRaw('invalid json')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Sphinx')
    })

    it('should handle empty request body', async () => {
      const request = createSphinxPublishRequestRaw('{}')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters: title, description, postId')
    })

    it('should handle very long title and description', async () => {
      const longTitle = 'A'.repeat(1000)
      const longDescription = 'B'.repeat(5000)

      const request = createSphinxPublishRequest({
        title: longTitle,
        description: longDescription,
        postId: 'test-post-id',
        reward: 1000,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({
          title: longTitle,
          description: longDescription,
        })
      )
    })

    it('should handle special characters in title and description', async () => {
      const request = createSphinxPublishRequest({
        title: 'Test 🏙️ Issue with émojis & spëcial çhars',
        description: 'Description with\nnewlines and\ttabs',
        postId: 'test-post-id',
        reward: 1000,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle numeric postId', async () => {
      const request = createSphinxPublishRequest({
        title: 'Test Issue',
        description: 'Test description',
        postId: 12345,
        reward: 1000,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 12345,
        })
      )
    })

    it('should handle zero reward value', async () => {
      const request = createSphinxPublishRequest({
        ...minimalValidSphinxPost,
        reward: 0,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({ reward: 0 })
      )
    })

    it('should handle URL with special characters in imageUrl', async () => {
      const imageUrlWithSpecialChars = 'https://example.com/images/test%20image%20(1).jpg?v=123&size=large'

      const request = createSphinxPublishRequest({
        ...minimalValidSphinxPost,
        imageUrl: imageUrlWithSpecialChars,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockPostToSphinx).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: imageUrlWithSpecialChars,
        })
      )
    })
  })

  describe('Integration Behavior', () => {
    it('should call postToSphinx exactly once per request', async () => {
      const request = createSphinxPublishRequest(minimalValidSphinxPost)
      await POST(request)

      expect(mockPostToSphinx).toHaveBeenCalledTimes(1)
    })

    it('should not call postToSphinx if validation fails', async () => {
      const request = createSphinxPublishRequest({ title: 'Only title' })
      await POST(request)

      expect(mockPostToSphinx).not.toHaveBeenCalled()
    })

    it('should handle concurrent requests independently', async () => {
      const request1 = createSphinxPublishRequest({ ...minimalValidSphinxPost, postId: 'post-1' })
      const request2 = createSphinxPublishRequest({ ...minimalValidSphinxPost, postId: 'post-2' })

      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ])

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(data1.success).toBe(true)
      expect(data2.success).toBe(true)
      expect(mockPostToSphinx).toHaveBeenCalledTimes(2)
    })
  })
})