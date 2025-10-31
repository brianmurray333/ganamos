import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/email/transfer-notification/route'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendBitcoinSentEmail, sendBitcoinReceivedEmail } from '@/lib/transaction-emails'
import {
  createEmailNotificationSupabaseMock,
  createTransferNotificationRequest,
  createMockProfile,
  createGanamosProfile
} from '../../../integration/helpers/email-notification-mocks'

// Mock dependencies
vi.mock('@/lib/supabase')
vi.mock('@/lib/transaction-emails')

describe('POST /api/email/transfer-notification', () => {
  let mockSupabase: ReturnType<typeof createEmailNotificationSupabaseMock>

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default Supabase mock
    mockSupabase = createEmailNotificationSupabaseMock()
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

    // Setup default email function mocks
    ;(sendBitcoinSentEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(sendBitcoinReceivedEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parameter validation', () => {
    it('should return 400 when fromUserId is missing', async () => {
      const requestData = createTransferNotificationRequest({ fromUserId: undefined as any })
      delete requestData.fromUserId

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Missing required parameters')
    })

    it('should return 400 when toUserId is missing', async () => {
      const requestData = createTransferNotificationRequest({ toUserId: undefined as any })
      delete requestData.toUserId

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Missing required parameters')
    })

    it('should return 400 when amount is missing', async () => {
      const requestData = createTransferNotificationRequest({ amount: undefined as any })
      delete requestData.amount

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Missing required parameters')
    })

    it('should accept valid parameters', async () => {
      const requestData = createTransferNotificationRequest()

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should allow optional date parameter', async () => {
      const requestData = createTransferNotificationRequest()
      delete requestData.date

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('dual notification sending', () => {
    it('should send email to sender with internal transaction type', async () => {
      const requestData = createTransferNotificationRequest({
        amount: 15000
      })

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createMockProfile({ email: 'sender@test.com', name: 'Sender Name' }),
        receiverProfile: createMockProfile({ email: 'receiver@test.com', name: 'Receiver Name' })
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).toHaveBeenCalledWith({
        toEmail: 'sender@test.com',
        userName: 'Sender Name',
        amountSats: 15000,
        toName: 'Receiver Name',
        date: expect.any(Date),
        transactionType: 'internal'
      })
    })

    it('should send email to receiver with internal transaction type', async () => {
      const requestData = createTransferNotificationRequest({
        amount: 25000
      })

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createMockProfile({ email: 'alice@test.com', name: 'Alice' }),
        receiverProfile: createMockProfile({ email: 'bob@test.com', name: 'Bob' })
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinReceivedEmail).toHaveBeenCalledWith({
        toEmail: 'bob@test.com',
        userName: 'Bob',
        amountSats: 25000,
        fromName: 'Alice',
        date: expect.any(Date),
        transactionType: 'internal'
      })
    })

    it('should send both sender and receiver emails', async () => {
      const requestData = createTransferNotificationRequest()

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should use provided date for email timestamp', async () => {
      const specificDate = '2024-03-15T14:30:00.000Z'
      const requestData = createTransferNotificationRequest({
        date: specificDate
      })

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          date: new Date(specificDate)
        })
      )

      expect(sendBitcoinReceivedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          date: new Date(specificDate)
        })
      )
    })
  })

  describe('email filtering (@ganamos.app exclusion)', () => {
    it('should not send sender email when sender has @ganamos.app address', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createGanamosProfile('Internal Sender'),
        receiverProfile: createMockProfile({ email: 'external@test.com', name: 'External User' })
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should not send receiver email when receiver has @ganamos.app address', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createMockProfile({ email: 'external@test.com', name: 'External User' }),
        receiverProfile: createGanamosProfile('Internal Receiver')
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(sendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })

    it('should not send any emails when both users have @ganamos.app addresses', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createGanamosProfile('Internal Sender'),
        receiverProfile: createGanamosProfile('Internal Receiver')
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })

    it('should not send email when sender email is null', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createMockProfile({ email: null as any, name: 'No Email User' }),
        receiverProfile: createMockProfile({ email: 'receiver@test.com', name: 'Receiver' })
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })

    it('should send emails for valid external addresses', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createMockProfile({ email: 'alice@external.com', name: 'Alice' }),
        receiverProfile: createMockProfile({ email: 'bob@external.com', name: 'Bob' })
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(sendBitcoinSentEmail).toHaveBeenCalledTimes(1)
      expect(sendBitcoinReceivedEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('profile fetching', () => {
    it('should use service role key for admin access', async () => {
      const requestData = createTransferNotificationRequest()

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
      })
    })

    it('should fetch sender profile with correct user ID', async () => {
      const requestData = createTransferNotificationRequest({
        fromUserId: 'sender-123'
      })

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      expect(mockSupabase.mockFrom).toHaveBeenCalledWith('profiles')
      expect(mockSupabase.mockSelect).toHaveBeenCalledWith('email, name')
      expect(mockSupabase.mockEq).toHaveBeenCalledWith('id', 'sender-123')
    })

    it('should fetch receiver profile with correct user ID', async () => {
      const requestData = createTransferNotificationRequest({
        toUserId: 'receiver-456'
      })

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      await POST(request)

      // Second call is for receiver
      expect(mockSupabase.mockEq).toHaveBeenCalledWith('id', 'receiver-456')
    })

    it('should handle missing sender profile gracefully', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: null,
        receiverProfile: createMockProfile({ email: 'receiver@test.com', name: 'Receiver' })
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinSentEmail).not.toHaveBeenCalled()
    })

    it('should handle missing receiver profile gracefully', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderProfile: createMockProfile({ email: 'sender@test.com', name: 'Sender' }),
        receiverProfile: null
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendBitcoinReceivedEmail).not.toHaveBeenCalled()
    })
  })

  describe('non-blocking error handling', () => {
    it('should return success even when sender email fails', async () => {
      const requestData = createTransferNotificationRequest()

      // Mock sender email to reject
      ;(sendBitcoinSentEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Email service error')
      )

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should return success even when receiver email fails', async () => {
      const requestData = createTransferNotificationRequest()

      // Mock receiver email to reject
      ;(sendBitcoinReceivedEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Email service error')
      )

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should return success even when both emails fail', async () => {
      const requestData = createTransferNotificationRequest()

      // Mock both emails to reject
      ;(sendBitcoinSentEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Sender email failed')
      )
      ;(sendBitcoinReceivedEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Receiver email failed')
      )

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle Supabase errors gracefully', async () => {
      const requestData = createTransferNotificationRequest()

      mockSupabase = createEmailNotificationSupabaseMock({
        senderError: new Error('Database connection failed')
      })
      ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: JSON.stringify(requestData)
      })

      const response = await POST(request)
      const data = await response.json()

      // Should still return success as emails are fire-and-forget
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('request body parsing', () => {
    it('should handle JSON parsing errors', async () => {
      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: 'invalid json {'
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
    })

    it('should handle empty request body', async () => {
      const request = new Request('http://localhost/api/email/transfer-notification', {
        method: 'POST',
        body: '{}'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Missing required parameters')
    })
  })
})