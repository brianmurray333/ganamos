/**
 * Unit tests for AxiosError error construction and serialization
 * 
 * Tests cover:
 * - Error construction with various parameter combinations
 * - Property assignment verification
 * - Serialization logic (toJSON method)
 * - Static from() factory method
 * - Error code constants
 * - Type checking (instanceof, isAxiosError)
 * - Edge cases (null responses, missing properties, various HTTP status codes)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import {
  createMockAxiosResponse,
  createMockAxiosRequest,
  createMockAxiosConfig,
  createCircularConfig,
  ERROR_SCENARIOS,
} from '@/tests/helpers/axios-error-test-helpers';

describe('AxiosError', () => {
  describe('Error Construction', () => {
    it('should create error with message only', () => {
      const error = new AxiosError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('AxiosError');
      expect(error.code).toBeUndefined();
      expect(error.config).toBeUndefined();
      expect(error.request).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it('should create error with message and code', () => {
      const error = new AxiosError('Network error', AxiosError.ERR_NETWORK);

      expect(error.message).toBe('Network error');
      expect(error.code).toBe('ERR_NETWORK');
      expect(error.name).toBe('AxiosError');
    });

    it('should create error with message, code, and config', () => {
      const config = createMockAxiosConfig();
      const error = new AxiosError('Bad request', AxiosError.ERR_BAD_REQUEST, config);

      expect(error.message).toBe('Bad request');
      expect(error.code).toBe('ERR_BAD_REQUEST');
      expect(error.config).toBeDefined();
      expect(error.config?.baseURL).toBe('https://api.example.com');
    });

    it('should create error with all parameters', () => {
      const config = createMockAxiosConfig('https://api.test.com', 'POST', '/users');
      const request = createMockAxiosRequest('POST', '/users');
      const response = createMockAxiosResponse(500, { error: 'Server error' });

      const error = new AxiosError(
        'Request failed',
        AxiosError.ERR_BAD_RESPONSE,
        config,
        request,
        response as any
      );

      expect(error.message).toBe('Request failed');
      expect(error.code).toBe('ERR_BAD_RESPONSE');
      expect(error.config).toBe(config);
      expect(error.request).toBe(request);
      expect(error.response).toBeDefined();
      expect(error.response?.status).toBe(500);
    });

    it('should handle undefined code parameter', () => {
      const error = new AxiosError('Error', undefined as any);

      expect(error.code).toBeUndefined();
    });

    it('should handle null parameters gracefully', () => {
      const error = new AxiosError('Error', null as any, null as any, null as any, null as any);

      expect(error.message).toBe('Error');
      // AxiosError converts null to undefined for these properties
      expect(error.code).toBeUndefined();
      expect(error.config).toBeUndefined();
      expect(error.request).toBeUndefined();
      expect(error.response).toBeUndefined();
    });
  });

  describe('Property Assignment', () => {
    it('should always set name to "AxiosError"', () => {
      const error1 = new AxiosError('Test 1');
      const error2 = new AxiosError('Test 2', AxiosError.ERR_NETWORK);

      expect(error1.name).toBe('AxiosError');
      expect(error2.name).toBe('AxiosError');
    });

    it('should extract status from response when available', () => {
      const response = createMockAxiosResponse(404, { error: 'Not found' });
      const error = new AxiosError('Not found', AxiosError.ERR_BAD_REQUEST, undefined, undefined, response as any);

      expect(error.status).toBe(404);
      expect(error.response?.status).toBe(404);
    });

    it('should set status to null when response has no status', () => {
      const response = { data: { error: 'Unknown' } };
      const error = new AxiosError('Error', AxiosError.ERR_NETWORK, undefined, undefined, response as any);

      expect(error.status).toBeNull();
    });

    it('should set status to undefined when no response provided', () => {
      const error = new AxiosError('Error', AxiosError.ERR_NETWORK);

      expect(error.status).toBeUndefined();
    });

    it('should preserve all response data', () => {
      const responseData = {
        error: 'Validation failed',
        details: ['Field is required', 'Invalid format'],
      };
      const response = createMockAxiosResponse(400, responseData);
      const error = new AxiosError('Validation error', AxiosError.ERR_BAD_REQUEST, undefined, undefined, response as any);

      expect(error.response?.data).toEqual(responseData);
      expect(error.response?.data.details).toHaveLength(2);
    });
  });

  describe('Error Code Constants', () => {
    it('should define all standard error codes', () => {
      expect(AxiosError.ERR_BAD_OPTION_VALUE).toBe('ERR_BAD_OPTION_VALUE');
      expect(AxiosError.ERR_BAD_OPTION).toBe('ERR_BAD_OPTION');
      expect(AxiosError.ECONNABORTED).toBe('ECONNABORTED');
      expect(AxiosError.ETIMEDOUT).toBe('ETIMEDOUT');
      expect(AxiosError.ERR_NETWORK).toBe('ERR_NETWORK');
      expect(AxiosError.ERR_FR_TOO_MANY_REDIRECTS).toBe('ERR_FR_TOO_MANY_REDIRECTS');
      expect(AxiosError.ERR_DEPRECATED).toBe('ERR_DEPRECATED');
      expect(AxiosError.ERR_BAD_RESPONSE).toBe('ERR_BAD_RESPONSE');
      expect(AxiosError.ERR_BAD_REQUEST).toBe('ERR_BAD_REQUEST');
      expect(AxiosError.ERR_CANCELED).toBe('ERR_CANCELED');
      expect(AxiosError.ERR_NOT_SUPPORT).toBe('ERR_NOT_SUPPORT');
      expect(AxiosError.ERR_INVALID_URL).toBe('ERR_INVALID_URL');
    });
  });

  describe('Serialization (toJSON)', () => {
    it('should serialize error with all basic properties', () => {
      const error = new AxiosError('Test error', AxiosError.ERR_NETWORK);
      const json = error.toJSON();

      expect(json.message).toBe('Test error');
      expect(json.name).toBe('AxiosError');
      expect(json.code).toBe('ERR_NETWORK');
      expect(json.stack).toBeDefined();
    });

    it('should include status in serialization when available', () => {
      const response = createMockAxiosResponse(500, { error: 'Server error' });
      const error = new AxiosError('Server error', AxiosError.ERR_BAD_RESPONSE, undefined, undefined, response as any);
      const json = error.toJSON();

      expect(json.status).toBe(500);
    });

    it('should handle config with circular references in serialization', () => {
      const config = createCircularConfig();
      const error = new AxiosError('Circular error', AxiosError.ERR_BAD_REQUEST, config);

      // Should not throw when serializing
      expect(() => error.toJSON()).not.toThrow();

      const json = error.toJSON();
      expect(json.message).toBe('Circular error');
      expect(json.config).toBeDefined();
      // Config should be serialized without circular references
      expect(json.config).not.toBe(config); // Should be a copy/transformation
    });

    it('should serialize to valid JSON string', () => {
      const response = createMockAxiosResponse(404, { error: 'Not found' });
      const config = createMockAxiosConfig();
      const error = new AxiosError('Not found', AxiosError.ERR_BAD_REQUEST, config, undefined, response as any);

      // Should not throw when stringifying
      expect(() => JSON.stringify(error)).not.toThrow();

      const jsonString = JSON.stringify(error);
      const parsed = JSON.parse(jsonString);

      expect(parsed.message).toBe('Not found');
      expect(parsed.code).toBe('ERR_BAD_REQUEST');
      expect(parsed.status).toBe(404);
    });

    it('should include stack trace in serialization', () => {
      const error = new AxiosError('Test error');
      const json = error.toJSON();

      expect(json.stack).toBeDefined();
      expect(typeof json.stack).toBe('string');
      expect(json.stack).toContain('AxiosError');
    });
  });

  describe('AxiosError.from() Static Method', () => {
    it('should create AxiosError from generic Error', () => {
      const originalError = new Error('Original error message');
      const axiosError = AxiosError.from(originalError);

      expect(axiosError).toBeInstanceOf(AxiosError);
      expect(axiosError.message).toBe('Original error message');
      expect(axiosError.isAxiosError).toBe(true);
    });

    it('should use explicit code parameter when provided', () => {
      const originalError = new Error('Network failure');
      const axiosError = AxiosError.from(originalError, AxiosError.ERR_NETWORK);

      expect(axiosError.code).toBe('ERR_NETWORK');
    });

    it('should preserve original error code when explicit code not provided', () => {
      const originalError: any = new Error('Connection refused');
      originalError.code = 'ECONNREFUSED';

      const axiosError = AxiosError.from(originalError);

      expect(axiosError.code).toBe('ECONNREFUSED');
    });

    it('should chain original error on cause property', () => {
      const originalError = new Error('Root cause');
      const axiosError = AxiosError.from(originalError);

      expect(axiosError.cause).toBe(originalError);
    });

    it('should preserve original error name', () => {
      const originalError = new TypeError('Type mismatch');
      const axiosError = AxiosError.from(originalError);

      expect(axiosError.name).toBe('TypeError');
    });

    it('should apply custom properties when provided', () => {
      const originalError = new Error('Test');
      const customProps = { customField: 'custom value', extraData: { key: 'value' } };
      const axiosError = AxiosError.from(originalError, undefined, undefined, undefined, undefined, customProps);

      expect((axiosError as any).customField).toBe('custom value');
      expect((axiosError as any).extraData.key).toBe('value');
    });

    it('should handle error without message', () => {
      const originalError = new Error();
      const axiosError = AxiosError.from(originalError);

      expect(axiosError.message).toBe('Error'); // Default message
    });

    it('should handle null error gracefully', () => {
      const axiosError = AxiosError.from(null as any, AxiosError.ERR_NETWORK);

      expect(axiosError).toBeInstanceOf(AxiosError);
      expect(axiosError.message).toBe('Error');
      expect(axiosError.code).toBe('ERR_NETWORK');
    });

    it('should include config, request, and response when provided', () => {
      const originalError = new Error('Request failed');
      const config = createMockAxiosConfig();
      const request = createMockAxiosRequest();
      const response = createMockAxiosResponse(500, { error: 'Internal error' });

      const axiosError = AxiosError.from(
        originalError,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        request,
        response as any
      );

      expect(axiosError.config).toBe(config);
      expect(axiosError.request).toBe(request);
      expect(axiosError.response?.status).toBe(500);
    });
  });

  describe('Type Checking and instanceof', () => {
    it('should be instanceof Error', () => {
      const error = new AxiosError('Test');

      expect(error instanceof Error).toBe(true);
    });

    it('should be instanceof AxiosError', () => {
      const error = new AxiosError('Test');

      expect(error instanceof AxiosError).toBe(true);
    });

    it('should have isAxiosError property set to true', () => {
      const error = new AxiosError('Test');

      expect(error.isAxiosError).toBe(true);
    });

    it('should be detected by axios.isAxiosError() helper', () => {
      const error = new AxiosError('Test');

      expect(axios.isAxiosError(error)).toBe(true);
    });

    it('should not identify generic Error as AxiosError', () => {
      const error = new Error('Generic error');

      expect(axios.isAxiosError(error)).toBe(false);
    });
  });

  describe('HTTP Status Code Edge Cases', () => {
    it('should handle 1xx informational responses', () => {
      const response = createMockAxiosResponse(100, null, {}, 'Continue');
      const error = new AxiosError('Informational', undefined, undefined, undefined, response as any);

      expect(error.status).toBe(100);
      expect(error.response?.statusText).toBe('Continue');
    });

    it('should handle 2xx success responses (edge case for errors)', () => {
      const response = createMockAxiosResponse(200, { data: 'success' }, {}, 'OK');
      const error = new AxiosError('Unexpected success as error', undefined, undefined, undefined, response as any);

      expect(error.status).toBe(200);
    });

    it('should handle 3xx redirect responses', () => {
      const response = createMockAxiosResponse(301, null, { Location: '/new-url' }, 'Moved Permanently');
      const error = new AxiosError('Redirect error', AxiosError.ERR_FR_TOO_MANY_REDIRECTS, undefined, undefined, response as any);

      expect(error.status).toBe(301);
      expect(error.code).toBe('ERR_FR_TOO_MANY_REDIRECTS');
    });

    it('should handle 4xx client errors', () => {
      const testCases = [
        { status: 400, code: AxiosError.ERR_BAD_REQUEST },
        { status: 401, code: AxiosError.ERR_BAD_REQUEST },
        { status: 403, code: AxiosError.ERR_BAD_REQUEST },
        { status: 404, code: AxiosError.ERR_BAD_REQUEST },
        { status: 408, code: AxiosError.ETIMEDOUT },
        { status: 429, code: AxiosError.ERR_BAD_REQUEST },
      ];

      testCases.forEach(({ status, code }) => {
        const response = createMockAxiosResponse(status, { error: 'Client error' });
        const error = new AxiosError(`Client error ${status}`, code, undefined, undefined, response as any);

        expect(error.status).toBe(status);
        expect(error.code).toBe(code);
      });
    });

    it('should handle 5xx server errors', () => {
      const testCases = [500, 502, 503, 504];

      testCases.forEach((status) => {
        const response = createMockAxiosResponse(status, { error: 'Server error' });
        const error = new AxiosError(`Server error ${status}`, AxiosError.ERR_BAD_RESPONSE, undefined, undefined, response as any);

        expect(error.status).toBe(status);
        expect(error.code).toBe('ERR_BAD_RESPONSE');
      });
    });

    it('should handle status 0 for file protocol or CORS errors', () => {
      const response = createMockAxiosResponse(0, null, {}, '');
      const error = new AxiosError('CORS error', AxiosError.ERR_NETWORK, undefined, undefined, response as any);

      // AxiosError treats status 0 as null (no status)
      expect(error.status).toBeNull();
    });
  });

  describe('Common Error Scenarios', () => {
    it('should handle network error scenario', () => {
      const scenario = ERROR_SCENARIOS.NETWORK_ERROR;
      const error = new AxiosError(scenario.message, scenario.code as any);

      expect(error.message).toBe('Network Error');
      expect(error.code).toBe('ERR_NETWORK');
      expect(error.response).toBeUndefined();
    });

    it('should handle timeout scenario', () => {
      const scenario = ERROR_SCENARIOS.TIMEOUT;
      const error = new AxiosError(scenario.message, scenario.code as any);

      expect(error.message).toContain('timeout');
      expect(error.code).toBe('ETIMEDOUT');
    });

    it('should handle 400 bad request scenario', () => {
      const scenario = ERROR_SCENARIOS.BAD_REQUEST;
      const response = createMockAxiosResponse(400, { error: 'Invalid input' });
      const error = new AxiosError(scenario.message, scenario.code as any, undefined, undefined, response as any);

      expect(error.status).toBe(400);
      expect(error.code).toBe('ERR_BAD_REQUEST');
      expect(error.response?.data.error).toBe('Invalid input');
    });

    it('should handle 500 server error scenario', () => {
      const scenario = ERROR_SCENARIOS.SERVER_ERROR;
      const response = createMockAxiosResponse(500, { error: 'Internal server error' });
      const error = new AxiosError(scenario.message, scenario.code as any, undefined, undefined, response as any);

      expect(error.status).toBe(500);
      expect(error.code).toBe('ERR_BAD_RESPONSE');
    });

    it('should handle missing response data gracefully', () => {
      const response = createMockAxiosResponse(404, null);
      const error = new AxiosError('Not found', AxiosError.ERR_BAD_REQUEST, undefined, undefined, response as any);

      expect(error.status).toBe(404);
      expect(error.response?.data).toBeNull();
    });
  });

  describe('Complex Error Scenarios', () => {
    it('should handle error with large response payload', () => {
      const largeData = {
        error: 'Validation failed',
        details: Array(100).fill({ field: 'test', message: 'Invalid' }),
        metadata: { timestamp: Date.now(), requestId: 'abc-123' },
      };
      const response = createMockAxiosResponse(400, largeData);
      const error = new AxiosError('Validation error', AxiosError.ERR_BAD_REQUEST, undefined, undefined, response as any);

      expect(error.response?.data.details).toHaveLength(100);
      expect(error.toJSON()).toBeDefined();
    });

    it('should handle nested error transformation', () => {
      const rootError = new Error('Root cause');
      const intermediateError = AxiosError.from(rootError, AxiosError.ERR_NETWORK);
      const finalError = AxiosError.from(intermediateError, AxiosError.ERR_BAD_RESPONSE);

      // AxiosError.from() always chains to the root cause, not the immediate error
      expect(finalError.cause).toBe(rootError);
      expect(intermediateError.cause).toBe(rootError);
    });

    it('should preserve request headers in error context', () => {
      const config = createMockAxiosConfig('https://api.test.com', 'POST', '/data', { key: 'value' });
      config.headers = {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom',
      };

      const error = new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config);

      expect(error.config?.headers?.['Authorization']).toBe('Bearer token123');
      expect(error.config?.headers?.['X-Custom-Header']).toBe('custom');
    });

    it('should handle empty message gracefully', () => {
      const error = new AxiosError('');

      expect(error.message).toBe('');
      expect(error.name).toBe('AxiosError');
      expect(() => error.toJSON()).not.toThrow();
    });

    it('should maintain error chain through multiple transformations', () => {
      const originalError = new Error('Original');
      const error1 = AxiosError.from(originalError, 'CODE1' as any);
      const error2 = AxiosError.from(error1, 'CODE2' as any);
      const error3 = AxiosError.from(error2, 'CODE3' as any);

      // Each AxiosError has the correct code
      expect(error1.code).toBe('CODE1');
      expect(error2.code).toBe('CODE2');
      expect(error3.code).toBe('CODE3');
      
      // But all point to the original root cause (not a chain)
      expect(error1.cause).toBe(originalError);
      expect(error2.cause).toBe(originalError);
      expect(error3.cause).toBe(originalError);
    });
  });
});
