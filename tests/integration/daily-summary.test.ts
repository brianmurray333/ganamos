import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createMockRequestWithAuth,
  createMockRequestWithoutAuth,
  setupTestEnvironment,
  clearTestEnvironment,
  mockNodeBalanceApiSuccess,
  mockNodeBalanceApiError,
  mockNodeBalanceApiNetworkFailure,
  mockGetDailySummaryDataSuccess,
  mockGetDailySummaryDataError,
  mockSendDailySummaryEmailSuccess,
  mockSendDailySummaryEmailError,
  expectSuccessResponse,
  expectUnauthorizedResponse,
  expectErrorResponse,
  createMockNodeBalanceResponse,
  createMockBalanceAuditResult,
  createMockAPIHealthResult,
  createMock24HourMetrics,
} from './helpers/daily-summary-mocks'

// Mock lib/daily-summary.ts module - must be before importing the module
vi.mock('@/lib/daily-summary', () => ({
  getDailySummaryData: vi.fn(),
  sendDailySummaryEmail: vi.fn(),
}))

// Now import the route and the mocked functions
import { GET, POST } from '@/app/api/admin/daily-summary/route'
import { getDailySummaryData, sendDailySummaryEmail } from '@/lib/daily-summary'

const mockGetDailySummaryData = vi.mocked(getDailySummaryData)
const mockSendDailySummaryEmail = vi.mocked(sendDailySummaryEmail)

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

