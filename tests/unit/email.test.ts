import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Resend } from 'resend'

// Mock Resend before importing sendEmail
vi.mock('resend')

describe('sendEmail', () => {
  let mockResendSend: ReturnType<typeof vi.fn>
  
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules() // Reset module cache
    mockResendSend = vi.fn()
    
    // Setup Resend mock
    vi.mocked(Resend).mockImplementation(() => ({
      emails: {
        send: mockResendSend
      }
    } as any))
    
    // Set required environment variable
    process.env.RESEND_API_KEY = 'test-api-key-123'
  })
  
  afterEach(() => {
    vi.resetModules()
  })

  describe('successful email sending', () => {
    it('should send email with correct parameters', async () => {
      mockResendSend.mockResolvedValue({
        data: { id: 'email-123' },
        error: null
      })

      // Import after mocks are set up
      const { sendEmail } = await import('@/lib/email')
      
      const result = await sendEmail(
        'test@example.com',
        'Test Subject',
        '<p>Test HTML content</p>'
      )

      expect(mockResendSend).toHaveBeenCalledWith({
        from: 'Ganamos <noreply@ganamos.earth>',
        to: ['test@example.com'],
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>'
      })
      
      expect(result).toEqual({
        success: true,
        messageId: 'email-123'
      })
    })

    it('should wrap recipient email in array', async () => {
      mockResendSend.mockResolvedValue({
        data: { id: 'email-456' },
        error: null
      })

      const { sendEmail } = await import('@/lib/email')
      
      await sendEmail('recipient@test.com', 'Subject', '<p>Body</p>')

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['recipient@test.com']
        })
      )
    })

    it('should use Ganamos sender address', async () => {
      mockResendSend.mockResolvedValue({
        data: { id: 'email-789' },
        error: null
      })

      const { sendEmail } = await import('@/lib/email')
      
      await sendEmail('test@example.com', 'Subject', '<p>Body</p>')

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Ganamos <noreply@ganamos.earth>'
        })
      )
    })
  })

  describe('error handling', () => {
    it('should handle Resend API errors in response', async () => {
      mockResendSend.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' }
      })

      const { sendEmail } = await import('@/lib/email')
      
      const result = await sendEmail(
        'test@example.com',
        'Subject',
        '<p>Body</p>'
      )

      expect(result).toEqual({
        success: false,
        error: 'Invalid API key'
      })
    })

    it('should handle thrown exceptions', async () => {
      mockResendSend.mockRejectedValue(new Error('Network timeout'))

      const { sendEmail } = await import('@/lib/email')
      
      const result = await sendEmail(
        'test@example.com',
        'Subject',
        '<p>Body</p>'
      )

      expect(result).toEqual({
        success: false,
        error: 'Network timeout'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockResendSend.mockRejectedValue('String error')

      const { sendEmail } = await import('@/lib/email')
      
      const result = await sendEmail(
        'test@example.com',
        'Subject',
        '<p>Body</p>'
      )

      expect(result).toEqual({
        success: false,
        error: 'String error'
      })
    })
  })

  describe('environment validation', () => {
    it('should work when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 'valid-key'
      
      mockResendSend.mockResolvedValue({
        data: { id: 'email-abc' },
        error: null
      })

      const { sendEmail } = await import('@/lib/email')
      
      const result = await sendEmail('test@example.com', 'Subject', '<p>Body</p>')

      expect(result.success).toBe(true)
    })
  })
})