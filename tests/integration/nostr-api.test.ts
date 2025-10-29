import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/nostr/publish-post/route'
import * as nostrLib from '@/lib/nostr'
import {
  createNostrPublishRequest,
  createNostrPublishRequestRaw,
  minimalValidNostrPost,
  fullNostrPost,
  mockSuccessfulNostrResponse,
  createMockFailureResponse,
} from '../helpers/nostr-test-helpers'

describe('POST /api/nostr/publish-post', () => {
  let mockPostToNostr: any

  beforeEach(() => {
    // Mock postToNostr function to avoid actual Nostr calls
    mockPostToNostr = vi.spyOn(nostrLib, 'postToNostr')
    mockPostToNostr.mockResolvedValue(mockSuccessfulNostrResponse)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Request Validation', () => {
    it('should return 400 when title is missing', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
      expect(mockPostToNostr).not.toHaveBeenCalled()
    })

    it('should return 400 when description is missing', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
      expect(mockPostToNostr).not.toHaveBeenCalled()
    })

    it('should return 400 when postId is missing', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
      expect(mockPostToNostr).not.toHaveBeenCalled()
    })

    it('should return 400 when multiple required fields are missing', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Via Regina',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(mockPostToNostr).not.toHaveBeenCalled()
    })

    it('should accept request with only required fields', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Successful Publishing', () => {
    it('should call postToNostr with minimal required parameters', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        })
      )
    })

    it('should call postToNostr with all optional parameters', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          location: 'Via Regina',
          city: 'Como',
          latitude: 45.8081,
          longitude: 9.0852,
          reward: 5000,
          postId: 'test-post-id',
          imageUrl: 'https://example.com/image.jpg',
        }),
      })

      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith({
        title: 'Test Issue',
        description: 'Test description',
        location: 'Via Regina',
        city: 'Como',
        latitude: 45.8081,
        longitude: 9.0852,
        reward: 5000,
        postId: 'test-post-id',
        imageUrl: 'https://example.com/image.jpg',
      })
    })

    it('should return 200 with success response', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        eventId: 'mock-event-id',
        relaysPublished: 5,
      })
    })

    it('should return eventId from postToNostr result', async () => {
      mockPostToNostr.mockResolvedValueOnce({
        success: true,
        eventId: 'custom-event-id-12345',
        relaysPublished: 3,
        relaysFailed: 2,
      })

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.eventId).toBe('custom-event-id-12345')
      expect(data.relaysPublished).toBe(3)
    })

    it('should handle undefined optional parameters', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
          location: undefined,
          city: undefined,
          latitude: undefined,
          longitude: undefined,
          reward: undefined,
          imageUrl: undefined,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
          location: undefined,
          city: undefined,
          latitude: undefined,
          longitude: undefined,
          reward: undefined,
          imageUrl: undefined,
        })
      )
    })
  })

  describe('Publishing Failures', () => {
    it('should return 500 when postToNostr returns failure', async () => {
      mockPostToNostr.mockResolvedValueOnce({
        success: false,
        error: 'All relays failed',
      })

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('All relays failed')
    })

    it('should return 500 when postToNostr throws error', async () => {
      mockPostToNostr.mockRejectedValueOnce(new Error('Network error'))

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Nostr')
    })

    it('should handle NOSTR_PRIVATE_KEY not configured error', async () => {
      mockPostToNostr.mockResolvedValueOnce({
        success: false,
        error: 'NOSTR_PRIVATE_KEY not configured in environment variables',
      })

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('NOSTR_PRIVATE_KEY')
    })

    it('should handle relay publishing failures gracefully', async () => {
      mockPostToNostr.mockResolvedValueOnce({
        success: false,
        error: 'Failed to publish to Nostr relays',
        relaysPublished: 0,
        relaysFailed: 5,
      })

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })
  })

  describe('Error Response Format', () => {
    it('should return consistent error structure for validation errors', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })

    it('should return consistent error structure for publishing failures', async () => {
      mockPostToNostr.mockResolvedValueOnce({
        success: false,
        error: 'Publishing failed',
      })

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
    })

    it('should return consistent success structure', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('eventId')
      expect(data).toHaveProperty('relaysPublished')
      expect(data.success).toBe(true)
      expect(typeof data.eventId).toBe('string')
      expect(typeof data.relaysPublished).toBe('number')
    })
  })

  describe('Parameter Forwarding', () => {
    it('should forward reward parameter correctly', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
          reward: 10000,
        }),
      })

      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          reward: 10000,
        })
      )
    })

    it('should forward geolocation parameters correctly', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
          latitude: 45.8081,
          longitude: 9.0852,
        }),
      })

      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 45.8081,
          longitude: 9.0852,
        })
      )
    })

    it('should forward imageUrl parameter correctly', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 'test-post-id',
          imageUrl: 'https://storage.example.com/images/test.jpg',
        }),
      })

      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://storage.example.com/images/test.jpg',
        })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle malformed JSON request body', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Nostr')
    })

    it('should handle empty request body', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should handle very long title and description', async () => {
      const longTitle = 'A'.repeat(1000)
      const longDescription = 'B'.repeat(5000)

      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: longTitle,
          description: longDescription,
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          title: longTitle,
          description: longDescription,
        })
      )
    })

    it('should handle special characters in title and description', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test 🏙️ Issue with émojis & spëcial çhars',
          description: 'Description with\nnewlines and\ttabs',
          postId: 'test-post-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle numeric postId', async () => {
      const request = new Request('http://localhost:3457/api/nostr/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Issue',
          description: 'Test description',
          postId: 12345,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 12345,
        })
      )
    })
  })
})