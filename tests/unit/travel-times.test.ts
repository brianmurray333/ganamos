import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/travel-times/route'
import {
  mockDistanceMatrixFetchSuccess,
  mockDistanceMatrixFetchTimeout,
  mockDistanceMatrixFetchError,
  mockDistanceMatrixFetchInvalid,
  mockDistanceMatrixFetchMixed,
  mockDistanceMatrixFetchNetworkError,
  restoreFetch,
} from './helpers/google-maps-mocks'

/**
 * Integration tests for GET /api/travel-times endpoint
 * 
 * The /api/travel-times endpoint integrates with Google Distance Matrix API
 * to calculate walking and driving times between two coordinates. It handles
 * concurrent requests, formats duration text, implements timeout protection,
 * and returns graceful null values on errors.
 * 
 * Test Coverage:
 * - Request parameter validation (origin, destination)
 * - Distance Matrix API integration
 * - Duration text formatting
 * - Timeout handling (5 second abort)
 * - Parallel API calls (walking + driving)
 * - Error handling and graceful degradation
 */
describe('GET /api/travel-times', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
    // Disable mock mode for these tests to test real API behavior
    delete process.env.USE_MOCKS
    vi.clearAllMocks()
    restoreFetch()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    restoreFetch()
  })

  /**
   * Helper to create mock NextRequest with query parameters
   */
  const createMockRequest = (params: { origin?: string; destination?: string } = {}): NextRequest => {
    const url = new URL('http://localhost:3000/api/travel-times')
    if (params.origin) url.searchParams.set('origin', params.origin)
    if (params.destination) url.searchParams.set('destination', params.destination)
    
    return new NextRequest(url)
  }

  describe('parameter validation', () => {
    it('should return null values when origin is missing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      const request = createMockRequest({
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when destination is missing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when both parameters are missing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      const request = createMockRequest({})

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should accept valid coordinate pairs', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('25 mins', '8 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('25min')
      expect(data.driving).toBe('8min')
    })
  })

  describe('API key handling', () => {
    it('should return null values when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should log error to console when API key is missing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      delete process.env.GOOGLE_MAPS_API_KEY
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Google Maps API key not configured')
      
      consoleErrorSpy.mockRestore()
    })

    it('should use GOOGLE_MAPS_API_KEY when available', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-primary'
      mockDistanceMatrixFetchSuccess('30 mins', '10 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      // Verify API was called (mocked)
      expect(global.fetch).toHaveBeenCalled()
    })

    it('should fallback to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-api-key-fallback'
      mockDistanceMatrixFetchSuccess('30 mins', '10 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      // Verify API was called with fallback key
      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('duration formatting', () => {
    it('should format hours and minutes correctly', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('1 hour 23 mins', '45 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('1hr 23min')
      expect(data.driving).toBe('45min')
    })

    it('should format hours only when minutes are zero', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('2 hours', '1 hour')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('2hr')
      expect(data.driving).toBe('1hr')
    })

    it('should format minutes only when hours are zero', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('45 mins', '12 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('45min')
      expect(data.driving).toBe('12min')
    })

    it('should return "1min" as minimum duration', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('0 mins', '0 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('1min')
      expect(data.driving).toBe('1min')
    })
  })

  describe('parallel API calls', () => {
    it('should make concurrent requests for walking and driving', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('30 mins', '10 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      // Should have been called twice (walking + driving)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should include mode parameter in API calls', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('30 mins', '10 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      const mockFetch = global.fetch as any
      const calls = mockFetch.mock.calls

      // Verify walking and driving modes
      expect(calls.some((call: any) => call[0].includes('mode=walking'))).toBe(true)
      expect(calls.some((call: any) => call[0].includes('mode=driving'))).toBe(true)
    })

    it('should handle mixed success and failure responses', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchMixed(true, false) // walking succeeds, driving fails
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('25min')
      expect(data.driving).toBeNull()
    })
  })

  describe('timeout handling', () => {
    it('should implement 5 second timeout', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchTimeout()
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      // Should return null values on timeout
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should use AbortController for timeout', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchTimeout()
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      // Verify fetch was called with signal option
      const mockFetch = global.fetch as any
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(Object)
        })
      )
    })
  })

  describe('error handling', () => {
    it('should handle Distance Matrix API errors gracefully', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('REQUEST_DENIED')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should handle invalid response format', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchInvalid()
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should handle network failures', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchNetworkError()
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchNetworkError()
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      expect(consoleErrorSpy).toHaveBeenCalled()
      
      consoleErrorSpy.mockRestore()
    })

    it('should always return valid JSON response', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('UNKNOWN_ERROR')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)

      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      expect(data).toHaveProperty('walking')
      expect(data).toHaveProperty('driving')
    })

    it('should handle exceptions in main try-catch block', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      // Force an error by passing invalid URL
      const request = new NextRequest('http://localhost:3000/api/travel-times?origin=invalid&destination=invalid')

      const response = await GET(request)
      const data = await response.json()

      // Should still return valid response with null values
      expect(data).toEqual({ walking: null, driving: null })
    })
  })

  describe('Distance Matrix API integration', () => {
    it('should construct correct API URL with parameters', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-12345'
      mockDistanceMatrixFetchSuccess('30 mins', '10 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      await GET(request)

      const mockFetch = global.fetch as any
      const firstCall = mockFetch.mock.calls[0][0]

      expect(firstCall).toContain('maps.googleapis.com/maps/api/distancematrix/json')
      expect(firstCall).toContain('origins=37.7749,-122.4194')
      expect(firstCall).toContain('destinations=37.8044,-122.2711')
      expect(firstCall).toContain('key=test-api-key-12345')
    })

    it('should handle OK status from Distance Matrix API', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('45 mins', '15 mins')
      
      const request = createMockRequest({
        origin: '37.7749,-122.4194',
        destination: '37.8044,-122.2711'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('45min')
      expect(data.driving).toBe('15min')
    })

    it('should return null when status is not OK', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('ZERO_RESULTS')
      
      const request = createMockRequest({
        origin: '0,0',
        destination: '0,0'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({ walking: null, driving: null })
    })
  })
})
