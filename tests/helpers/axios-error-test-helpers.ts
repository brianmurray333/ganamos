/**
 * Test helpers for AxiosError testing
 * Provides factory functions for creating mock Axios requests, responses, configs, and errors
 */

import { AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * Create a mock Axios response object
 */
export function createMockAxiosResponse<T = any>(
  status: number,
  data: T,
  headers: Record<string, string> = {},
  statusText?: string
): Partial<AxiosResponse<T>> {
  return {
    status,
    statusText: statusText || getDefaultStatusText(status),
    data,
    headers,
    config: {} as AxiosRequestConfig,
  };
}

/**
 * Create a mock Axios request object
 */
export function createMockAxiosRequest(
  method: string = 'GET',
  url: string = '/api/test',
  headers: Record<string, string> = {}
): any {
  return {
    method: method.toUpperCase(),
    url,
    headers,
    path: url,
  };
}

/**
 * Create a mock Axios config object
 */
export function createMockAxiosConfig(
  baseURL: string = 'https://api.example.com',
  method: string = 'GET',
  url: string = '/test',
  data?: any
): AxiosRequestConfig {
  return {
    baseURL,
    method: method.toUpperCase(),
    url,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 5000,
    ...(data && { data }),
  };
}

/**
 * Create a config object with circular references for testing serialization
 */
export function createCircularConfig(): AxiosRequestConfig {
  const config: any = createMockAxiosConfig();
  config.circular = config; // Create circular reference
  return config;
}

/**
 * Get default status text for HTTP status code
 */
function getDefaultStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return statusTexts[status] || 'Unknown';
}

/**
 * Common error scenarios for testing
 */
export const ERROR_SCENARIOS = {
  NETWORK_ERROR: {
    message: 'Network Error',
    code: 'ERR_NETWORK',
    status: null,
  },
  TIMEOUT: {
    message: 'timeout of 5000ms exceeded',
    code: 'ETIMEDOUT',
    status: null,
  },
  BAD_REQUEST: {
    message: 'Request failed with status code 400',
    code: 'ERR_BAD_REQUEST',
    status: 400,
  },
  UNAUTHORIZED: {
    message: 'Request failed with status code 401',
    code: 'ERR_BAD_REQUEST',
    status: 401,
  },
  NOT_FOUND: {
    message: 'Request failed with status code 404',
    code: 'ERR_BAD_REQUEST',
    status: 404,
  },
  SERVER_ERROR: {
    message: 'Request failed with status code 500',
    code: 'ERR_BAD_RESPONSE',
    status: 500,
  },
  BAD_GATEWAY: {
    message: 'Request failed with status code 502',
    code: 'ERR_BAD_RESPONSE',
    status: 502,
  },
};