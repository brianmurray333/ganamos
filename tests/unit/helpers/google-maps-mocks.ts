import { vi } from 'vitest'

/**
 * Mock response shapes for Google Distance Matrix API
 * Based on actual API response structure used in app/api/travel-times/route.ts
 */

export interface MockDistanceMatrixResponse {
  status: string
  rows?: Array<{
    elements: Array<{
      duration?: {
        text: string
        value: number
      }
      status?: string
    }>
  }>
  error_message?: string
}

/**
 * Create a successful Distance Matrix API response
 */
export function createMockDistanceMatrixSuccess(durationText: string, durationValue: number): MockDistanceMatrixResponse {
  return {
    status: 'OK',
    rows: [
      {
        elements: [
          {
            duration: {
              text: durationText,
              value: durationValue
            },
            status: 'OK'
          }
        ]
      }
    ]
  }
}

/**
 * Create a Distance Matrix API error response
 */
export function createMockDistanceMatrixError(status: string = 'UNKNOWN_ERROR', errorMessage?: string): MockDistanceMatrixResponse {
  return {
    status,
    error_message: errorMessage,
    rows: []
  }
}

/**
 * Create an invalid/malformed response (missing required fields)
 */
export function createMockDistanceMatrixInvalid(): MockDistanceMatrixResponse {
  return {
    status: 'OK',
    rows: [
      {
        elements: [
          {
            // Missing duration field
            status: 'OK'
          }
        ]
      }
    ]
  }
}

/**
 * Mock fetch for successful Distance Matrix API calls
 */
export function mockDistanceMatrixFetchSuccess(walkingDuration: string, drivingDuration: string) {
  const mockFetch = vi.fn()

  // Mock walking mode response
  mockFetch.mockImplementationOnce(async (url: string) => {
    if (url.includes('mode=walking')) {
      return {
        ok: true,
        json: async () => createMockDistanceMatrixSuccess(walkingDuration, 1800) // 30 min default
      }
    }
    throw new Error('Unexpected URL')
  })

  // Mock driving mode response
  mockFetch.mockImplementationOnce(async (url: string) => {
    if (url.includes('mode=driving')) {
      return {
        ok: true,
        json: async () => createMockDistanceMatrixSuccess(drivingDuration, 600) // 10 min default
      }
    }
    throw new Error('Unexpected URL')
  })

  global.fetch = mockFetch as any
  return mockFetch
}

/**
 * Mock fetch to simulate timeout (AbortController cancellation)
 */
export function mockDistanceMatrixFetchTimeout() {
  const mockFetch = vi.fn()

  mockFetch.mockImplementation(async (_url: string, options?: any) => {
    // Simulate AbortController timeout by checking signal
    if (options?.signal) {
      return new Promise((_, reject) => {
        // Simulate the abort event
        const abortError = new Error('The operation was aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      })
    }
    throw new Error('Expected AbortController signal')
  })

  global.fetch = mockFetch as any
  return mockFetch
}

/**
 * Mock fetch to return error responses from Google API
 */
export function mockDistanceMatrixFetchError(status: string = 'REQUEST_DENIED') {
  const mockFetch = vi.fn()

  mockFetch.mockImplementation(async () => {
    return {
      ok: true,
      json: async () => createMockDistanceMatrixError(status, 'API key invalid')
    }
  })

  global.fetch = mockFetch as any
  return mockFetch
}

/**
 * Mock fetch to return invalid/malformed responses
 */
export function mockDistanceMatrixFetchInvalid() {
  const mockFetch = vi.fn()

  mockFetch.mockImplementation(async () => {
    return {
      ok: true,
      json: async () => createMockDistanceMatrixInvalid()
    }
  })

  global.fetch = mockFetch as any
  return mockFetch
}

/**
 * Mock fetch with mixed success/failure for parallel execution testing
 */
export function mockDistanceMatrixFetchMixed(walkingSuccess: boolean, drivingSuccess: boolean) {
  const mockFetch = vi.fn()

  // Walking mode
  mockFetch.mockImplementationOnce(async (url: string) => {
    if (url.includes('mode=walking')) {
      if (walkingSuccess) {
        return {
          ok: true,
          json: async () => createMockDistanceMatrixSuccess('25 mins', 1500)
        }
      } else {
        return {
          ok: true,
          json: async () => createMockDistanceMatrixError('ZERO_RESULTS')
        }
      }
    }
    throw new Error('Unexpected URL')
  })

  // Driving mode
  mockFetch.mockImplementationOnce(async (url: string) => {
    if (url.includes('mode=driving')) {
      if (drivingSuccess) {
        return {
          ok: true,
          json: async () => createMockDistanceMatrixSuccess('8 mins', 480)
        }
      } else {
        return {
          ok: true,
          json: async () => createMockDistanceMatrixError('ZERO_RESULTS')
        }
      }
    }
    throw new Error('Unexpected URL')
  })

  global.fetch = mockFetch as any
  return mockFetch
}

/**
 * Mock fetch for network failures (non-OK response)
 */
export function mockDistanceMatrixFetchNetworkError() {
  const mockFetch = vi.fn()

  mockFetch.mockImplementation(async () => {
    throw new Error('Network request failed')
  })

  global.fetch = mockFetch as any
  return mockFetch
}

/**
 * Restore original fetch implementation
 */
export function restoreFetch() {
  vi.restoreAllMocks()
}