import { describe, it, expect } from 'vitest'
import { AxiosError } from 'axios'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

describe('AxiosError', () => {
  describe('Constructor', () => {
    it('should create error with all parameters provided', () => {
      const message = 'Test error message'
      const code = 'ERR_BAD_REQUEST'
      const config: InternalAxiosRequestConfig = {
        url: 'http://test.com',
        method: 'GET',
        headers: {},
      } as InternalAxiosRequestConfig
      const request = { path: '/test' }
      const response: AxiosResponse = {
        data: null,
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: config,
      } as AxiosResponse

      const error = new AxiosError(message, code, config, request, response)

      expect(error.message).toBe(message)
      expect(error.code).toBe(code)
      expect(error.config).toBe(config)
      expect(error.request).toBe(request)
      expect(error.response).toBe(response)
      expect(error.status).toBe(400)
    })

    it('should create error with message only', () => {
      const message = 'Simple error'
      const error = new AxiosError(message)

      expect(error.message).toBe(message)
      expect(error.code).toBeUndefined()
      expect(error.config).toBeUndefined()
      expect(error.request).toBeUndefined()
      expect(error.response).toBeUndefined()
      expect(error.status).toBeUndefined()
    })

    it('should handle undefined message', () => {
      const error = new AxiosError()

      expect(error.message).toBeUndefined()
      expect(error.name).toBe('AxiosError')
    })

    it('should set name property to AxiosError', () => {
      const error = new AxiosError('Test')

      expect(error.name).toBe('AxiosError')
    })
  })

  describe('Error Inheritance', () => {
    it('should be instanceof Error', () => {
      const error = new AxiosError('Test error')

      expect(error instanceof Error).toBe(true)
    })

    it('should be instanceof AxiosError', () => {
      const error = new AxiosError('Test error')

      expect(error instanceof AxiosError).toBe(true)
    })

    it('should have a stack trace', () => {
      const error = new AxiosError('Test error')

      expect(error.stack).toBeDefined()
      expect(typeof error.stack).toBe('string')
      expect(error.stack).toContain('AxiosError')
    })
  })

  describe('Property Assignment', () => {
    it('should only assign code when provided', () => {
      const error1 = new AxiosError('Test', 'ERR_NETWORK')
      const error2 = new AxiosError('Test', undefined)

      expect(error1.code).toBe('ERR_NETWORK')
      expect(error2.code).toBeUndefined()
    })

    it('should only assign config when provided', () => {
      const config = { url: 'http://test.com', headers: {} } as InternalAxiosRequestConfig
      const error1 = new AxiosError('Test', undefined, config)
      const error2 = new AxiosError('Test', undefined, undefined)

      expect(error1.config).toBe(config)
      expect(error2.config).toBeUndefined()
    })

    it('should only assign request when provided', () => {
      const request = { path: '/test' }
      const error1 = new AxiosError('Test', undefined, undefined, request)
      const error2 = new AxiosError('Test', undefined, undefined, undefined)

      expect(error1.request).toBe(request)
      expect(error2.request).toBeUndefined()
    })

    it('should assign isAxiosError property', () => {
      const error = new AxiosError('Test')

      expect(error.isAxiosError).toBe(true)
    })

    it('should handle falsy code values', () => {
      const error1 = new AxiosError('Test', '')
      const error2 = new AxiosError('Test', null as any)
      const error3 = new AxiosError('Test', 0 as any)

      expect(error1.code).toBeUndefined()
      expect(error2.code).toBeUndefined()
      expect(error3.code).toBeUndefined()
    })
  })

  describe('Response Handling', () => {
    it('should assign response and extract status', () => {
      const response = {
        data: null,
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse

      const error = new AxiosError('Test', undefined, undefined, undefined, response)

      expect(error.response).toBe(response)
      expect(error.status).toBe(404)
    })

    it('should handle response with 500 status', () => {
      const response = {
        data: { error: 'Internal Server Error' },
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse

      const error = new AxiosError('Server error', 'ERR_BAD_RESPONSE', undefined, undefined, response)

      expect(error.response).toBe(response)
      expect(error.status).toBe(500)
    })

    it('should handle response without status property', () => {
      const response = {
        data: null,
        statusText: 'Unknown',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as any

      const error = new AxiosError('Test', undefined, undefined, undefined, response)

      expect(error.response).toBe(response)
      expect(error.status).toBeNull()
    })

    it('should handle response with null status', () => {
      const response = {
        data: null,
        status: null,
        statusText: 'Unknown',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as unknown as AxiosResponse

      const error = new AxiosError('Test', undefined, undefined, undefined, response)

      expect(error.response).toBe(response)
      expect(error.status).toBeNull()
    })

    it('should handle response with zero status', () => {
      const response = {
        data: null,
        status: 0,
        statusText: 'Unknown',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse

      const error = new AxiosError('Test', undefined, undefined, undefined, response)

      expect(error.response).toBe(response)
      expect(error.status).toBeNull()
    })

    it('should not assign response when undefined', () => {
      const error = new AxiosError('Test', undefined, undefined, undefined, undefined)

      expect(error.response).toBeUndefined()
      expect(error.status).toBeUndefined()
    })

    it('should handle response with undefined status', () => {
      const response = {
        data: null,
        status: undefined,
        statusText: 'Unknown',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as any

      const error = new AxiosError('Test', undefined, undefined, undefined, response)

      expect(error.response).toBe(response)
      expect(error.status).toBeNull()
    })
  })

  describe('Error Code Constants', () => {
    it('should have ERR_BAD_REQUEST constant', () => {
      expect(AxiosError.ERR_BAD_REQUEST).toBe('ERR_BAD_REQUEST')
    })

    it('should have ERR_BAD_RESPONSE constant', () => {
      expect(AxiosError.ERR_BAD_RESPONSE).toBe('ERR_BAD_RESPONSE')
    })

    it('should have ERR_NETWORK constant', () => {
      expect(AxiosError.ERR_NETWORK).toBe('ERR_NETWORK')
    })

    it('should have ERR_CANCELED constant', () => {
      expect(AxiosError.ERR_CANCELED).toBe('ERR_CANCELED')
    })

    it('should have ETIMEDOUT constant', () => {
      expect(AxiosError.ETIMEDOUT).toBe('ETIMEDOUT')
    })

    it('should have ECONNABORTED constant', () => {
      expect(AxiosError.ECONNABORTED).toBe('ECONNABORTED')
    })

    it('should have ERR_BAD_OPTION constant', () => {
      expect(AxiosError.ERR_BAD_OPTION).toBe('ERR_BAD_OPTION')
    })

    it('should have ERR_BAD_OPTION_VALUE constant', () => {
      expect(AxiosError.ERR_BAD_OPTION_VALUE).toBe('ERR_BAD_OPTION_VALUE')
    })

    it('should have ERR_DEPRECATED constant', () => {
      expect(AxiosError.ERR_DEPRECATED).toBe('ERR_DEPRECATED')
    })

    it('should have ERR_FR_TOO_MANY_REDIRECTS constant', () => {
      expect(AxiosError.ERR_FR_TOO_MANY_REDIRECTS).toBe('ERR_FR_TOO_MANY_REDIRECTS')
    })

    it('should have ERR_NOT_SUPPORT constant', () => {
      expect(AxiosError.ERR_NOT_SUPPORT).toBe('ERR_NOT_SUPPORT')
    })

    it('should have ERR_INVALID_URL constant', () => {
      expect(AxiosError.ERR_INVALID_URL).toBe('ERR_INVALID_URL')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null parameters gracefully', () => {
      const error = new AxiosError(null as any, null as any, null as any, null as any, null as any)

      expect(error.message).toBeNull()
      expect(error.name).toBe('AxiosError')
      expect(error.code).toBeUndefined()
      expect(error.config).toBeUndefined()
      expect(error.request).toBeUndefined()
      expect(error.response).toBeUndefined()
    })

    it('should handle empty string message', () => {
      const error = new AxiosError('')

      expect(error.message).toBe('')
      expect(error.name).toBe('AxiosError')
      expect(error.isAxiosError).toBe(true)
    })

    it('should handle very long message', () => {
      const longMessage = 'A'.repeat(10000)
      const error = new AxiosError(longMessage)

      expect(error.message).toBe(longMessage)
      expect(error.message.length).toBe(10000)
    })

    it('should handle mixed truthy and falsy parameters', () => {
      const config = { url: 'http://test.com', headers: {} } as InternalAxiosRequestConfig
      const error = new AxiosError('Test', undefined, config, null as any, undefined)

      expect(error.message).toBe('Test')
      expect(error.code).toBeUndefined()
      expect(error.config).toBe(config)
      expect(error.request).toBeUndefined()
      expect(error.response).toBeUndefined()
    })

    it('should handle special characters in message', () => {
      const message = 'Error: <script>alert("xss")</script> & " \' \n \t'
      const error = new AxiosError(message)

      expect(error.message).toBe(message)
    })

    it('should handle numeric message', () => {
      const error = new AxiosError(404 as any)

      expect(error.message).toBe(404)
    })

    it('should handle object as message', () => {
      const objMessage = { error: 'test' } as any
      const error = new AxiosError(objMessage)

      expect(error.message).toEqual({ error: 'test' })
    })
  })

  describe('toJSON Method', () => {
    it('should serialize error to JSON with basic properties', () => {
      const message = 'Test error'
      const code = 'ERR_BAD_REQUEST'
      const config = { url: 'http://test.com', headers: {} } as InternalAxiosRequestConfig
      const error = new AxiosError(message, code, config)

      const json = error.toJSON()

      expect(json).toHaveProperty('message', message)
      expect(json).toHaveProperty('name', 'AxiosError')
      expect(json).toHaveProperty('code', code)
    })

    it('should include stack trace in JSON serialization', () => {
      const error = new AxiosError('Test error')
      const json = error.toJSON()

      expect(json).toHaveProperty('stack')
      expect(typeof (json as any).stack).toBe('string')
    })

    it('should serialize error without optional properties', () => {
      const error = new AxiosError('Simple error')
      const json = error.toJSON()

      expect(json).toHaveProperty('message', 'Simple error')
      expect(json).toHaveProperty('name', 'AxiosError')
    })
  })

  describe('Static from Method', () => {
    it('should create AxiosError from generic Error', () => {
      const originalError = new Error('Original error')
      const code = 'ERR_NETWORK'
      const config = { url: 'http://test.com', headers: {} } as InternalAxiosRequestConfig

      const axiosError = AxiosError.from(originalError, code, config)

      expect(axiosError).toBeInstanceOf(AxiosError)
      expect(axiosError.message).toBe('Original error')
      expect(axiosError.code).toBe(code)
      expect(axiosError.config).toBe(config)
      expect(axiosError.isAxiosError).toBe(true)
    })

    it('should preserve original AxiosError properties', () => {
      const originalError = new AxiosError('Original', 'ERR_BAD_REQUEST')
      const newError = AxiosError.from(originalError)

      expect(newError).toBeInstanceOf(AxiosError)
      expect(newError.message).toBe('Original')
      expect(newError.code).toBe('ERR_BAD_REQUEST')
    })

    it('should create AxiosError from Error with all parameters', () => {
      const originalError = new Error('Test')
      const code = 'ERR_BAD_RESPONSE'
      const config = { url: 'http://test.com', headers: {} } as InternalAxiosRequestConfig
      const request = { path: '/test' }
      const response = {
        data: null,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: config,
      } as AxiosResponse

      const axiosError = AxiosError.from(originalError, code, config, request, response)

      expect(axiosError).toBeInstanceOf(AxiosError)
      expect(axiosError.message).toBe('Test')
      expect(axiosError.code).toBe(code)
      expect(axiosError.config).toBe(config)
      expect(axiosError.request).toBe(request)
      expect(axiosError.response).toBe(response)
      expect(axiosError.status).toBe(500)
    })

    it('should handle non-Error objects', () => {
      const errorLike = { message: 'Error-like object' }
      const axiosError = AxiosError.from(errorLike as any, 'ERR_NETWORK')

      expect(axiosError).toBeInstanceOf(AxiosError)
      expect(axiosError.code).toBe('ERR_NETWORK')
    })

    it('should preserve stack trace from original error', () => {
      const originalError = new Error('Original')
      const axiosError = AxiosError.from(originalError)

      expect(axiosError.stack).toBeDefined()
      expect(typeof axiosError.stack).toBe('string')
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle network timeout error scenario', () => {
      const config = {
        url: 'http://api.example.com/data',
        method: 'GET',
        timeout: 5000,
        headers: {},
      } as InternalAxiosRequestConfig

      const error = new AxiosError('timeout of 5000ms exceeded', AxiosError.ETIMEDOUT, config)

      expect(error.code).toBe('ETIMEDOUT')
      expect(error.config?.url).toBe('http://api.example.com/data')
      expect(error.isAxiosError).toBe(true)
    })

    it('should handle 404 Not Found error scenario', () => {
      const config = { url: 'http://api.example.com/user/123', headers: {} } as InternalAxiosRequestConfig
      const response = {
        data: { error: 'User not found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: config,
      } as AxiosResponse

      const error = new AxiosError(
        'Request failed with status code 404',
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response
      )

      expect(error.status).toBe(404)
      expect(error.response?.data).toEqual({ error: 'User not found' })
      expect(error.code).toBe('ERR_BAD_REQUEST')
    })

    it('should handle network error scenario', () => {
      const config = { url: 'http://offline-api.example.com', headers: {} } as InternalAxiosRequestConfig
      const request = { path: '/data' }

      const error = new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request)

      expect(error.code).toBe('ERR_NETWORK')
      expect(error.request).toBeDefined()
      expect(error.response).toBeUndefined()
    })

    it('should handle request cancellation scenario', () => {
      const config = { url: 'http://api.example.com', headers: {} } as InternalAxiosRequestConfig
      const error = new AxiosError('Request canceled', AxiosError.ERR_CANCELED, config)

      expect(error.code).toBe('ERR_CANCELED')
      expect(error.message).toBe('Request canceled')
    })
  })
})
