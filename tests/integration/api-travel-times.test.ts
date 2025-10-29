import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/travel-times/route'
import { mockDistanceMatrixResponse, mockDistanceMatrixLongDurationResponse } from '../mocks/google-maps'

describe('/api/travel-times endpoint', () => {
  const originalEnv = {
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  }

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-server-api-key'
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-public-api-key'
    
    // Mock fetch for Distance Matrix API
    global.fetch = vi.fn((url) => {
      const urlString = typeof url === 'string' ? url : url.toString()
      
      if (urlString.includes('maps.googleapis.com/maps/api/distancematrix')) {
        // Check for long distance
        if (urlString.includes('34.0522') || urlString.includes('-118.2437')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockDistanceMatrixLongDurationResponse,
          } as Response)
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => mockDistanceMatrixResponse,
        } as Response)
      }
      
      return Promise.reject(new Error('Not found'))
    }) as any
  })

  afterEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = originalEnv.GOOGLE_MAPS_API_KEY
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    vi.restoreAllMocks()
  })

  describe('successful responses', () => {
    it('should return travel times for valid origin and destination', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toHaveProperty('walking')
      expect(data).toHaveProperty('driving')
      expect(response.status).toBe(200)
    })

    it('should format duration as expected (minutes only)', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      // Mock returns "30 mins"
      expect(data.walking).toBe('30min')
    })

    it('should format duration with hours and minutes', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=34.0522,-118.2437'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      // Mock returns "6 hours 30 mins"
      expect(data.walking).toBe('6hr 30min')
    })

    it('should call Distance Matrix API with correct parameters', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      await GET(request)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('origins=37.7749,-122.4194'),
        expect.any(Object)
      )
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('destinations=37.8044,-122.2712'),
        expect.any(Object)
      )
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('mode=walking'),
        expect.any(Object)
      )
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('mode=driving'),
        expect.any(Object)
      )
    })

    it('should include API key in Distance Matrix request', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      await GET(request)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('key=test-server-api-key'),
        expect.any(Object)
      )
    })

    it('should fetch both walking and driving times in parallel', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      await GET(request)
      
      // Should call fetch twice (walking + driving)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('parameter validation', () => {
    it('should return null values when origin is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when destination is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should return null values when both parameters are missing', async () => {
      const request = new NextRequest('http://localhost:3457/api/travel-times')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })
  })

  describe('error handling', () => {
    it('should return null values when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should handle Distance Matrix API errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('API Error'))
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
      expect(response.status).toBe(200) // Should still return 200
    })

    it('should handle timeout errors', async () => {
      // Mock fetch to simulate timeout - using 1 second delay instead of 6
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 1000)
        })
      })
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should handle malformed API responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'INVALID_REQUEST' }),
      } as Response)
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })

    it('should handle ZERO_RESULTS status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          rows: [],
        }),
      } as Response)
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=0,0&destination=0,0'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data).toEqual({ walking: null, driving: null })
    })
  })

  describe('API key fallback', () => {
    it('should use GOOGLE_MAPS_API_KEY if available', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'server-key'
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'public-key'
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      await GET(request)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('key=server-key'),
        expect.any(Object)
      )
    })

    it('should fallback to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'public-key-fallback'
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      await GET(request)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('key=public-key-fallback'),
        expect.any(Object)
      )
    })
  })

  describe('duration formatting', () => {
    it('should format hours only', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          rows: [
            {
              elements: [
                {
                  duration: { text: '2 hours' },
                },
              ],
            },
          ],
        }),
      } as Response)
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data.walking).toBe('2hr')
    })

    it('should format minutes only', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          rows: [
            {
              elements: [
                {
                  duration: { text: '45 mins' },
                },
              ],
            },
          ],
        }),
      } as Response)
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data.walking).toBe('45min')
    })

    it('should return 1min for very short durations', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          rows: [
            {
              elements: [
                {
                  duration: { text: '30 secs' },
                },
              ],
            },
          ],
        }),
      } as Response)
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(data.walking).toBe('1min')
    })
  })

  describe('timeout mechanism', () => {
    it('should use AbortController for timeout', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
      
      // Mock slow response
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => mockDistanceMatrixResponse,
            } as Response)
          }, 100)
        })
      })
      
      const request = new NextRequest(
        'http://localhost:3457/api/travel-times?origin=37.7749,-122.4194&destination=37.8044,-122.2712'
      )
      
      await GET(request)
      
      // Verify AbortController was created (constructor called)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
      
      abortSpy.mockRestore()
    })
  })
})