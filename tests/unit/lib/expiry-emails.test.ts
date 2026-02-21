import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as transactionEmails from '@/lib/transaction-emails'
import * as email from '@/lib/email'
import { createServerSupabaseClient } from '@/lib/supabase'

// Mock the email module
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn()
}))

// Mock the Supabase client for Bitcoin price lookups
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn()
}))

describe('Post Expiration Email Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock successful sendEmail by default
    vi.mocked(email.sendEmail).mockResolvedValue(undefined)
    
    // Mock Bitcoin price for USD conversion
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { price: '50000' },
                  error: null
                })
              })
            })
          })
        })
      })
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sendPostExpiryWarningEmail', () => {
    it('should send email with correct subject', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'John Doe',
        postTitle: 'Fix the pothole on Main St',
        expiresAt: new Date(Date.now() + 6 * 3600_000), // 6 hours from now
        postId: 'post-123'
      }

      await transactionEmails.sendPostExpiryWarningEmail(params)

      expect(email.sendEmail).toHaveBeenCalledTimes(1)
      const call = vi.mocked(email.sendEmail).mock.calls[0]
      expect(call[0]).toBe('user@example.com')
      expect(call[1]).toBe('Your post expires soon')
    })

    it('should include post title in email content', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'John Doe',
        postTitle: 'Fix the pothole on Main St',
        expiresAt: new Date(Date.now() + 6 * 3600_000),
        postId: 'post-123'
      }

      await transactionEmails.sendPostExpiryWarningEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('Fix the pothole on Main St')
    })

    it('should include first name only in greeting', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'John Doe',
        postTitle: 'Fix the pothole',
        expiresAt: new Date(Date.now() + 6 * 3600_000),
        postId: 'post-123'
      }

      await transactionEmails.sendPostExpiryWarningEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('Hi John,')
      expect(htmlContent).not.toContain('Hi John Doe,')
    })

    it('should include post link in email', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'John Doe',
        postTitle: 'Fix the pothole',
        expiresAt: new Date(Date.now() + 6 * 3600_000),
        postId: 'post-123'
      }

      await transactionEmails.sendPostExpiryWarningEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('/post/post-123')
    })

    it('should not throw when sendEmail fails', async () => {
      vi.mocked(email.sendEmail).mockRejectedValue(new Error('Email service down'))

      const params = {
        toEmail: 'user@example.com',
        userName: 'John Doe',
        postTitle: 'Fix the pothole',
        expiresAt: new Date(Date.now() + 6 * 3600_000),
        postId: 'post-123'
      }

      await expect(
        transactionEmails.sendPostExpiryWarningEmail(params)
      ).resolves.not.toThrow()
    })

    it('should include metadata in sendEmail call', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'John Doe',
        postTitle: 'Fix the pothole',
        expiresAt: new Date(Date.now() + 6 * 3600_000),
        postId: 'post-123'
      }

      await transactionEmails.sendPostExpiryWarningEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const metadata = call[3]
      expect(metadata).toEqual({
        type: 'post_expiry_warning',
        metadata: {
          userName: 'John Doe',
          postTitle: 'Fix the pothole',
          expiresAt: params.expiresAt.toISOString(),
          postId: 'post-123'
        }
      })
    })
  })

  describe('sendPostExpiredConfirmationEmail', () => {
    it('should send email with correct subject', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the broken bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await transactionEmails.sendPostExpiredConfirmationEmail(params)

      expect(email.sendEmail).toHaveBeenCalledTimes(1)
      const call = vi.mocked(email.sendEmail).mock.calls[0]
      expect(call[0]).toBe('user@example.com')
      expect(call[1]).toBe('Your post has expired — sats refunded')
    })

    it('should include post title in email content', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the broken bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await transactionEmails.sendPostExpiredConfirmationEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('Fix the broken bench')
    })

    it('should include formatted sats amount', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await transactionEmails.sendPostExpiredConfirmationEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      // formatSatsValue(10000) should produce something like "10,000 sats" or "10k sats"
      expect(htmlContent).toMatch(/10[,k]/i)
    })

    it('should include USD conversion', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await transactionEmails.sendPostExpiredConfirmationEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      // Should include USD amount (with mocked BTC price of 50000)
      expect(htmlContent).toContain('$')
    })

    it('should include first name only in greeting', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await transactionEmails.sendPostExpiredConfirmationEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('Hi Jane,')
      expect(htmlContent).not.toContain('Hi Jane Smith,')
    })

    it('should not throw when sendEmail fails', async () => {
      vi.mocked(email.sendEmail).mockRejectedValue(new Error('Email service down'))

      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await expect(
        transactionEmails.sendPostExpiredConfirmationEmail(params)
      ).resolves.not.toThrow()
    })

    it('should include metadata in sendEmail call', async () => {
      const params = {
        toEmail: 'user@example.com',
        userName: 'Jane Smith',
        postTitle: 'Fix the bench',
        refundAmountSats: 10000,
        postId: 'post-456'
      }

      await transactionEmails.sendPostExpiredConfirmationEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const metadata = call[3]
      expect(metadata).toEqual({
        type: 'post_expired_confirmation',
        metadata: {
          userName: 'Jane Smith',
          postTitle: 'Fix the bench',
          refundAmountSats: 10000,
          postId: 'post-456'
        }
      })
    })
  })

  describe('sendPostExpiredFixerEmail', () => {
    it('should send email with correct subject', async () => {
      const params = {
        toEmail: 'fixer@example.com',
        fixerName: 'Bob Johnson',
        postTitle: 'Paint the fence',
        postId: 'post-789'
      }

      await transactionEmails.sendPostExpiredFixerEmail(params)

      expect(email.sendEmail).toHaveBeenCalledTimes(1)
      const call = vi.mocked(email.sendEmail).mock.calls[0]
      expect(call[0]).toBe('fixer@example.com')
      expect(call[1]).toBe('A post you were assigned has expired')
    })

    it('should include post title in email content', async () => {
      const params = {
        toEmail: 'fixer@example.com',
        fixerName: 'Bob Johnson',
        postTitle: 'Paint the fence',
        postId: 'post-789'
      }

      await transactionEmails.sendPostExpiredFixerEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('Paint the fence')
    })

    it('should include first name only in greeting', async () => {
      const params = {
        toEmail: 'fixer@example.com',
        fixerName: 'Bob Johnson',
        postTitle: 'Paint the fence',
        postId: 'post-789'
      }

      await transactionEmails.sendPostExpiredFixerEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('Hi Bob,')
      expect(htmlContent).not.toContain('Hi Bob Johnson,')
    })

    it('should explain post removal in content', async () => {
      const params = {
        toEmail: 'fixer@example.com',
        fixerName: 'Bob Johnson',
        postTitle: 'Paint the fence',
        postId: 'post-789'
      }

      await transactionEmails.sendPostExpiredFixerEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const htmlContent = call[2] as string
      expect(htmlContent).toContain('expired')
      expect(htmlContent).toContain('removed')
    })

    it('should not throw when sendEmail fails', async () => {
      vi.mocked(email.sendEmail).mockRejectedValue(new Error('Email service down'))

      const params = {
        toEmail: 'fixer@example.com',
        fixerName: 'Bob Johnson',
        postTitle: 'Paint the fence',
        postId: 'post-789'
      }

      await expect(
        transactionEmails.sendPostExpiredFixerEmail(params)
      ).resolves.not.toThrow()
    })

    it('should include metadata in sendEmail call', async () => {
      const params = {
        toEmail: 'fixer@example.com',
        fixerName: 'Bob Johnson',
        postTitle: 'Paint the fence',
        postId: 'post-789'
      }

      await transactionEmails.sendPostExpiredFixerEmail(params)

      const call = vi.mocked(email.sendEmail).mock.calls[0]
      const metadata = call[3]
      expect(metadata).toEqual({
        type: 'post_expired_fixer',
        metadata: {
          fixerName: 'Bob Johnson',
          postTitle: 'Paint the fence',
          postId: 'post-789'
        }
      })
    })
  })
})
