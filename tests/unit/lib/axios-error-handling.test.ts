import { describe, it, expect, beforeEach } from 'vitest';
import axios, { AxiosError, AxiosResponse } from 'axios';

describe('AxiosError Construction and Serialization', () => {
  describe('Error Object Construction', () => {
    it('should construct AxiosError with response data', () => {
      const response: Partial<AxiosResponse> = {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Job not found' },
        headers: {},
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed with status code 404',
        'ERR_BAD_REQUEST',
        {} as any,
        {},
        response as AxiosResponse
      );

      expect(error.message).toBe('Request failed with status code 404');
      expect(error.code).toBe('ERR_BAD_REQUEST');
      expect(error.response?.status).toBe(404);
      expect(error.response?.statusText).toBe('Not Found');
      expect(error.response?.data).toEqual({ error: 'Job not found' });
      expect(error.name).toBe('AxiosError');
      expect(error.isAxiosError).toBe(true);
    });

    it('should construct AxiosError without response (network error)', () => {
      const error = new AxiosError(
        'Network Error',
        'ERR_NETWORK',
        {} as any,
        {}
      );

      expect(error.message).toBe('Network Error');
      expect(error.code).toBe('ERR_NETWORK');
      expect(error.response).toBeUndefined();
      expect(error.name).toBe('AxiosError');
      expect(error.isAxiosError).toBe(true);
    });

    it('should construct AxiosError with timeout', () => {
      const config = { timeout: 10000 } as any;
      const error = new AxiosError(
        'timeout of 10000ms exceeded',
        'ECONNABORTED',
        config,
        {}
      );

      expect(error.message).toContain('timeout');
      expect(error.code).toBe('ECONNABORTED');
      expect(error.config?.timeout).toBe(10000);
      expect(error.response).toBeUndefined();
    });

    it('should construct AxiosError with all error codes', () => {
      const errorCodes = [
        'ERR_BAD_OPTION_VALUE',
        'ERR_BAD_OPTION',
        'ECONNABORTED',
        'ETIMEDOUT',
        'ERR_NETWORK',
        'ERR_FR_TOO_MANY_REDIRECTS',
        'ERR_DEPRECATED',
        'ERR_BAD_RESPONSE',
        'ERR_BAD_REQUEST',
        'ERR_CANCELED',
      ];

      errorCodes.forEach(code => {
        const error = new AxiosError('Test error', code, {} as any);
        expect(error.code).toBe(code);
        expect(error.isAxiosError).toBe(true);
      });
    });
  });

  describe('Property Assignment and Extraction', () => {
    it('should correctly assign and extract status property', () => {
      const response: Partial<AxiosResponse> = {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Database connection failed' },
        headers: {},
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed',
        'ERR_BAD_RESPONSE',
        {} as any,
        {},
        response as AxiosResponse
      );

      expect(error.response?.status).toBe(500);
      expect(error.response?.statusText).toBe('Internal Server Error');
      expect(error.response?.data).toEqual({ error: 'Database connection failed' });
    });

    it('should handle missing response properties gracefully', () => {
      const error = new AxiosError(
        'Request failed',
        'ERR_NETWORK',
        {} as any,
        {}
      );

      expect(error.response).toBeUndefined();
      expect(error.status).toBeUndefined();
    });

    it('should extract complex response data structures', () => {
      const complexData = {
        success: false,
        error: 'Insufficient balance',
        balance: 50,
        required: 100,
        details: {
          userId: '123',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };

      const response: Partial<AxiosResponse> = {
        status: 400,
        statusText: 'Bad Request',
        data: complexData,
        headers: { 'content-type': 'application/json' },
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        {} as any,
        {},
        response as AxiosResponse
      );

      expect(error.response?.data).toEqual(complexData);
      expect(error.response?.data.balance).toBe(50);
      expect(error.response?.data.required).toBe(100);
      expect(error.response?.data.details.userId).toBe('123');
    });

    it('should preserve response headers', () => {
      const response: Partial<AxiosResponse> = {
        status: 429,
        statusText: 'Too Many Requests',
        data: { message: 'Rate limit exceeded' },
        headers: {
          'retry-after': '60',
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '0',
        },
        config: {} as any,
      };

      const error = new AxiosError(
        'Rate limit exceeded',
        'ERR_BAD_RESPONSE',
        {} as any,
        {},
        response as AxiosResponse
      );

      expect(error.response?.headers['retry-after']).toBe('60');
      expect(error.response?.headers['x-ratelimit-limit']).toBe('100');
      expect(error.response?.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Error Serialization for Logging', () => {
    it('should serialize AxiosError with response for logging', () => {
      const response: Partial<AxiosResponse> = {
        status: 403,
        statusText: 'Forbidden',
        data: { error: 'Invalid access token' },
        headers: { 'content-type': 'application/json' },
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed with status code 403',
        'ERR_BAD_REQUEST',
        { method: 'get', url: '/api/balance' } as any,
        {},
        response as AxiosResponse
      );

      // Serialize for logging
      const serialized = {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      };

      expect(serialized).toEqual({
        status: 403,
        data: { error: 'Invalid access token' },
        message: 'Request failed with status code 403',
      });
    });

    it('should serialize network error without response', () => {
      const error = new AxiosError(
        'Network Error',
        'ERR_NETWORK',
        {} as any,
        {}
      );

      // Serialize for logging
      const serialized = {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      };

      expect(serialized).toEqual({
        status: undefined,
        data: undefined,
        message: 'Network Error',
      });
    });

    it('should convert to JSON for external logging systems', () => {
      const response: Partial<AxiosResponse> = {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Server error', code: 'E_INTERNAL' },
        headers: {},
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        {} as any,
        {},
        response as AxiosResponse
      );

      // Convert to JSON-serializable object
      const jsonError = JSON.parse(JSON.stringify({
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
      }));

      expect(jsonError.message).toBe('Request failed with status code 500');
      expect(jsonError.code).toBe('ERR_BAD_RESPONSE');
      expect(jsonError.status).toBe(500);
      expect(jsonError.data).toEqual({ error: 'Server error', code: 'E_INTERNAL' });
    });
  });

  describe('Type Guard Functionality', () => {
    it('should correctly identify AxiosError with isAxiosError flag', () => {
      const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
      
      expect(axios.isAxiosError(error)).toBe(true);
      expect(error.isAxiosError).toBe(true);
    });

    it('should distinguish AxiosError from generic Error', () => {
      const genericError = new Error('Generic error');
      const axiosError = new AxiosError('Axios error', 'ERR_NETWORK');

      expect(axios.isAxiosError(genericError)).toBe(false);
      expect(axios.isAxiosError(axiosError)).toBe(true);
    });

    it('should work with type narrowing in TypeScript', () => {
      const error: Error = new AxiosError(
        'Request failed',
        'ERR_BAD_REQUEST',
        {} as any,
        {},
        {
          status: 400,
          statusText: 'Bad Request',
          data: { error: 'Invalid input' },
          headers: {},
          config: {} as any,
        }
      );

      if (axios.isAxiosError(error)) {
        // TypeScript should narrow the type here
        expect(error.response?.status).toBe(400);
        expect(error.response?.data).toEqual({ error: 'Invalid input' });
      } else {
        throw new Error('Should be AxiosError');
      }
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle AxiosError with null response', () => {
      const error = new AxiosError('Request failed', 'ERR_NETWORK');
      error.response = null as any;

      expect(error.response).toBeNull();
      // Serialization should handle null gracefully
      const serialized = {
        status: error.response?.status,
        data: error.response?.data,
      };
      expect(serialized).toEqual({ status: undefined, data: undefined });
    });

    it('should handle AxiosError with undefined status in response', () => {
      const response = {
        status: undefined,
        data: { error: 'Unknown error' },
        statusText: '',
        headers: {},
        config: {} as any,
      } as any;

      const error = new AxiosError(
        'Request failed',
        'ERR_UNKNOWN',
        {} as any,
        {},
        response
      );

      expect(error.response?.status).toBeUndefined();
      expect(error.response?.data).toEqual({ error: 'Unknown error' });
    });

    it('should handle AxiosError with empty response data', () => {
      const response: Partial<AxiosResponse> = {
        status: 500,
        statusText: 'Internal Server Error',
        data: '',
        headers: {},
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        {} as any,
        {},
        response as AxiosResponse
      );

      expect(error.response?.data).toBe('');
      expect(error.response?.status).toBe(500);
    });

    it('should handle multiline error messages', () => {
      const message = `Request failed:
        - Invalid email format
        - Password too short
        - Username already taken`;

      const error = new AxiosError(message, 'ERR_BAD_REQUEST');

      expect(error.message).toContain('Request failed');
      expect(error.message).toContain('Invalid email format');
      expect(error.message).toContain('Password too short');
    });

    it('should handle error without code', () => {
      const error = new AxiosError('Request failed');

      expect(error.message).toBe('Request failed');
      expect(error.code).toBeUndefined();
      expect(error.isAxiosError).toBe(true);
    });

    it('should handle error with custom properties', () => {
      const response: Partial<AxiosResponse> = {
        status: 400,
        data: { error: 'Bad request', customField: 'custom value' },
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const error = new AxiosError(
        'Request failed',
        'ERR_BAD_REQUEST',
        {} as any,
        {},
        response as AxiosResponse
      );

      expect(error.response?.data.customField).toBe('custom value');
    });
  });

  describe('HTTP Status Code Scenarios', () => {
    const statusCodeTests = [
      { status: 400, text: 'Bad Request', code: 'ERR_BAD_REQUEST' },
      { status: 401, text: 'Unauthorized', code: 'ERR_BAD_REQUEST' },
      { status: 403, text: 'Forbidden', code: 'ERR_BAD_REQUEST' },
      { status: 404, text: 'Not Found', code: 'ERR_BAD_REQUEST' },
      { status: 429, text: 'Too Many Requests', code: 'ERR_BAD_REQUEST' },
      { status: 500, text: 'Internal Server Error', code: 'ERR_BAD_RESPONSE' },
      { status: 502, text: 'Bad Gateway', code: 'ERR_BAD_RESPONSE' },
      { status: 503, text: 'Service Unavailable', code: 'ERR_BAD_RESPONSE' },
    ];

    statusCodeTests.forEach(({ status, text, code }) => {
      it(`should handle ${status} ${text} errors`, () => {
        const response: Partial<AxiosResponse> = {
          status,
          statusText: text,
          data: { error: text },
          headers: {},
          config: {} as any,
        };

        const error = new AxiosError(
          `Request failed with status code ${status}`,
          code,
          {} as any,
          {},
          response as AxiosResponse
        );

        expect(error.response?.status).toBe(status);
        expect(error.response?.statusText).toBe(text);
        expect(error.code).toBe(code);
      });
    });
  });
});
