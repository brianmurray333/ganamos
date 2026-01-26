import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from '@/app/api/travel-times/route'
import { NextRequest } from 'next/server'
import {
  mockDistanceMatrixFetchSuccess,
  mockDistanceMatrixFetchTimeout,
  mockDistanceMatrixFetchError,
  mockDistanceMatrixFetchInvalid,
  mockDistanceMatrixFetchMixed,
  mockDistanceMatrixFetchNetworkError,
  restoreFetch
} from '../helpers/google-maps-mocks'

describe('/api/travel-times', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    restoreFetch()
    // Reset environment variables
    process.env = { ...originalEnv }
    // Disable mock mode for these tests to test real API behavior
    delete process.env.USE_MOCKS
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Parameter Validation', () => {
    it('should return null values when origin parameter is missing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?destination=40.7128,-74.0060')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when destination parameter is missing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when both parameters are missing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })
  })

  describe('API Key Handling', () => {
    it('should return null values when GOOGLE_MAPS_API_KEY is not configured', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should use NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as fallback', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-public-api-key'
      
      mockDistanceMatrixFetchSuccess('30 mins', '10 mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe('30min')
      expect(data.driving).toBe('10min')
    })
  })

  describe('Successful Travel Time Calculations', () => {
    it('should return formatted travel times for both walking and driving modes', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('45 mins', '15 mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('walking')
      expect(data).toHaveProperty('driving')
      expect(data.walking).toBe('45min')
      expect(data.driving).toBe('15min')
    })

    it('should format duration with hours and minutes correctly', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('1 hour 23 mins', '2 hours 10 mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe('1hr 23min')
      expect(data.driving).toBe('2hr 10min')
    })

    it('should format duration with hours only', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('2 hours', '1 hour')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe('2hr')
      expect(data.driving).toBe('1hr')
    })

    it('should format very short durations to 1min minimum', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('30 secs', '45 secs')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe('1min')
      expect(data.driving).toBe('1min')
    })

    it('should handle URL-encoded coordinate parameters', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('20 mins', '8 mins')
      
      const origin = encodeURIComponent('40.7128,-74.0060')
      const destination = encodeURIComponent('40.7589,-73.9851')
      
      const request = new NextRequest(
        new URL(`http://localhost:3000/api/travel-times?origin=${origin}&destination=${destination}`)
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe('20min')
      expect(data.driving).toBe('8min')
    })
  })

  describe('Timeout Handling', () => {
    it('should return null values when request exceeds 5-second timeout', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchTimeout()
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should use AbortController signal for timeout cancellation', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      const mockFetch = mockDistanceMatrixFetchTimeout()
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      await GET(request)

      // Verify fetch was called with AbortController signal
      expect(mockFetch).toHaveBeenCalled()
      const firstCall = mockFetch.mock.calls[0]
      expect(firstCall[1]).toHaveProperty('signal')
      expect(firstCall[1].signal).toBeInstanceOf(AbortSignal)
    })
  })

  describe('Google API Error Handling', () => {
    it('should return null values on REQUEST_DENIED status', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('REQUEST_DENIED')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values on ZERO_RESULTS status', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('ZERO_RESULTS')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values on INVALID_REQUEST status', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('INVALID_REQUEST')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=invalid&destination=invalid')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when response structure is invalid', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchInvalid()
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values on network failures', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchNetworkError()
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })
  })

  describe('Parallel Execution', () => {
    it('should execute walking and driving requests in parallel', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      const mockFetch = mockDistanceMatrixFetchSuccess('30 mins', '12 mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const startTime = Date.now()
      await GET(request)
      const endTime = Date.now()

      // Verify both modes were called (2 fetch calls total)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      
      // Verify calls include both modes
      const calls = mockFetch.mock.calls
      const urls = calls.map(call => call[0])
      expect(urls.some((url: string) => url.includes('mode=walking'))).toBe(true)
      expect(urls.some((url: string) => url.includes('mode=driving'))).toBe(true)
    })

    it('should return partial results when walking succeeds but driving fails', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchMixed(true, false)
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe('25min')
      expect(data.driving).toBe(null)
    })

    it('should return partial results when driving succeeds but walking fails', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchMixed(false, true)
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.walking).toBe(null)
      expect(data.driving).toBe('8min')
    })

    it('should return null values when both modes fail', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchMixed(false, false)
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ walking: null, driving: null })
    })
  })

  describe('Response Structure', () => {
    it('should always return JSON response with walking and driving properties', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('20 mins', '5 mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('walking')
      expect(data).toHaveProperty('driving')
      expect(typeof data.walking === 'string' || data.walking === null).toBe(true)
      expect(typeof data.driving === 'string' || data.driving === null).toBe(true)
    })

    it('should return 200 status code even on errors (graceful degradation)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchError('REQUEST_DENIED')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should never throw errors to the client', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchNetworkError()
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      // Should not throw
      await expect(GET(request)).resolves.toBeDefined()
    })
  })

  describe('Duration Formatting Edge Cases', () => {
    it('should handle singular hour format', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('1 hour 5 mins', '1 hour')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('1hr 5min')
      expect(data.driving).toBe('1hr')
    })

    it('should handle plural hours format', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('3 hours 45 mins', '2 hours 30 mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('3hr 45min')
      expect(data.driving).toBe('2hr 30min')
    })

    it('should handle single digit minutes', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('5 mins', '1 min')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('5min')
      expect(data.driving).toBe('1min')
    })

    it('should format duration text with variations in spacing', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
      mockDistanceMatrixFetchSuccess('1hour 30mins', '45mins')
      
      const request = new NextRequest(
        new URL('http://localhost:3000/api/travel-times?origin=40.7128,-74.0060&destination=40.7589,-73.9851')
      )

      const response = await GET(request)
      const data = await response.json()

      expect(data.walking).toBe('1hr 30min')
      expect(data.driving).toBe('45min')
    })
  })
})
