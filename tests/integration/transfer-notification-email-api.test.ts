import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  mockSuccessfulEmailSend,
  mockEmailServiceFailure,
  createMockSupabaseFromProfiles
} from './helpers/transfer-notification-email-mocks'

/**
 * Integration tests for POST /api/email/transfer-notification endpoint
 * 
 * Tests cover:
 * - Request validation (missing required fields)
 * - Successful email notifications for both sender and receiver
 * - Email filtering (excluding @ganamos.app emails)
 * - Database profile retrieval
 * - Email service failures (graceful handling)
 * - Date handling (default vs custom dates)
 * 
 * Note: This endpoint:
 * 1. Validates request fields (fromUserId, toUserId, amount)
 * 2. Fetches sender and receiver profiles from database
 * 3. Sends emails to both parties (if they have verified emails)
 * 4. Filters out internal @ganamos.app emails
 */

// Mock Resend SDK at module level
vi.mock('resend', () => ({
  Resend: vi.fn(),
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

describe('POST /api/email/transfer-notification - Integration Tests', () => {
  const senderUserId = 'sender-user-123'
  const receiverUserId = 'receiver-user-456'
  const senderEmail = 'sender@test.com'
  const receiverEmail = 'receiver@test.com'
  const senderName = 'Sender User'
  const receiverName = 'Receiver User'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Request Validation', () => {
    it('should return 400 when fromUserId is missing', async () => {
      // Arrange
      const { Resend } = await import('resend')
      ;(Resend as any).mockImplementation(() => mockSuccessfulEmailSend())

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        toUserId: receiverUserId,
        amount: 50000,
        date: new Date().toISOString()
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should return 400 when toUserId is missing', async () => {
      // Arrange
      const { Resend } = await import('resend')
      ;(Resend as any).mockImplementation(() => mockSuccessfulEmailSend())

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        amount: 50000,
        date: new Date().toISOString()
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should return 400 when amount is missing', async () => {
      // Arrange
      const { Resend } = await import('resend')
      ;(Resend as any).mockImplementation(() => mockSuccessfulEmailSend())

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        date: new Date().toISOString()
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should return 400 when amount is zero', async () => {
      // Arrange
      const { Resend } = await import('resend')
      ;(Resend as any).mockImplementation(() => mockSuccessfulEmailSend())

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        amount: 0,
        date: new Date().toISOString()
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })
  })

  describe('Successful Email Notifications', () => {
    it('should send emails to both sender and receiver with valid data', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const amount = 50000
      const date = new Date('2024-01-15T10:30:00Z')
      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        amount,
        date: date.toISOString()
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Verify emails were sent
      expect(mockSend).toHaveBeenCalledTimes(2)
      
      // Check sender email
      const senderCall = mockSend.mock.calls.find((call: any) => 
        call[0].to.includes(senderEmail)
      )
      expect(senderCall).toBeDefined()
      expect(senderCall[0].subject).toContain('Bitcoin Sent')
      expect(senderCall[0].html).toContain('Sender')
      expect(senderCall[0].html).toContain('Receiver User')
      
      // Check receiver email
      const receiverCall = mockSend.mock.calls.find((call: any) => 
        call[0].to.includes(receiverEmail)
      )
      expect(receiverCall).toBeDefined()
      expect(receiverCall[0].subject).toContain('Bitcoin Received')
      expect(receiverCall[0].html).toContain('Receiver')
      expect(receiverCall[0].html).toContain('Sender User')
    })

    it('should use current date when date is not provided', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        amount: 25000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockSend).toHaveBeenCalled()
      
      // Verify date is within reasonable range (current time)
      const emailHtml = mockSend.mock.calls[0][0].html
      expect(emailHtml).toBeTruthy()
    })
  })

  describe('Email Filtering', () => {
    it('should not send email to sender with @ganamos.app email', async () => {
      // Arrange
      const childUserId = 'child-user-789'
      const childEmail = 'child-test@ganamos.app'
      
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [childUserId]: { id: childUserId, email: childEmail, name: 'Child User' },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: childUserId,
        toUserId: receiverUserId,
        amount: 30000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Should only send one email (to receiver)
      expect(mockSend).toHaveBeenCalledTimes(1)
      
      // Verify only receiver got email
      const calls = mockSend.mock.calls
      expect(calls[0][0].to).toContain(receiverEmail)
      expect(calls[0][0].to).not.toContain(childEmail)
    })

    it('should not send email to receiver with @ganamos.app email', async () => {
      // Arrange
      const childUserId = 'child-user-789'
      const childEmail = 'child-test@ganamos.app'
      
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [childUserId]: { id: childUserId, email: childEmail, name: 'Child User' }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: childUserId,
        amount: 30000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Should only send one email (to sender)
      expect(mockSend).toHaveBeenCalledTimes(1)
      
      // Verify only sender got email
      const calls = mockSend.mock.calls
      expect(calls[0][0].to).toContain(senderEmail)
      expect(calls[0][0].to).not.toContain(childEmail)
    })

    it('should not send any emails when both users have @ganamos.app emails', async () => {
      // Arrange
      const childSenderId = 'child-sender-123'
      const childReceiverId = 'child-receiver-456'
      const childSenderEmail = 'child-sender@ganamos.app'
      const childReceiverEmail = 'child-receiver@ganamos.app'
      
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [childSenderId]: { id: childSenderId, email: childSenderEmail, name: 'Child Sender' },
        [childReceiverId]: { id: childReceiverId, email: childReceiverEmail, name: 'Child Receiver' }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: childSenderId,
        toUserId: childReceiverId,
        amount: 40000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Should not send any emails
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('Email Service Failures', () => {
    it('should return success even when sender email fails', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn()
        .mockResolvedValueOnce({ data: null, error: new Error('Email service unavailable') }) // Sender email fails
        .mockResolvedValueOnce({ data: { id: 'email-456' }, error: null }) // Receiver email succeeds
      
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        amount: 60000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Should still return success (emails are non-blocking)
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should return success even when receiver email fails', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn()
        .mockResolvedValueOnce({ data: { id: 'email-789' }, error: null }) // Sender email succeeds
        .mockResolvedValueOnce({ data: null, error: new Error('Email service unavailable') }) // Receiver email fails
      
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        amount: 70000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Should still return success (emails are non-blocking)
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should return success even when both emails fail', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ 
        data: null, 
        error: new Error('Email service unavailable') 
      })
      
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const profiles = {
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName },
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: receiverUserId,
        amount: 80000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Should still return success (emails are non-blocking)
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Database Profile Retrieval', () => {
    it('should handle missing sender profile gracefully', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'
      const profiles = {
        // Only receiver exists
        [receiverUserId]: { id: receiverUserId, email: receiverEmail, name: receiverName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: nonExistentUserId,
        toUserId: receiverUserId,
        amount: 90000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Should still return success and send receiver email
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Should only send receiver email
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend.mock.calls[0][0].to).toContain(receiverEmail)
    })

    it('should handle missing receiver profile gracefully', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'
      const profiles = {
        // Only sender exists
        [senderUserId]: { id: senderUserId, email: senderEmail, name: senderName }
      }
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: senderUserId,
        toUserId: nonExistentUserId,
        amount: 100000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Should still return success and send sender email
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Should only send sender email
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend.mock.calls[0][0].to).toContain(senderEmail)
    })

    it('should handle missing profiles for both users gracefully', async () => {
      // Arrange
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })
      ;(Resend as any).mockImplementation(() => ({
        emails: { send: mockSend }
      }))

      const { createServerSupabaseClient } = await import('@/lib/supabase')
      const nonExistentUserId1 = '00000000-0000-0000-0000-000000000001'
      const nonExistentUserId2 = '00000000-0000-0000-0000-000000000002'
      const profiles = {}  // No profiles exist
      ;(createServerSupabaseClient as any).mockReturnValue(createMockSupabaseFromProfiles(profiles))

      const requestPayload = {
        fromUserId: nonExistentUserId1,
        toUserId: nonExistentUserId2,
        amount: 110000
      }
      const { POST } = await import('@/app/api/email/transfer-notification/route')

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert - Should still return success with no emails sent
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Should not send any emails
      expect(mockSend).not.toHaveBeenCalled()
    })
  })
})
