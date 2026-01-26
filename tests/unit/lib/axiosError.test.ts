import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

// Access AxiosError from axios
const AxiosError = axios.AxiosError;

describe('AxiosError Constructor', () => {
  describe('Basic Construction', () => {
    it('should create an AxiosError with all parameters', () => {
      const message = 'Network Error';
      const code = 'ERR_NETWORK';
      const config = { url: '/api/test', method: 'GET' };
      const request = { path: '/api/test' };
      const response = { status: 500, data: { error: 'Server Error' } };

      const error = new AxiosError(message, code, config, request, response);

      expect(error.message).toBe(message);
      expect(error.name).toBe('AxiosError');
      expect(error.code).toBe(code);
      expect(error.config).toBe(config);
      expect(error.request).toBe(request);
      expect(error.response).toBe(response);
      expect(error.status).toBe(500);
    });

    it('should create an AxiosError with only message', () => {
      const message = 'Simple error';
      const error = new AxiosError(message);

      expect(error.message).toBe(message);
      expect(error.name).toBe('AxiosError');
      expect(error.code).toBeUndefined();
      expect(error.config).toBeUndefined();
      expect(error.request).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it('should create an AxiosError with message and code', () => {
      const message = 'Timeout error';
      const code = 'ETIMEDOUT';

      const error = new AxiosError(message, code);

      expect(error.message).toBe(message);
      expect(error.code).toBe(code);
      expect(error.name).toBe('AxiosError');
    });
  });

  describe('Stack Trace Handling', () => {
    it('should have a stack trace', () => {
      const error = new AxiosError('Test error');
      
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('AxiosError');
    });

    it('should use Error.captureStackTrace when available', () => {
      // Error.captureStackTrace is available in V8 (Node.js/Chrome)
      if (Error.captureStackTrace) {
        const error = new AxiosError('Test error');
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('Test error');
      }
    });

    it('should fallback to creating new Error().stack when captureStackTrace is unavailable', () => {
      const originalCaptureStackTrace = Error.captureStackTrace;
      
      // Temporarily remove captureStackTrace
      (Error as any).captureStackTrace = undefined;
      
      const error = new AxiosError('Fallback test');
      expect(error.stack).toBeDefined();
      
      // Restore original
      Error.captureStackTrace = originalCaptureStackTrace;
    });
  });

  describe('Property Assignment', () => {
    it('should not assign code if falsy', () => {
      const error1 = new AxiosError('Test', null);
      const error2 = new AxiosError('Test', undefined);
      const error3 = new AxiosError('Test', '');
      const error4 = new AxiosError('Test', 0);

      expect(error1.code).toBeUndefined();
      expect(error2.code).toBeUndefined();
      expect(error3.code).toBeUndefined();
      expect(error4.code).toBeUndefined();
    });

    it('should not assign config if falsy', () => {
      const error1 = new AxiosError('Test', 'CODE', null);
      const error2 = new AxiosError('Test', 'CODE', undefined);

      expect(error1.config).toBeUndefined();
      expect(error2.config).toBeUndefined();
    });

    it('should not assign request if falsy', () => {
      const error1 = new AxiosError('Test', 'CODE', {}, null);
      const error2 = new AxiosError('Test', 'CODE', {}, undefined);

      expect(error1.request).toBeUndefined();
      expect(error2.request).toBeUndefined();
    });

    it('should assign code when truthy', () => {
      const error = new AxiosError('Test', 'ERR_NETWORK');
      expect(error.code).toBe('ERR_NETWORK');
    });

    it('should assign config when truthy', () => {
      const config = { url: '/test' };
      const error = new AxiosError('Test', 'CODE', config);
      expect(error.config).toBe(config);
    });

    it('should assign request when truthy', () => {
      const request = { path: '/test' };
      const error = new AxiosError('Test', 'CODE', {}, request);
      expect(error.request).toBe(request);
    });
  });

  describe('Status Extraction', () => {
    it('should extract status from response.status', () => {
      const response = { status: 404, data: { error: 'Not Found' } };
      const error = new AxiosError('Not found', 'ERR_BAD_REQUEST', {}, {}, response);

      expect(error.status).toBe(404);
    });

    it('should set status to null when response.status is undefined', () => {
      const response = { data: { error: 'No status' } };
      const error = new AxiosError('Error', 'ERR_BAD_RESPONSE', {}, {}, response);

      expect(error.status).toBeNull();
    });

    it('should set status to null when response.status is 0', () => {
      const response = { status: 0, data: {} };
      const error = new AxiosError('Error', 'ERR_BAD_RESPONSE', {}, {}, response);

      expect(error.status).toBeNull();
    });

    it('should set status to null when response.status is null', () => {
      const response = { status: null, data: {} };
      const error = new AxiosError('Error', 'ERR_BAD_RESPONSE', {}, {}, response);

      expect(error.status).toBeNull();
    });

    it('should not set status or response when response is falsy', () => {
      const error1 = new AxiosError('Test', 'CODE', {}, {}, null);
      const error2 = new AxiosError('Test', 'CODE', {}, {}, undefined);

      expect(error1.response).toBeUndefined();
      expect(error1.status).toBeUndefined();
      expect(error2.response).toBeUndefined();
      expect(error2.status).toBeUndefined();
    });

    it('should handle various HTTP status codes', () => {
      const statusCodes = [200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503];
      
      statusCodes.forEach(statusCode => {
        const response = { status: statusCode };
        const error = new AxiosError('Test', 'CODE', {}, {}, response);
        expect(error.status).toBe(statusCode);
      });
    });
  });

  describe('Error Inheritance', () => {
    it('should be an instance of Error', () => {
      const error = new AxiosError('Test error');
      expect(error instanceof Error).toBe(true);
    });

    it('should be an instance of AxiosError', () => {
      const error = new AxiosError('Test error');
      expect(error instanceof AxiosError).toBe(true);
    });

    it('should have Error prototype in prototype chain', () => {
      const error = new AxiosError('Test error');
      expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(Error.prototype);
    });
  });

  describe('toJSON() Serialization', () => {
    it('should serialize all standard Error properties', () => {
      const error = new AxiosError('Test error', 'ERR_TEST');
      const json = error.toJSON();

      expect(json.message).toBe('Test error');
      expect(json.name).toBe('AxiosError');
      expect(json.stack).toBeDefined();
    });

    it('should serialize axios-specific properties', () => {
      const config = { url: '/test', method: 'GET' };
      const response = { status: 500, data: { error: 'Server Error' } };
      const error = new AxiosError('Server error', 'ERR_BAD_RESPONSE', config, {}, response);
      
      const json = error.toJSON();

      expect(json.code).toBe('ERR_BAD_RESPONSE');
      expect(json.status).toBe(500);
      expect(json.config).toBeDefined();
    });

    it('should handle toJSON with minimal properties', () => {
      const error = new AxiosError('Simple error');
      const json = error.toJSON();

      expect(json.message).toBe('Simple error');
      expect(json.name).toBe('AxiosError');
      expect(json.code).toBeUndefined();
      expect(json.status).toBeUndefined();
    });

    it('should serialize and parse back to object', () => {
      const error = new AxiosError('Test error', 'ERR_TEST', { url: '/test' });
      const jsonString = JSON.stringify(error);
      const parsed = JSON.parse(jsonString);

      expect(parsed.message).toBe('Test error');
      expect(parsed.name).toBe('AxiosError');
      expect(parsed.code).toBe('ERR_TEST');
    });
  });

  describe('Static Error Codes', () => {
    it('should have ERR_BAD_OPTION_VALUE constant', () => {
      expect(AxiosError.ERR_BAD_OPTION_VALUE).toBe('ERR_BAD_OPTION_VALUE');
    });

    it('should have ERR_BAD_OPTION constant', () => {
      expect(AxiosError.ERR_BAD_OPTION).toBe('ERR_BAD_OPTION');
    });

    it('should have ECONNABORTED constant', () => {
      expect(AxiosError.ECONNABORTED).toBe('ECONNABORTED');
    });

    it('should have ETIMEDOUT constant', () => {
      expect(AxiosError.ETIMEDOUT).toBe('ETIMEDOUT');
    });

    it('should have ERR_NETWORK constant', () => {
      expect(AxiosError.ERR_NETWORK).toBe('ERR_NETWORK');
    });

    it('should have ERR_FR_TOO_MANY_REDIRECTS constant', () => {
      expect(AxiosError.ERR_FR_TOO_MANY_REDIRECTS).toBe('ERR_FR_TOO_MANY_REDIRECTS');
    });

    it('should have ERR_DEPRECATED constant', () => {
      expect(AxiosError.ERR_DEPRECATED).toBe('ERR_DEPRECATED');
    });

    it('should have ERR_BAD_RESPONSE constant', () => {
      expect(AxiosError.ERR_BAD_RESPONSE).toBe('ERR_BAD_RESPONSE');
    });

    it('should have ERR_BAD_REQUEST constant', () => {
      expect(AxiosError.ERR_BAD_REQUEST).toBe('ERR_BAD_REQUEST');
    });

    it('should have ERR_CANCELED constant', () => {
      expect(AxiosError.ERR_CANCELED).toBe('ERR_CANCELED');
    });

    it('should have ERR_NOT_SUPPORT constant', () => {
      expect(AxiosError.ERR_NOT_SUPPORT).toBe('ERR_NOT_SUPPORT');
    });

    it('should have ERR_INVALID_URL constant', () => {
      expect(AxiosError.ERR_INVALID_URL).toBe('ERR_INVALID_URL');
    });

    it('should have all 12 error code constants defined', () => {
      const expectedCodes = [
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
        'ERR_NOT_SUPPORT',
        'ERR_INVALID_URL'
      ];

      expectedCodes.forEach(code => {
        expect(AxiosError[code]).toBe(code);
      });
    });
  });

  describe('isAxiosError Property', () => {
    it('should have isAxiosError property set to true', () => {
      const error = new AxiosError('Test error');
      expect(error.isAxiosError).toBe(true);
    });

    it('should have isAxiosError on prototype', () => {
      expect(AxiosError.prototype.isAxiosError).toBe(true);
    });

    it('should distinguish AxiosError from regular Error', () => {
      const axiosError = new AxiosError('Axios error');
      const regularError = new Error('Regular error');

      expect(axiosError.isAxiosError).toBe(true);
      expect((regularError as any).isAxiosError).toBeUndefined();
    });
  });

  describe('AxiosError.from() Static Method', () => {
    it('should create AxiosError from native error', () => {
      const nativeError = new Error('Native error message');
      const axiosError = AxiosError.from(nativeError);

      expect(axiosError).toBeInstanceOf(AxiosError);
      expect(axiosError.message).toBe('Native error message');
      expect(axiosError.isAxiosError).toBe(true);
    });

    it('should use explicit code parameter', () => {
      const nativeError = new Error('Test error');
      const axiosError = AxiosError.from(nativeError, 'ERR_CUSTOM');

      expect(axiosError.code).toBe('ERR_CUSTOM');
    });

    it('should copy code from original error when code parameter is null', () => {
      const nativeError: any = new Error('Test error');
      nativeError.code = 'ECONNREFUSED';
      
      const axiosError = AxiosError.from(nativeError, null);

      expect(axiosError.code).toBe('ECONNREFUSED');
    });

    it('should prefer explicit code over original error code', () => {
      const nativeError: any = new Error('Test error');
      nativeError.code = 'ORIGINAL_CODE';
      
      const axiosError = AxiosError.from(nativeError, 'EXPLICIT_CODE');

      expect(axiosError.code).toBe('EXPLICIT_CODE');
    });

    it('should include config, request, and response', () => {
      const nativeError = new Error('Test error');
      const config = { url: '/test' };
      const request = { path: '/test' };
      const response = { status: 500 };

      const axiosError = AxiosError.from(nativeError, 'ERR_TEST', config, request, response);

      expect(axiosError.config).toBe(config);
      expect(axiosError.request).toBe(request);
      expect(axiosError.response).toBe(response);
    });

    it('should chain original error as cause', () => {
      const nativeError = new Error('Original error');
      const axiosError = AxiosError.from(nativeError);

      expect(axiosError.cause).toBe(nativeError);
    });

    it('should not set cause if already present', () => {
      const nativeError: any = new Error('Original error');
      const existingCause = new Error('Existing cause');
      nativeError.cause = existingCause;

      const axiosError = AxiosError.from(nativeError);

      expect(axiosError.cause).toBe(existingCause);
    });

    it('should preserve original error name', () => {
      const nativeError = new TypeError('Type error message');
      const axiosError = AxiosError.from(nativeError);

      expect(axiosError.name).toBe('TypeError');
    });

    it('should default to "Error" name when original has no name', () => {
      const nativeError: any = { message: 'Error without name' };
      const axiosError = AxiosError.from(nativeError);

      expect(axiosError.name).toBe('Error');
    });

    it('should apply custom properties', () => {
      const nativeError = new Error('Test error');
      const customProps = { customField: 'custom value', anotherField: 123 };

      const axiosError = AxiosError.from(nativeError, 'ERR_TEST', null, null, null, customProps);

      expect((axiosError as any).customField).toBe('custom value');
      expect((axiosError as any).anotherField).toBe(123);
    });

    it('should default message to "Error" when error has no message', () => {
      const nativeError: any = { code: 'NO_MESSAGE' };
      const axiosError = AxiosError.from(nativeError);

      expect(axiosError.message).toBe('Error');
    });

    it('should copy properties from native error', () => {
      const nativeError: any = new Error('Test error');
      nativeError.customProp = 'custom value';
      nativeError.numberId = 42;

      const axiosError = AxiosError.from(nativeError);

      expect((axiosError as any).customProp).toBe('custom value');
      expect((axiosError as any).numberId).toBe(42);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null parameters gracefully', () => {
      const error = new AxiosError(null, null, null, null, null);

      expect(error.message).toBeNull();
      expect(error.name).toBe('AxiosError');
      expect(error.code).toBeUndefined();
      expect(error.config).toBeUndefined();
      expect(error.request).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it('should handle undefined parameters gracefully', () => {
      const error = new AxiosError(undefined, undefined, undefined, undefined, undefined);

      expect(error.message).toBeUndefined();
      expect(error.name).toBe('AxiosError');
      expect(error.code).toBeUndefined();
      expect(error.config).toBeUndefined();
      expect(error.request).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it('should handle empty string message', () => {
      const error = new AxiosError('');

      expect(error.message).toBe('');
      expect(error.name).toBe('AxiosError');
    });

    it('should handle message with special characters', () => {
      const specialMessage = 'Error: 日本語 Ñoño <script>alert("xss")</script> 🚀';
      const error = new AxiosError(specialMessage);

      expect(error.message).toBe(specialMessage);
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new AxiosError(longMessage);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('should handle response without status property', () => {
      const response = { data: { error: 'No status' }, headers: {} };
      const error = new AxiosError('Error', 'ERR_BAD_RESPONSE', {}, {}, response);

      expect(error.response).toBe(response);
      expect(error.status).toBeNull();
    });

    it('should handle complex nested config objects', () => {
      const config = {
        url: '/test',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123'
        },
        data: {
          nested: {
            deeply: {
              value: 'test'
            }
          }
        },
        params: { query: 'param' }
      };

      const error = new AxiosError('Test', 'ERR_TEST', config);

      expect(error.config).toBe(config);
      expect(error.config.data.nested.deeply.value).toBe('test');
    });

    it('should handle response with circular references in data', () => {
      const circular: any = { data: {} };
      circular.data.self = circular.data;
      const response = { status: 500, data: circular };

      const error = new AxiosError('Circular', 'ERR_TEST', {}, {}, response);

      expect(error.response).toBe(response);
      expect(error.status).toBe(500);
    });

    it('should handle numeric codes', () => {
      const error = new AxiosError('Test', 404 as any);

      expect(error.code).toBe(404);
    });

    it('should maintain prototype chain after serialization', () => {
      const error = new AxiosError('Test error', 'ERR_TEST');
      const json = error.toJSON();
      
      // Original error maintains prototype
      expect(error.isAxiosError).toBe(true);
      expect(error instanceof AxiosError).toBe(true);
      
      // JSON is plain object
      expect(json.isAxiosError).toBeUndefined();
    });

    it('should handle being thrown and caught', () => {
      try {
        throw new AxiosError('Thrown error', 'ERR_THROWN');
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        expect((error as any).message).toBe('Thrown error');
        expect((error as any).code).toBe('ERR_THROWN');
        expect((error as any).isAxiosError).toBe(true);
      }
    });

    it('should work with async/await error handling', async () => {
      const throwAxiosError = async () => {
        throw new AxiosError('Async error', 'ERR_ASYNC');
      };

      try {
        await throwAxiosError();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        expect((error as any).message).toBe('Async error');
        expect((error as any).code).toBe('ERR_ASYNC');
      }
    });
  });

  describe('Integration with axios module', () => {
    it('should be accessible from axios module', () => {
      expect(axios.AxiosError).toBeDefined();
      expect(typeof axios.AxiosError).toBe('function');
    });

    it('should create consistent errors with axios.AxiosError', () => {
      const error1 = new axios.AxiosError('Test 1');
      const error2 = new AxiosError('Test 2');

      expect(error1.constructor).toBe(error2.constructor);
      expect(error1.isAxiosError).toBe(error2.isAxiosError);
    });
  });
});
