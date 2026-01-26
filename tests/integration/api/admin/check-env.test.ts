import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/check-env/route';

/**
 * Helper to create authenticated request with Bearer token
 */
function createAuthenticatedRequest(cronSecret: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/check-env', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
    },
  });
}

/**
 * Helper to create unauthenticated request (no auth headers)
 */
function createUnauthenticatedRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/check-env', {
    method: 'GET',
  });
}

/**
 * Helper to create Vercel cron request with x-vercel-cron or x-vercel-id header
 */
function createVercelCronRequest(headerType: 'x-vercel-cron' | 'x-vercel-id'): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/check-env', {
    method: 'GET',
    headers: {
      [headerType]: 'test-cron-value',
    },
  });
}

describe('GET /api/admin/check-env', () => {
  const testCronSecret = 'test-cron-secret-12345';
  let originalCronSecret: string | undefined;

  beforeAll(() => {
    // Save original CRON_SECRET to restore after tests
    originalCronSecret = process.env.CRON_SECRET;
  });

  afterAll(() => {
    // Restore original CRON_SECRET
    if (originalCronSecret !== undefined) {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  describe('Authorization', () => {
    it('should return 200 with valid CRON_SECRET bearer token', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createAuthenticatedRequest(testCronSecret);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });

    it('should return 200 with x-vercel-cron header (bypasses auth)', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createVercelCronRequest('x-vercel-cron');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should return 200 with x-vercel-id header (bypasses auth)', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createVercelCronRequest('x-vercel-id');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should return 401 when CRON_SECRET is set but no auth provided', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 with invalid CRON_SECRET', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createAuthenticatedRequest('wrong-secret');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 200 when CRON_SECRET is not set (no auth required)', async () => {
      delete process.env.CRON_SECRET;
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should return 401 with malformed authorization header (missing Bearer prefix)', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'Authorization': testCronSecret, // Missing 'Bearer ' prefix
        },
      });
      
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 with empty bearer token', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ',
        },
      });
      
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Response Validation', () => {
    it('should return envCheck object with all expected fields', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createAuthenticatedRequest(testCronSecret);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      
      // Boolean fields
      expect(typeof data.NEXT_PUBLIC_SUPABASE_URL).toBe('boolean');
      expect(typeof data.SUPABASE_SECRET_API_KEY).toBe('boolean');
      expect(typeof data.RESEND_API_KEY).toBe('boolean');
      expect(typeof data.CRON_SECRET).toBe('boolean');
      expect(typeof data.VERCEL).toBe('boolean');
      
      // String fields (NODE_ENV and USE_MOCKS should always be present)
      // VERCEL_ENV is omitted from JSON when undefined
      expect(data.NODE_ENV).toBeDefined();
      expect(data.USE_MOCKS).toBeDefined();
      
      // Prefix fields
      expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX).toBeDefined();
    });

    it('should not expose full sensitive values (only prefixes)', async () => {
      process.env.CRON_SECRET = testCronSecret;
      const originalSecretKey = process.env.SUPABASE_SECRET_API_KEY;
      process.env.SUPABASE_SECRET_API_KEY = 'very-long-secret-key-that-should-not-be-fully-exposed-1234567890';
      
      const request = createAuthenticatedRequest(testCronSecret);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      
      // Should not have full key exposed - only boolean check
      expect(data.SUPABASE_SECRET_API_KEY).toBe(true);
      expect(data).not.toHaveProperty('SUPABASE_SECRET_API_KEY_FULL');
      
      // Restore
      if (originalSecretKey !== undefined) {
        process.env.SUPABASE_SECRET_API_KEY = originalSecretKey;
      } else {
        delete process.env.SUPABASE_SECRET_API_KEY;
      }
    });

    it('should return correct types for all response fields', async () => {
      delete process.env.CRON_SECRET; // Test without auth requirement
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      
      // Validate all expected fields are present with correct types
      const expectedBooleanFields = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SECRET_API_KEY',
        'RESEND_API_KEY',
        'CRON_SECRET',
        'VERCEL',
      ];
      
      const expectedDefinedStringFields = [
        'NODE_ENV',
        'USE_MOCKS',
      ];
      
      const expectedPrefixFields = [
        'NEXT_PUBLIC_SUPABASE_URL_PREFIX',
      ];
      
      expectedBooleanFields.forEach(field => {
        expect(typeof data[field]).toBe('boolean');
      });
      
      expectedDefinedStringFields.forEach(field => {
        expect(data[field]).toBeDefined();
      });
      
      expectedPrefixFields.forEach(field => {
        // Prefix fields are defined but may be undefined if env var not set
        expect(data).toHaveProperty(field);
      });
    });

    it('should validate prefix lengths for configured env vars', async () => {
      delete process.env.CRON_SECRET;
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      
      // NEXT_PUBLIC_SUPABASE_URL_PREFIX should be max 30 chars
      if (data.NEXT_PUBLIC_SUPABASE_URL_PREFIX) {
        expect(data.NEXT_PUBLIC_SUPABASE_URL_PREFIX.length).toBeLessThanOrEqual(30);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing environment variables gracefully', async () => {
      delete process.env.CRON_SECRET;
      const originalResendKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.RESEND_API_KEY).toBe(false);
      expect(data.RESEND_API_KEY_PREFIX).toBeUndefined();
      
      // Restore
      if (originalResendKey !== undefined) {
        process.env.RESEND_API_KEY = originalResendKey;
      }
    });

    it('should return "not set" for USE_MOCKS when environment variable is not defined', async () => {
      delete process.env.CRON_SECRET;
      const originalUseMocks = process.env.USE_MOCKS;
      delete process.env.USE_MOCKS;
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.USE_MOCKS).toBe('not set');
      
      // Restore
      if (originalUseMocks !== undefined) {
        process.env.USE_MOCKS = originalUseMocks;
      }
    });

    it('should return actual USE_MOCKS value when set', async () => {
      delete process.env.CRON_SECRET;
      const originalUseMocks = process.env.USE_MOCKS;
      process.env.USE_MOCKS = 'true';
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.USE_MOCKS).toBe('true');
      
      // Restore
      if (originalUseMocks !== undefined) {
        process.env.USE_MOCKS = originalUseMocks;
      } else {
        delete process.env.USE_MOCKS;
      }
    });

    it('should handle both Vercel header types simultaneously', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = new NextRequest('http://localhost:3000/api/admin/check-env', {
        method: 'GET',
        headers: {
          'x-vercel-cron': 'test-cron',
          'x-vercel-id': 'test-id',
        },
      });
      
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should include CRON_SECRET boolean in response when set', async () => {
      process.env.CRON_SECRET = testCronSecret;
      
      const request = createAuthenticatedRequest(testCronSecret);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.CRON_SECRET).toBe(true);
    });

    it('should show CRON_SECRET as false when not set', async () => {
      delete process.env.CRON_SECRET;
      
      const request = createUnauthenticatedRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.CRON_SECRET).toBe(false);
    });
  });
});
