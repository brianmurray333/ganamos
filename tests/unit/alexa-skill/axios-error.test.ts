import { describe, it, expect } from 'vitest'
import axios, { AxiosError } from 'axios'

/**
 * Unit tests for AxiosError construction and handling.
 * 
 * AxiosError is the foundational error type used by alexa-skill/lambda/src/api/ganamos-client.ts
 * for all HTTP request error handling. These tests validate that the error objects have the
 * structure and properties our application depends on for robust error handling across all
 * Alexa intent handlers.
 * 
 * Tests focus on externally observable behavior: property values, type checking, and
 * integration with axios.isAxiosError() used throughout the application.
 */
describe('AxiosError Construction and Handling', () => {
  describe('Constructor Behavior', () => {
    it('creates error with message only', () => {
      const error = new AxiosError('Test error')
      
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AxiosError)
      expect(error.message).toBe('Test error')
      expect(error.name).toBe('AxiosError')
      expect(error.stack).toBeDefined()
      expect(typeof error.stack).toBe('string')
    })

    it('creates error with message and code', () => {
      const error = new AxiosError('Network error', 'ERR_NETWORK')
      
      expect(error.message).toBe('Network error')
      expect(error.code).toBe('ERR_NETWORK')
      expect(error.name).toBe('AxiosError')
    })

    it('creates error with config object', () => {
      const config = { url: '/api/jobs', method: 'GET' }
      const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config as any)
      
      expect(error.message).toBe('Request failed')
      expect(error.code).toBe('ERR_BAD_REQUEST')
      expect(error.config).toBe(config)
    })

    it('creates error with request object', () => {
      const request = { path: '/api/jobs' }
      const error = new AxiosError('Request error', 'ERR_NETWORK', undefined, request)
      
      expect(error.message).toBe('Request error')
      expect(error.code).toBe('ERR_NETWORK')
      expect(error.request).toBe(request)
    })

    it('creates error with response object and derives status', () => {
      const response = {
        status: 404,
        data: { message: 'Not found' },
        statusText: 'Not Found',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response)
      
      expect(error.message).toBe('Request failed')
      expect(error.code).toBe('ERR_BAD_REQUEST')
      expect(error.response).toBe(response)
      expect(error.status).toBe(404)
    })

    it('creates error with all parameters', () => {
      const config = { url: '/api/balance', method: 'GET', timeout: 5000 }
      const request = { path: '/api/balance' }
      const response = {
        status: 500,
        data: { error: 'Internal Server Error' },
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
        config: config as any
      }
      
      const error = new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        config as any,
        request,
        response
      )
      
      expect(error.message).toBe('Request failed with status code 500')
      expect(error.code).toBe('ERR_BAD_RESPONSE')
      expect(error.config).toBe(config)
      expect(error.request).toBe(request)
      expect(error.response).toBe(response)
      expect(error.status).toBe(500)
    })
  })

  describe('Property Assignment with Truthy/Falsy Values', () => {
    it('does not assign code when undefined', () => {
      const error = new AxiosError('Test error', undefined)
      
      expect(error.code).toBeUndefined()
      expect(error.message).toBe('Test error')
    })

    it('does not assign code when empty string', () => {
      const error = new AxiosError('Test error', '')
      
      expect(error.code).toBeUndefined()
    })

    it('does not assign code when null', () => {
      const error = new AxiosError('Test error', null as any)
      
      expect(error.code).toBeUndefined()
    })

    it('assigns code when non-empty string', () => {
      const error = new AxiosError('Test error', 'ERR_TEST')
      
      expect(error.code).toBe('ERR_TEST')
    })

    it('does not assign config when undefined', () => {
      const error = new AxiosError('Test error', 'ERR_TEST', undefined)
      
      expect(error.config).toBeUndefined()
    })

    it('does not assign config when null', () => {
      const error = new AxiosError('Test error', 'ERR_TEST', null as any)
      
      expect(error.config).toBeUndefined()
    })

    it('assigns config when object provided', () => {
      const config = { url: '/test', method: 'POST' }
      const error = new AxiosError('Test error', 'ERR_TEST', config as any)
      
      expect(error.config).toBe(config)
    })

    it('does not assign request when undefined', () => {
      const error = new AxiosError('Test error', 'ERR_TEST', undefined, undefined)
      
      expect(error.request).toBeUndefined()
    })

    it('assigns request when object provided', () => {
      const request = { path: '/test' }
      const error = new AxiosError('Test error', 'ERR_TEST', undefined, request)
      
      expect(error.request).toBe(request)
    })

    it('does not assign response when undefined', () => {
      const error = new AxiosError('Test error', 'ERR_TEST')
      
      expect(error.response).toBeUndefined()
      expect(error.status).toBeUndefined()
    })

    it('does not assign response when null', () => {
      const error = new AxiosError('Test error', 'ERR_TEST', undefined, undefined, null as any)
      
      expect(error.response).toBeUndefined()
      expect(error.status).toBeUndefined()
    })
  })

  describe('Status Derivation from Response', () => {
    it('derives status from response.status', () => {
      const response = {
        status: 404,
        data: {},
        statusText: 'Not Found',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Not found', 'ERR_BAD_REQUEST', undefined, undefined, response)
      
      expect(error.status).toBe(404)
      expect(error.response).toBe(response)
    })

    it('sets status to null when response.status is undefined', () => {
      const response = {
        data: {},
        statusText: 'Unknown',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Unknown error', 'ERR_BAD_REQUEST', undefined, undefined, response as any)
      
      expect(error.response).toBe(response)
      expect(error.status).toBeNull()
    })

    it('sets status to null when response.status is null', () => {
      const response = {
        status: null,
        data: {},
        statusText: 'Unknown',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Unknown error', 'ERR_BAD_REQUEST', undefined, undefined, response as any)
      
      expect(error.status).toBeNull()
    })

    it('converts status code 0 to null (network error)', () => {
      const response = {
        status: 0,
        data: {},
        statusText: 'Network Error',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Connection error', 'ERR_NETWORK', undefined, undefined, response)
      
      // AxiosError converts falsy status values (including 0) to null
      expect(error.status).toBeNull()
    })

    it('preserves 4xx status codes', () => {
      const statuses = [400, 401, 403, 404, 422, 429]
      
      statuses.forEach(status => {
        const response = {
          status,
          data: {},
          statusText: 'Client Error',
          headers: {},
          config: {} as any
        }
        const error = new AxiosError(`Request failed with status ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response)
        
        expect(error.status).toBe(status)
      })
    })

    it('preserves 5xx status codes', () => {
      const statuses = [500, 502, 503, 504]
      
      statuses.forEach(status => {
        const response = {
          status,
          data: {},
          statusText: 'Server Error',
          headers: {},
          config: {} as any
        }
        const error = new AxiosError(`Request failed with status ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, response)
        
        expect(error.status).toBe(status)
      })
    })

    it('does not set status when no response provided', () => {
      const error = new AxiosError('Request error', 'ERR_NETWORK')
      
      expect(error.status).toBeUndefined()
    })
  })

  describe('Error Inheritance and Type Checking', () => {
    it('is instance of Error', () => {
      const error = new AxiosError('Test error')
      
      expect(error).toBeInstanceOf(Error)
    })

    it('is instance of AxiosError', () => {
      const error = new AxiosError('Test error')
      
      expect(error).toBeInstanceOf(AxiosError)
    })

    it('has correct name property', () => {
      const error = new AxiosError('Test error')
      
      expect(error.name).toBe('AxiosError')
    })

    it('has stack trace containing error name', () => {
      const error = new AxiosError('Test error')
      
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AxiosError')
    })

    it('can be caught as Error', () => {
      try {
        throw new AxiosError('Test error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(AxiosError)
      }
    })
  })

  describe('Integration with axios.isAxiosError', () => {
    it('is recognized by axios.isAxiosError when created with new', () => {
      const error = new AxiosError('Test error')
      
      expect(axios.isAxiosError(error)).toBe(true)
    })

    it('is recognized with code parameter', () => {
      const error = new AxiosError('Network error', 'ERR_NETWORK')
      
      expect(axios.isAxiosError(error)).toBe(true)
    })

    it('is recognized with response parameter', () => {
      const response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Server error', 'ERR_BAD_RESPONSE', undefined, undefined, response)
      
      expect(axios.isAxiosError(error)).toBe(true)
    })

    it('distinguishes from regular Error', () => {
      const regularError = new Error('Regular error')
      
      expect(axios.isAxiosError(regularError)).toBe(false)
    })

    it('distinguishes from TypeError', () => {
      const typeError = new TypeError('Type error')
      
      expect(axios.isAxiosError(typeError)).toBe(false)
    })

    it('distinguishes from custom errors', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }
      
      const customError = new CustomError('Custom error')
      expect(axios.isAxiosError(customError)).toBe(false)
    })
  })

  describe('Common Error Scenarios Used by Ganamos Client', () => {
    it('creates network error matching real usage', () => {
      const error = new AxiosError('Network Error', 'ERR_NETWORK')
      
      expect(error.code).toBe('ERR_NETWORK')
      expect(error.message).toBe('Network Error')
      expect(axios.isAxiosError(error)).toBe(true)
      expect(error.response).toBeUndefined()
      expect(error.status).toBeUndefined()
    })

    it('creates timeout error matching real usage', () => {
      const config = { url: '/api/jobs', timeout: 5000 }
      const error = new AxiosError('timeout of 5000ms exceeded', 'ETIMEDOUT', config as any)
      
      expect(error.code).toBe('ETIMEDOUT')
      expect(error.message).toContain('timeout')
      expect(error.config).toBe(config)
    })

    it('creates 500 server error matching ganamos API response', () => {
      const response = {
        status: 500,
        data: { error: 'Internal Server Error' },
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        response
      )
      
      expect(error.code).toBe('ERR_BAD_RESPONSE')
      expect(error.status).toBe(500)
      expect(error.response?.data).toEqual({ error: 'Internal Server Error' })
      expect(axios.isAxiosError(error)).toBe(true)
    })

    it('creates 400 bad request error matching validation failures', () => {
      const response = {
        status: 400,
        data: { message: 'Invalid input', required: 5000 },
        statusText: 'Bad Request',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        response
      )
      
      expect(error.code).toBe('ERR_BAD_REQUEST')
      expect(error.status).toBe(400)
      expect(error.response?.data.message).toBe('Invalid input')
      expect(error.response?.data.required).toBe(5000)
    })

    it('creates 404 not found error', () => {
      const response = {
        status: 404,
        data: {},
        statusText: 'Not Found',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError(
        'Request failed with status code 404',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        response
      )
      
      expect(error.status).toBe(404)
      expect(axios.isAxiosError(error)).toBe(true)
    })

    it('creates 401 unauthorized error matching auth failures', () => {
      const response = {
        status: 401,
        data: { error: 'Unauthorized' },
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError(
        'Request failed with status code 401',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        response
      )
      
      expect(error.status).toBe(401)
      expect(error.response?.data.error).toBe('Unauthorized')
    })
  })

  describe('Property Access Patterns Used by Ganamos Client', () => {
    it('allows optional chaining on undefined response', () => {
      const error = new AxiosError('Test error')
      
      // These patterns are used in ganamos-client.ts handleError method
      expect(error.response?.status).toBeUndefined()
      expect(error.response?.data).toBeUndefined()
      expect(error.message).toBe('Test error')
    })

    it('allows accessing nested response properties safely', () => {
      const response = {
        status: 400,
        data: {
          error: {
            code: 'INVALID_INPUT',
            details: ['Field required'],
            balance: 1000,
            required: 5000
          }
        },
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
        config: {} as any
      }
      const error = new AxiosError('Bad request', 'ERR_BAD_REQUEST', undefined, undefined, response)
      
      // Nested property access patterns used by CreateJobResponse and CompleteJobResponse
      expect(error.response?.data.error.code).toBe('INVALID_INPUT')
      expect(error.response?.data.error.details).toContain('Field required')
      expect(error.response?.data.error.balance).toBe(1000)
      expect(error.response?.data.error.required).toBe(5000)
      expect(error.response?.headers['content-type']).toBe('application/json')
    })

    it('allows accessing config properties safely', () => {
      const config = {
        url: '/api/jobs',
        method: 'POST',
        timeout: 10000,
        headers: { 'Authorization': 'Bearer token' }
      }
      const error = new AxiosError('Timeout', 'ETIMEDOUT', config as any)
      
      expect(error.config?.url).toBe('/api/jobs')
      expect(error.config?.method).toBe('POST')
      expect(error.config?.timeout).toBe(10000)
    })

    it('handles error pattern from ganamos-client catch blocks', () => {
      const response = {
        status: 500,
        data: { success: false, error: 'Server error' },
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response)
      
      // Pattern: if (axios.isAxiosError(error) && error.response)
      if (axios.isAxiosError(error) && error.response) {
        expect(error.response.data).toBeDefined()
        expect(error.response.status).toBe(500)
      }
    })
  })

  describe('Edge Cases', () => {
    it('handles response without status property', () => {
      const response = {
        data: {},
        statusText: 'Unknown',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Unknown error', 'ERR_UNKNOWN', undefined, undefined, response as any)
      
      expect(error.response).toBe(response)
      expect(error.status).toBeNull()
    })

    it('handles empty message string', () => {
      const error = new AxiosError('')
      
      expect(error.message).toBe('')
      expect(error.name).toBe('AxiosError')
      expect(axios.isAxiosError(error)).toBe(true)
    })

    it('handles special characters in message', () => {
      const message = 'Error: 中文 émojis 🚀 "quotes" \'apostrophes\' \n newlines'
      const error = new AxiosError(message)
      
      expect(error.message).toBe(message)
    })

    it('handles very long message', () => {
      const longMessage = 'Error: ' + 'a'.repeat(10000)
      const error = new AxiosError(longMessage)
      
      expect(error.message).toBe(longMessage)
      expect(error.message.length).toBeGreaterThan(10000)
    })

    it('handles undefined message', () => {
      const error = new AxiosError(undefined as any)
      
      expect(error.message).toBeUndefined()
      expect(error.name).toBe('AxiosError')
    })

    it('handles response with null data', () => {
      const response = {
        status: 204,
        data: null,
        statusText: 'No Content',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('No content', 'ERR_BAD_REQUEST', undefined, undefined, response as any)
      
      expect(error.response?.data).toBeNull()
      expect(error.status).toBe(204)
    })

    it('handles response with array data', () => {
      const response = {
        status: 400,
        data: ['Error 1', 'Error 2'],
        statusText: 'Bad Request',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Multiple errors', 'ERR_BAD_REQUEST', undefined, undefined, response as any)
      
      expect(Array.isArray(error.response?.data)).toBe(true)
      expect(error.response?.data).toHaveLength(2)
    })

    it('handles response with string data', () => {
      const response = {
        status: 500,
        data: 'Internal Server Error',
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any
      }
      const error = new AxiosError('Server error', 'ERR_BAD_RESPONSE', undefined, undefined, response as any)
      
      expect(typeof error.response?.data).toBe('string')
      expect(error.response?.data).toBe('Internal Server Error')
    })
  })

  describe('Multiple Error Code Constants', () => {
    it('supports ERR_NETWORK for network failures', () => {
      const error = new AxiosError('Network Error', 'ERR_NETWORK')
      expect(error.code).toBe('ERR_NETWORK')
    })

    it('supports ERR_CANCELED for request cancellation', () => {
      const error = new AxiosError('Request canceled', 'ERR_CANCELED')
      expect(error.code).toBe('ERR_CANCELED')
    })

    it('supports ETIMEDOUT for timeout errors', () => {
      const error = new AxiosError('Timeout exceeded', 'ETIMEDOUT')
      expect(error.code).toBe('ETIMEDOUT')
    })

    it('supports ECONNABORTED for connection abort', () => {
      const error = new AxiosError('Connection aborted', 'ECONNABORTED')
      expect(error.code).toBe('ECONNABORTED')
    })

    it('supports ERR_BAD_REQUEST for 4xx errors', () => {
      const error = new AxiosError('Bad request', 'ERR_BAD_REQUEST')
      expect(error.code).toBe('ERR_BAD_REQUEST')
    })

    it('supports ERR_BAD_RESPONSE for 5xx errors', () => {
      const error = new AxiosError('Bad response', 'ERR_BAD_RESPONSE')
      expect(error.code).toBe('ERR_BAD_RESPONSE')
    })

    it('supports ERR_NOT_SUPPORT for unsupported features', () => {
      const error = new AxiosError('Not supported', 'ERR_NOT_SUPPORT')
      expect(error.code).toBe('ERR_NOT_SUPPORT')
    })
  })
})
