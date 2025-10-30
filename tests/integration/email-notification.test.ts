import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '@/app/api/email/transfer-notification/route'
import {
  createEmailNotificationMockClient,
  createTransferNotificationRequest,
  createValidTransferRequest,
  createInvalidJsonRequest,
  setupMockProfiles,
  TEST_USERS,
  TEST_AMOUNTS,
} from './helpers/email-notification-test-helpers'

// Mock email services before imports
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true, messageId: 'mock-id-123' }))
}))

vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinSentEmail: vi.fn(() => Promise.resolve({ success: true })),
  sendBitcoinReceivedEmail: vi.fn(() => Promise.resolve({ success: true }))
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn()
}))

// Import mocked functions after mocks are set up
import { sendBitcoinSentEmail, sendBitcoinReceivedEmail } from '@/lib/transaction-emails'
import { createServerSupabaseClient } from '@/lib/supabase'

describe('POST /api/email/transfer-notification', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient = createEmailNotificationMockClient()
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabaseClient)
  })

  describe('Parameter Validation', () => {
    it('should return 400 when fromUserId is missing', async () => {
      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: 'user-2',
          amount: 1000
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should return 400 when toUserId is missing', async () => {
      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          amount: 1000
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should return 400 when amount is missing', async () => {
      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing required parameters')
    })

    it('should accept valid parameters without date (uses current date)', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Email Filtering', () => {
    it('should send both emails when neither user has @ganamos.app email', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should not send email to sender with @ganamos.app address', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@ganamos.app', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should not send email to receiver with @ganamos.app address', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@ganamos.app', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(sendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })

    it('should not send any emails when both users have @ganamos.app addresses', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@ganamos.app', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@ganamos.app', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })

    it('should not send email when sender email is null', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: null, name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('Dual Notification Sending', () => {
    it('should call sendBitcoinSentEmail with correct parameters for sender', async () => {
      const testDate = new Date('2024-01-15T10:30:00Z')
      
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Alice' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Bob' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 5000,
          date: testDate.toISOString()
        })
      })

      await POST(request)

      expect(sendBitcoinSentEmail).toHaveBeenCalledWith({
        toEmail: 'sender@example.com',
        userName: 'Alice',
        amountSats: 5000,
        toName: 'Bob',
        date: testDate,
        transactionType: 'internal'
      })
    })

    it('should call sendBitcoinReceivedEmail with correct parameters for receiver', async () => {
      const testDate = new Date('2024-01-15T10:30:00Z')
      
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Alice' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Bob' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 5000,
          date: testDate.toISOString()
        })
      })

      await POST(request)

      expect(sendBitcoinReceivedEmail).toHaveBeenCalledWith({
        toEmail: 'receiver@example.com',
        userName: 'Bob',
        amountSats: 5000,
        fromName: 'Alice',
        date: testDate,
        transactionType: 'internal'
      })
    })
  })

  describe('Non-Blocking Error Handling', () => {
    it('should return 200 even if sendBitcoinSentEmail fails', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      vi.mocked(sendBitcoinSentEmail).mockRejectedValueOnce(new Error('Email service error'))

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // Receiver email should still be attempted
      expect(sendBitcoinReceivedEmail).toHaveBeenCalled()
    })

    it('should return 200 even if sendBitcoinReceivedEmail fails', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      vi.mocked(sendBitcoinReceivedEmail).mockRejectedValueOnce(new Error('Email service error'))

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should return 200 even if both email functions fail', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      vi.mocked(sendBitcoinSentEmail).mockRejectedValueOnce(new Error('Email service error'))
      vi.mocked(sendBitcoinReceivedEmail).mockRejectedValueOnce(new Error('Email service error'))

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Profile Handling', () => {
    it('should handle missing sender profile gracefully', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: null,
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          fromName: undefined
        })
      )
    })

    it('should handle missing receiver profile gracefully', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: null,
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          toName: undefined
        })
      )
      expect(sendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })
  })

  describe('Service Role Authentication', () => {
    it('should create Supabase client with service role key', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      await POST(request)

      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
      })
    })

    it('should query profiles table with correct user IDs', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { email: 'sender@example.com', name: 'Sender' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { email: 'receiver@example.com', name: 'Receiver' },
          error: null
        })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 1000,
          date: new Date().toISOString()
        })
      })

      await POST(request)

      // Verify profile queries
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles')
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('email, name')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'user-123')
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'user-456')
    })
  })

  describe('Error Handling', () => {
    it('should return 500 on general error', async () => {
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Database connection error')
      })

      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: 'user-1',
          toUserId: 'user-2',
          amount: 1000
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to send email notifications')
    })

    it('should return 500 on JSON parsing error', async () => {
      const request = new Request('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to send email notifications')
    })
  })
})