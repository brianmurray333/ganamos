import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '@/app/api/nostr/publish-post/route'
import { POST as POST_SETUP_PROFILE } from '@/app/api/nostr/setup-profile/route'
import * as nostrLib from '@/lib/nostr'
import {
  createNostrPublishRequest,
  createNostrPublishRequestRaw,
  minimalValidNostrPost,
  fullNostrPost,
  mockSuccessfulNostrResponse,
  createMockFailureResponse,
  createSetupProfileRequest,
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
    it.each([
      { field: 'title', body: { description: 'Test description', postId: 'test-post-id' } },
      { field: 'description', body: { title: 'Test Issue', postId: 'test-post-id' } },
      { field: 'postId', body: { title: 'Test Issue', description: 'Test description' } },
    ])('should return 400 when $field is missing', async ({ body }) => {
      const request = createNostrPublishRequest(body)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
      expect(mockPostToNostr).not.toHaveBeenCalled()
    })

    it('should return 400 when multiple required fields are missing', async () => {
      const request = createNostrPublishRequest({ location: 'Via Regina' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(mockPostToNostr).not.toHaveBeenCalled()
    })

    it('should accept request with only required fields', async () => {
      const request = createNostrPublishRequest(minimalValidNostrPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Successful Publishing', () => {
    it('should call postToNostr with minimal required parameters', async () => {
      const request = createNostrPublishRequest(minimalValidNostrPost)
      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining(minimalValidNostrPost)
      )
    })

    it('should call postToNostr with all optional parameters', async () => {
      const request = createNostrPublishRequest(fullNostrPost)
      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(fullNostrPost)
    })

    it('should return 200 with success response', async () => {
      const request = createNostrPublishRequest(minimalValidNostrPost)
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

      const request = createNostrPublishRequest(minimalValidNostrPost)
      const response = await POST(request)
      const data = await response.json()

      expect(data.eventId).toBe('custom-event-id-12345')
      expect(data.relaysPublished).toBe(3)
    })

    it('should handle undefined optional parameters', async () => {
      const request = createNostrPublishRequest({
        ...minimalValidNostrPost,
        location: undefined,
        city: undefined,
        latitude: undefined,
        longitude: undefined,
        reward: undefined,
        imageUrl: undefined,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({
          ...minimalValidNostrPost,
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
      mockPostToNostr.mockResolvedValueOnce(createMockFailureResponse('All relays failed'))

      const request = createNostrPublishRequest(minimalValidNostrPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('All relays failed')
    })

    it('should return 500 when postToNostr throws error', async () => {
      mockPostToNostr.mockRejectedValueOnce(new Error('Network error'))

      const request = createNostrPublishRequest(minimalValidNostrPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Nostr')
    })

    it('should handle NOSTR_PRIVATE_KEY not configured error', async () => {
      mockPostToNostr.mockResolvedValueOnce(
        createMockFailureResponse('NOSTR_PRIVATE_KEY not configured in environment variables')
      )

      const request = createNostrPublishRequest(minimalValidNostrPost)
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

      const request = createNostrPublishRequest(minimalValidNostrPost)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
    })
  })

  describe('Error Response Format', () => {
    it('should return consistent error structure for validation errors', async () => {
      const request = createNostrPublishRequest({ title: 'Test Issue' })
      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })

    it('should return consistent error structure for publishing failures', async () => {
      mockPostToNostr.mockResolvedValueOnce(createMockFailureResponse('Publishing failed'))

      const request = createNostrPublishRequest(minimalValidNostrPost)
      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
    })

    it('should return consistent success structure', async () => {
      const request = createNostrPublishRequest(minimalValidNostrPost)
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
      const request = createNostrPublishRequest({ ...minimalValidNostrPost, reward: 10000 })
      await POST(request)

      expect(mockPostToNostr).toHaveBeenCalledWith(
        expect.objectContaining({ reward: 10000 })
      )
    })

    it('should forward geolocation parameters correctly', async () => {
      const request = createNostrPublishRequest({
        ...minimalValidNostrPost,
        latitude: 45.8081,
        longitude: 9.0852,
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
      const request = createNostrPublishRequest({
        ...minimalValidNostrPost,
        imageUrl: 'https://storage.example.com/images/test.jpg',
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
      const request = createNostrPublishRequestRaw('invalid json')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Nostr')
    })

    it('should handle empty request body', async () => {
      const request = createNostrPublishRequestRaw('{}')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should handle very long title and description', async () => {
      const longTitle = 'A'.repeat(1000)
      const longDescription = 'B'.repeat(5000)

      const request = createNostrPublishRequest({
        title: longTitle,
        description: longDescription,
        postId: 'test-post-id',
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
      const request = createNostrPublishRequest({
        title: 'Test 🏙️ Issue with émojis & spëcial çhars',
        description: 'Description with\nnewlines and\ttabs',
        postId: 'test-post-id',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle numeric postId', async () => {
      const request = createNostrPublishRequest({
        title: 'Test Issue',
        description: 'Test description',
        postId: 12345,
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

describe('POST /api/nostr/setup-profile', () => {
  let mockSetupGanamosProfile: any

  beforeEach(() => {
    // Mock setupGanamosProfile function to avoid actual Nostr calls
    mockSetupGanamosProfile = vi.spyOn(nostrLib, 'setupGanamosProfile')
    mockSetupGanamosProfile.mockResolvedValue({
      success: true,
      eventId: 'mock-setup-event-id',
      relaysPublished: 5,
      relaysFailed: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Validation Errors', () => {
    it('should return 500 when NOSTR_PRIVATE_KEY is missing', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce(
        createMockFailureResponse('NOSTR_PRIVATE_KEY not configured in environment variables')
      )

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('NOSTR_PRIVATE_KEY')
      expect(mockSetupGanamosProfile).toHaveBeenCalledTimes(1)
    })

    it('should return 500 when NOSTR_PRIVATE_KEY has invalid format', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce(
        createMockFailureResponse('NOSTR_PRIVATE_KEY must be a 64-character hexadecimal string')
      )

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('64-character hexadecimal')
      expect(mockSetupGanamosProfile).toHaveBeenCalledTimes(1)
    })
  })

  describe('Signing Errors', () => {
    it('should return 500 when event signing fails', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce(
        createMockFailureResponse('Failed to sign Nostr event')
      )

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to sign Nostr event')
    })

    it('should return 500 when finalizeEvent throws exception', async () => {
      mockSetupGanamosProfile.mockRejectedValueOnce(new Error('Cryptographic signing failed'))

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('An unexpected error occurred')
    })
  })

  describe('Relay Publishing Scenarios', () => {
    it('should return 500 when all relays fail to publish', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: false,
        error: 'Failed to publish to Nostr relays',
        relaysPublished: 0,
        relaysFailed: 5,
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to publish to Nostr relays')
    })

    it('should return 200 when some relays succeed (partial failure)', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: true,
        eventId: 'partial-success-event-id',
        relaysPublished: 2,
        relaysFailed: 3,
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.eventId).toBe('partial-success-event-id')
      expect(data.relaysPublished).toBe(2)
    })

    it('should return 200 when all relays succeed', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: true,
        eventId: 'all-relays-success-event-id',
        relaysPublished: 5,
        relaysFailed: 0,
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.eventId).toBe('all-relays-success-event-id')
      expect(data.relaysPublished).toBe(5)
    })

    it('should succeed with minimum relay threshold (1 relay)', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: true,
        eventId: 'single-relay-event-id',
        relaysPublished: 1,
        relaysFailed: 4,
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.eventId).toBe('single-relay-event-id')
      expect(data.relaysPublished).toBe(1)
    })
  })

  describe('Success Path', () => {
    it('should successfully setup Ganamos profile with valid configuration', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: true,
        eventId: 'ganamos-profile-event-id',
        relaysPublished: 5,
        relaysFailed: 0,
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        eventId: 'ganamos-profile-event-id',
        relaysPublished: 5,
      })
      expect(mockSetupGanamosProfile).toHaveBeenCalledTimes(1)
    })

    it('should call setupGanamosProfile without parameters', async () => {
      const request = createSetupProfileRequest()
      await POST_SETUP_PROFILE(request)

      expect(mockSetupGanamosProfile).toHaveBeenCalledWith()
      expect(mockSetupGanamosProfile).toHaveBeenCalledTimes(1)
    })

    it('should return consistent success response structure', async () => {
      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('eventId')
      expect(data).toHaveProperty('relaysPublished')
      expect(data.success).toBe(true)
      expect(typeof data.eventId).toBe('string')
      expect(typeof data.relaysPublished).toBe('number')
    })
  })

  describe('Error Response Format', () => {
    it('should return consistent error structure for validation failures', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce(
        createMockFailureResponse('NOSTR_PRIVATE_KEY not configured')
      )

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })

    it('should return consistent error structure for relay failures', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce(
        createMockFailureResponse('Failed to publish to Nostr relays')
      )

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
    })

    it('should handle unexpected errors with generic message', async () => {
      mockSetupGanamosProfile.mockRejectedValueOnce(new Error('Unexpected error'))

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('An unexpected error occurred')
    })
  })

  describe('Edge Cases', () => {
    it('should handle network timeout during relay publishing', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: false,
        error: 'Network timeout while publishing to relays',
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('timeout')
    })

    it('should be idempotent (safe to call multiple times)', async () => {
      const request1 = createSetupProfileRequest()
      const response1 = await POST_SETUP_PROFILE(request1)
      const data1 = await response1.json()

      const request2 = createSetupProfileRequest()
      const response2 = await POST_SETUP_PROFILE(request2)
      const data2 = await response2.json()

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      expect(data1.success).toBe(true)
      expect(data2.success).toBe(true)
      expect(mockSetupGanamosProfile).toHaveBeenCalledTimes(2)
    })

    it('should handle relay connection refused errors', async () => {
      mockSetupGanamosProfile.mockResolvedValueOnce({
        success: false,
        error: 'Connection refused by relay servers',
      })

      const request = createSetupProfileRequest()
      const response = await POST_SETUP_PROFILE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Connection refused')
    })
  })
})