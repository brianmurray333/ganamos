import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createEmailNotificationRequest, mockSupabaseProfiles, TEST_PROFILES } from '../helpers/email-test-helpers'

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }))
}))

vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinReceivedEmail: vi.fn(() => Promise.resolve({ success: true })),
  sendBitcoinSentEmail: vi.fn(() => Promise.resolve({ success: true }))
}))

describe('/api/email/transfer-notification', () => {
  let mockSupabase: any
  let mockSendBitcoinReceivedEmail: ReturnType<typeof vi.fn>
  let mockSendBitcoinSentEmail: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Setup Supabase mock
    const supabaseModule = await import('@/lib/supabase')
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn()
          }))
        }))
      }))
    }
    vi.mocked(supabaseModule.createServerSupabaseClient).mockReturnValue(mockSupabase as any)
    
    // Setup email function mocks
    const emailModule = await import('@/lib/transaction-emails')
    mockSendBitcoinReceivedEmail = vi.mocked(emailModule.sendBitcoinReceivedEmail)
    mockSendBitcoinSentEmail = vi.mocked(emailModule.sendBitcoinSentEmail)
    
    // Set environment variable
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  describe('parameter validation', () => {
    it('should return 400 when fromUserId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Missing required parameters'
      })
    })

    it('should return 400 when toUserId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Missing required parameters'
      })
    })

    it('should return 400 when amount is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456'
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Missing required parameters'
      })
    })

    it('should accept request with optional date parameter', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000,
          date: '2024-01-15T10:30:00Z'
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true })
    })
  })

  describe('email filtering', () => {
    it('should not send email to sender with @ganamos.app address', async () => {
      const mockSenderProfile = {
        email: 'childaccount@ganamos.app',
        name: 'Child Account'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(mockSendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should not send email to receiver with @ganamos.app address', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'childaccount@ganamos.app',
        name: 'Child Account'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(mockSendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })

    it('should not send emails when both users have @ganamos.app addresses', async () => {
      const mockSenderProfile = {
        email: 'sender@ganamos.app',
        name: 'Child Account 1'
      }
      const mockReceiverProfile = {
        email: 'receiver@ganamos.app',
        name: 'Child Account 2'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(mockSendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })

    it('should filter when sender has no email', async () => {
      const mockSenderProfile = {
        email: null,
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(mockSendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('dual notification sending', () => {
    it('should send both sender and receiver emails for valid users', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true })
      expect(mockSendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(mockSendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should send sender email with correct parameters', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinSentEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: 'sender@example.com',
          userName: 'Bob Sender',
          amountSats: 10000,
          toName: 'Alice Receiver',
          transactionType: 'internal'
        })
      )
    })

    it('should send receiver email with correct parameters', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinReceivedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: 'receiver@example.com',
          userName: 'Alice Receiver',
          amountSats: 10000,
          fromName: 'Bob Sender',
          transactionType: 'internal'
        })
      )
    })

    it('should hardcode transactionType as "internal"', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockSendBitcoinSentEmail).toHaveBeenCalledWith(
        expect.objectContaining({ transactionType: 'internal' })
      )
      expect(mockSendBitcoinReceivedEmail).toHaveBeenCalledWith(
        expect.objectContaining({ transactionType: 'internal' })
      )
    })
  })

  describe('error handling', () => {
    it('should return success even if email sending fails', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      // Mock email functions to reject
      mockSendBitcoinSentEmail.mockRejectedValue(new Error('Email service error'))
      mockSendBitcoinReceivedEmail.mockRejectedValue(new Error('Email service error'))

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true })
    })

    it('should return 500 on unexpected errors', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        success: false,
        error: 'Failed to send email notifications'
      })
    })
  })

  describe('Supabase service role integration', () => {
    it('should use service role key for admin access', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle
          }))
        }))
      })

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      const supabaseModule = await import('@/lib/supabase')
      expect(supabaseModule.createServerSupabaseClient).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseKey: 'test-service-role-key'
        })
      )
    })

    it('should query profiles table for sender and receiver', async () => {
      const mockSenderProfile = {
        email: 'sender@example.com',
        name: 'Bob Sender'
      }
      const mockReceiverProfile = {
        email: 'receiver@example.com',
        name: 'Alice Receiver'
      }

      const mockSingle = vi.fn()
        .mockResolvedValueOnce({ data: mockSenderProfile })
        .mockResolvedValueOnce({ data: mockReceiverProfile })

      const mockEq = vi.fn(() => ({ single: mockSingle }))
      const mockSelect = vi.fn(() => ({ eq: mockEq }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      mockSupabase.from = mockFrom

      const request = new NextRequest('http://localhost:3000/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: 'user-123',
          toUserId: 'user-456',
          amount: 10000
        })
      })

      const { POST } = await import('@/app/api/email/transfer-notification/route')
      await POST(request)

      expect(mockFrom).toHaveBeenCalledWith('profiles')
      expect(mockSelect).toHaveBeenCalledWith('email, name')
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
      expect(mockEq).toHaveBeenCalledWith('id', 'user-456')
    })
  })
})