describe('Daily Summary API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTestEnvironment()
  })

  afterEach(() => {
    clearTestEnvironment()
    vi.restoreAllMocks()
  })

  describe('Authentication & Authorization - GET Method', () => {
    it('should return 200 when CRON_SECRET is valid', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-message-id',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expectSuccessResponse(response, data)
      expect(mockSendDailySummaryEmail).toHaveBeenCalledWith('brianmurray03@gmail.com')
    })

    it('should return 401 when CRON_SECRET is invalid', async () => {
      const mockRequest = createMockRequestWithAuth('wrong-secret', 'GET')

      const response = await GET(mockRequest)
      const data = await response.json()

      expectUnauthorizedResponse(response, data)
      expect(mockSendDailySummaryEmail).not.toHaveBeenCalled()
    })

    it('should return 401 when authorization header is missing', async () => {
      const mockRequest = createMockRequestWithoutAuth('GET')

      const response = await GET(mockRequest)
      const data = await response.json()

      expectUnauthorizedResponse(response, data)
      expect(mockSendDailySummaryEmail).not.toHaveBeenCalled()
    })

    // NOTE: This test documents current behavior where CRON_SECRET=undefined allows unauthenticated access.
    // TODO: Application code should be fixed to return 401 when CRON_SECRET is not configured (separate PR)
    it('should return 500 when CRON_SECRET environment variable is undefined and sendDailySummaryEmail fails', async () => {
      delete process.env.CRON_SECRET
      const mockRequest = createMockRequestWithAuth('any-secret', 'GET')
      // Mock will be called because auth check is skipped when CRON_SECRET is undefined
      mockSendDailySummaryEmail.mockResolvedValue(undefined)

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
      expect(mockSendDailySummaryEmail).toHaveBeenCalled()
    })
  })

  describe('Authentication & Authorization - POST Method', () => {
    it('should return 200 when CRON_SECRET is valid', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'POST')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-message-id',
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expectSuccessResponse(response, data)
      expect(mockSendDailySummaryEmail).toHaveBeenCalledWith('brianmurray03@gmail.com')
    })

    it('should return 401 when CRON_SECRET is invalid', async () => {
      const mockRequest = createMockRequestWithAuth('wrong-secret', 'POST')

      const response = await POST(mockRequest)
      const data = await response.json()

      expectUnauthorizedResponse(response, data)
      expect(mockSendDailySummaryEmail).not.toHaveBeenCalled()
    })

    it('should return 401 when authorization header is missing', async () => {
      const mockRequest = createMockRequestWithoutAuth('POST')

      const response = await POST(mockRequest)
      const data = await response.json()

      expectUnauthorizedResponse(response, data)
      expect(mockSendDailySummaryEmail).not.toHaveBeenCalled()
    })

    // NOTE: This test documents current behavior where CRON_SECRET=undefined allows unauthenticated access.
    // TODO: Application code should be fixed to return 401 when CRON_SECRET is not configured (separate PR)
    it('should return 500 when CRON_SECRET environment variable is undefined and sendDailySummaryEmail fails', async () => {
      delete process.env.CRON_SECRET
      const mockRequest = createMockRequestWithAuth('any-secret', 'POST')
      // Mock will be called because auth check is skipped when CRON_SECRET is undefined
      mockSendDailySummaryEmail.mockResolvedValue(undefined)

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
      expect(mockSendDailySummaryEmail).toHaveBeenCalled()
    })
  })

  describe('Email Sending Integration', () => {
    it('should successfully trigger email sending with valid auth', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const testMessageId = 'email-123-abc'
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: testMessageId,
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.messageId).toBe(testMessageId)
      expect(data.message).toBe('Daily summary email sent successfully')
      expect(mockSendDailySummaryEmail).toHaveBeenCalledTimes(1)
      expect(mockSendDailySummaryEmail).toHaveBeenCalledWith('brianmurray03@gmail.com')
    })

    it('should return 500 when email sending fails', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const errorMessage = 'RESEND_API_KEY not configured'
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: false,
        error: errorMessage,
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email')
      expect(data.details).toBe(errorMessage)
    })

    it('should return 500 when email sending throws exception', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const errorMessage = 'Network timeout'
      
      mockSendDailySummaryEmail.mockRejectedValue(new Error(errorMessage))

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('Response Validation', () => {
    it('should return complete success response structure', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const testMessageId = 'msg-xyz-789'
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: testMessageId,
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(data).toEqual({
        success: true,
        message: 'Daily summary email sent successfully',
        messageId: testMessageId,
      })
    })

    it('should return error response with details on email failure', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const errorDetails = 'Invalid email address'
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: false,
        error: errorDetails,
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('details')
      expect(data.error).toBe('Failed to send email')
      expect(data.details).toBe(errorDetails)
      expect(typeof data.details).toBe('string')
    })

    it('should return consistent response structure for both GET and POST', async () => {
      const testMessageId = 'consistent-msg-id'
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: testMessageId,
      })

      const getRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const postRequest = createMockRequestWithAuth('test-cron-secret-12345', 'POST')

      const getResponse = await GET(getRequest)
      const getResponseData = await getResponse.json()

      const postResponse = await POST(postRequest)
      const postResponseData = await postResponse.json()

      // Both should have identical structure
      expect(getResponseData).toEqual(postResponseData)
      expect(getResponse.status).toBe(postResponse.status)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle sendDailySummaryEmail returning undefined', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue(undefined)

      const response = await GET(mockRequest)
      const data = await response.json()

      // Should handle gracefully with error response
      expect(response.status).toBe(500)
    })

    it('should handle sendDailySummaryEmail returning malformed response', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        // Missing 'success' property
        messageId: 'test-id',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email')
    })

    it('should handle authorization header with incorrect format', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn((name: string) => {
            if (name.toLowerCase() === 'authorization') {
              return 'InvalidFormat test-cron-secret-12345' // Missing 'Bearer' prefix
            }
            return null
          }),
        },
        method: 'GET',
      } as unknown as NextRequest

      const response = await GET(mockRequest)
      const data = await response.json()

      expectUnauthorizedResponse(response, data)
    })

    it('should handle authorization header with extra whitespace', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn((name: string) => {
            if (name.toLowerCase() === 'authorization') {
              return '  Bearer  test-cron-secret-12345  ' // Extra whitespace
            }
            return null
          }),
        },
        method: 'GET',
      } as unknown as NextRequest

      const response = await GET(mockRequest)
      const data = await response.json()

      // Should fail due to whitespace mismatch
      expectUnauthorizedResponse(response, data)
    })

    it('should handle concurrent requests independently', async () => {
      const mockRequest1 = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const mockRequest2 = createMockRequestWithAuth('test-cron-secret-12345', 'POST')
      
      mockSendDailySummaryEmail
        .mockResolvedValueOnce({
          success: true,
          messageId: 'msg-1',
        })
        .mockResolvedValueOnce({
          success: true,
          messageId: 'msg-2',
        })

      const [response1, response2] = await Promise.all([
        GET(mockRequest1),
        POST(mockRequest2),
      ])

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      expect(data1.messageId).toBe('msg-1')
      expect(data2.messageId).toBe('msg-2')
      expect(mockSendDailySummaryEmail).toHaveBeenCalledTimes(2)
    })

    it('should handle CRON_SECRET with special characters', async () => {
      const specialSecret = 'test-secret-!@#$%^&*()_+-=[]{}|;:,.<>?'
      process.env.CRON_SECRET = specialSecret
      const mockRequest = createMockRequestWithAuth(specialSecret, 'GET')
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-id',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expectSuccessResponse(response, data)
    })

    it('should handle very long CRON_SECRET', async () => {
      const longSecret = 'a'.repeat(1000)
      process.env.CRON_SECRET = longSecret
      const mockRequest = createMockRequestWithAuth(longSecret, 'GET')
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-id',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expectSuccessResponse(response, data)
    })
  })

  describe('HTTP Method Parity', () => {
    it('should handle GET and POST methods identically for successful requests', async () => {
      const testMessageId = 'parity-test-id'
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: testMessageId,
      })

      const getRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const postRequest = createMockRequestWithAuth('test-cron-secret-12345', 'POST')

      const getResponse = await GET(getRequest)
      const postResponse = await POST(postRequest)

      expect(getResponse.status).toBe(postResponse.status)
      
      const getResponseData = await getResponse.json()
      const postResponseData = await postResponse.json()
      
      expect(getResponseData).toEqual(postResponseData)
    })

    it('should handle GET and POST methods identically for unauthorized requests', async () => {
      const getRequest = createMockRequestWithAuth('wrong-secret', 'GET')
      const postRequest = createMockRequestWithAuth('wrong-secret', 'POST')

      const getResponse = await GET(getRequest)
      const postResponse = await POST(postRequest)

      expect(getResponse.status).toBe(401)
      expect(postResponse.status).toBe(401)

      const getResponseData = await getResponse.json()
      const postResponseData = await postResponse.json()

      expect(getResponseData).toEqual(postResponseData)
    })

    it('should handle GET and POST methods identically for error scenarios', async () => {
      mockSendDailySummaryEmail.mockResolvedValue({
        success: false,
        error: 'Test error',
      })

      const getRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const postRequest = createMockRequestWithAuth('test-cron-secret-12345', 'POST')

      const getResponse = await GET(getRequest)
      const postResponse = await POST(postRequest)

      expect(getResponse.status).toBe(500)
      expect(postResponse.status).toBe(500)

      const getResponseData = await getResponse.json()
      const postResponseData = await postResponse.json()

      expect(getResponseData.error).toBe(postResponseData.error)
      expect(getResponseData.details).toBe(postResponseData.details)
    })
  })

  describe('Integration with lib/daily-summary functions', () => {
    it('should call sendDailySummaryEmail with correct recipient email', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-id',
      })

      await GET(mockRequest)

      expect(mockSendDailySummaryEmail).toHaveBeenCalledTimes(1)
      expect(mockSendDailySummaryEmail).toHaveBeenCalledWith('brianmurray03@gmail.com')
    })

    it('should not call sendDailySummaryEmail when authentication fails', async () => {
      const mockRequest = createMockRequestWithAuth('wrong-secret', 'GET')

      await GET(mockRequest)

      expect(mockSendDailySummaryEmail).not.toHaveBeenCalled()
    })

    it('should handle sendDailySummaryEmail success result correctly', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const expectedResult = {
        success: true,
        messageId: 'msg-success-123',
      }
      
      mockSendDailySummaryEmail.mockResolvedValue(expectedResult)

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(data.messageId).toBe(expectedResult.messageId)
      expect(data.success).toBe(true)
    })

    it('should handle sendDailySummaryEmail failure result correctly', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const expectedError = 'Email service unavailable'
      
      mockSendDailySummaryEmail.mockResolvedValue({
        success: false,
        error: expectedError,
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email')
      expect(data.details).toBe(expectedError)
    })
  })

  describe('Environment Variable Dependencies', () => {
    it('should succeed when all required environment variables are set', async () => {
      // setupTestEnvironment() already sets all required vars
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-id',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expectSuccessResponse(response, data)
    })

    // NOTE: This test documents current behavior where CRON_SECRET=undefined allows unauthenticated access.
    // TODO: Application code should be fixed to return 401 when CRON_SECRET is not configured (separate PR)
    it('should allow requests when CRON_SECRET is not set (current insecure behavior)', async () => {
      delete process.env.CRON_SECRET
      const mockRequest = createMockRequestWithAuth('any-secret', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-id',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      // Currently returns 200 because auth check is skipped when CRON_SECRET is undefined
      expect(response.status).toBe(200)
      expect(mockSendDailySummaryEmail).toHaveBeenCalled()
    })

    it('should propagate errors when email dependencies are missing', async () => {
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: false,
        error: 'RESEND_API_KEY not configured',
      })

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.details).toContain('RESEND_API_KEY')
    })
  })

  describe('Logging and Debugging', () => {
    it('should log attempt to trigger daily summary', async () => {
      const consoleSpy = vi.spyOn(console, 'log')
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      mockSendDailySummaryEmail.mockResolvedValue({
        success: true,
        messageId: 'test-id',
      })

      await GET(mockRequest)

      expect(consoleSpy).toHaveBeenCalledWith('Triggering daily summary email...')
      consoleSpy.mockRestore()
    })

    it('should log errors when email sending fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error')
      const mockRequest = createMockRequestWithAuth('test-cron-secret-12345', 'GET')
      const testError = new Error('Test error')
      mockSendDailySummaryEmail.mockRejectedValue(testError)

      await GET(mockRequest)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Daily summary API error:', testError)
      consoleErrorSpy.mockRestore()
    })
  })
})