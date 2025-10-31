import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendBitcoinReceivedEmail, sendBitcoinSentEmail, sendIssueFixedEmail } from '@/lib/transaction-emails'
import { sendEmail } from '@/lib/email'
import { formatSatsValue } from '@/lib/utils'

// Mock the base email service and utilities
vi.mock('@/lib/email')
vi.mock('@/lib/utils', () => ({
  formatSatsValue: vi.fn((sats: number) => {
    // Match the actual implementation logic
    if (sats >= 1000000) {
      const millions = sats / 1000000
      return millions % 1 === 0 ? `${millions}M sats` : `${millions.toFixed(1)}M sats`
    } else if (sats >= 100000) {
      const thousands = Math.floor(sats / 1000)
      return `${thousands}k sats`
    } else if (sats >= 1000) {
      const thousands = sats / 1000
      return thousands % 1 === 0 ? `${thousands}k sats` : `${thousands.toFixed(1)}k sats`
    } else {
      return `${sats} sats`
    }
  })
}))

// Mock Supabase client for price fetching
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { price: '50000' }, // Mock BTC price at $50k
                error: null
              }))
            }))
          }))
        }))
      }))
    }))
  }))
}))

describe('lib/transaction-emails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      messageId: 'mock-id'
    })
  })

  describe('sendBitcoinReceivedEmail', () => {
    const baseParams = {
      toEmail: 'recipient@example.com',
      userName: 'John Doe',
      amountSats: 10000,
      date: new Date('2024-01-15T10:30:00Z'),
      transactionType: 'deposit' as const
    }

    it('should send email with correct recipient and subject', async () => {
      await sendBitcoinReceivedEmail(baseParams)

      expect(sendEmail).toHaveBeenCalledWith(
        'recipient@example.com',
        expect.stringContaining('Bitcoin Received'),
        expect.any(String)
      )
    })

    it('should include formatted amount in subject line', async () => {
      await sendBitcoinReceivedEmail(baseParams)

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('10k sats'),
        expect.any(String)
      )
    })

    it('should use first name only in greeting', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        userName: 'John Doe Smith'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('Hello John,')
      expect(htmlContent).not.toContain('Hello John Doe Smith,')
    })

    it('should show "via Lightning" for deposit transactions', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        transactionType: 'deposit'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('via Lightning')
    })

    it('should show sender name for internal transactions', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        transactionType: 'internal',
        fromName: 'Alice Johnson'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('from Alice Johnson')
      expect(htmlContent).not.toContain('via Lightning')
    })

    it('should include formatted sats amount in content', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        amountSats: 50000
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      // formatSatsValue(50000) returns "50k sats"
      expect(htmlContent).toContain('50k sats')
      // Should include USD equivalent
      expect(htmlContent).toContain('$')
    })

    it('should include formatted date in content', async () => {
      await sendBitcoinReceivedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('Jan')
      expect(htmlContent).toContain('15')
      expect(htmlContent).toContain('2024')
    })

    it('should include wallet link', async () => {
      await sendBitcoinReceivedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('https://www.ganamos.earth/wallet')
      expect(htmlContent).toContain('View Wallet')
    })

    it('should include sender detail row for internal transfers', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        transactionType: 'internal',
        fromName: 'Bob Smith'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('From')
      expect(htmlContent).toContain('Bob Smith')
    })

    it('should not include sender detail row for deposits', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        transactionType: 'deposit'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).not.toContain('<span class="detail-label">From</span>')
    })

    it('should handle large amounts correctly', async () => {
      await sendBitcoinReceivedEmail({
        ...baseParams,
        amountSats: 100000000 // 1 BTC
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      // formatSatsValue(100000000) returns "100M sats"
      expect(htmlContent).toContain('100M sats')
    })
  })

  describe('sendBitcoinSentEmail', () => {
    const baseParams = {
      toEmail: 'sender@example.com',
      userName: 'Alice Smith',
      amountSats: 25000,
      date: new Date('2024-01-20T14:45:00Z'),
      transactionType: 'withdrawal' as const
    }

    it('should send email with correct recipient and subject', async () => {
      await sendBitcoinSentEmail(baseParams)

      expect(sendEmail).toHaveBeenCalledWith(
        'sender@example.com',
        expect.stringContaining('Bitcoin Sent'),
        expect.any(String)
      )
    })

    it('should include formatted amount in subject line', async () => {
      await sendBitcoinSentEmail(baseParams)

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('25k sats'),
        expect.any(String)
      )
    })

    it('should show "via Lightning" for withdrawal transactions', async () => {
      await sendBitcoinSentEmail({
        ...baseParams,
        transactionType: 'withdrawal'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('via Lightning')
    })

    it('should show receiver name for internal transactions', async () => {
      await sendBitcoinSentEmail({
        ...baseParams,
        transactionType: 'internal',
        toName: 'Bob Jones'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('to Bob Jones')
      expect(htmlContent).not.toContain('via Lightning')
    })

    it('should include receiver detail row for internal transfers', async () => {
      await sendBitcoinSentEmail({
        ...baseParams,
        transactionType: 'internal',
        toName: 'Charlie Brown'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('To')
      expect(htmlContent).toContain('Charlie Brown')
    })

    it('should not include receiver detail row for withdrawals', async () => {
      await sendBitcoinSentEmail({
        ...baseParams,
        transactionType: 'withdrawal'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).not.toContain('<span class="detail-label">To</span>')
    })

    it('should use first name only in greeting', async () => {
      await sendBitcoinSentEmail({
        ...baseParams,
        userName: 'Alice Marie Smith'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('Hello Alice,')
    })

    it('should include wallet link', async () => {
      await sendBitcoinSentEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('https://www.ganamos.earth/wallet')
      expect(htmlContent).toContain('View Wallet')
    })
  })

  describe('sendIssueFixedEmail', () => {
    const baseParams = {
      toEmail: 'postowner@example.com',
      userName: 'Post Owner',
      issueTitle: 'Fix broken streetlight on Main St',
      fixerName: 'John Fixer',
      rewardAmount: 5000,
      date: new Date('2024-01-25T16:00:00Z'),
      postId: 'post-123-abc'
    }

    it('should send email with correct recipient and subject', async () => {
      await sendIssueFixedEmail(baseParams)

      expect(sendEmail).toHaveBeenCalledWith(
        'postowner@example.com',
        'Issue Fixed: Fix broken streetlight on Main St',
        expect.any(String)
      )
    })

    it('should include issue title in email content', async () => {
      await sendIssueFixedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('Fix broken streetlight on Main St')
    })

    it('should include fixer name in content', async () => {
      await sendIssueFixedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('John Fixer')
    })

    it('should include formatted reward amount', async () => {
      await sendIssueFixedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      // formatSatsValue(5000) returns "5k sats"
      expect(htmlContent).toContain('5k sats')
    })

    it('should include post link with correct post ID', async () => {
      await sendIssueFixedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('https://www.ganamos.earth/post/post-123-abc')
      expect(htmlContent).toContain('View Issue')
    })

    it('should use first name only in greeting', async () => {
      await sendIssueFixedEmail({
        ...baseParams,
        userName: 'Post John Owner'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('Hello Post,')
    })

    it('should include formatted date', async () => {
      await sendIssueFixedEmail(baseParams)

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('Jan')
      expect(htmlContent).toContain('25')
      expect(htmlContent).toContain('2024')
    })
  })

  describe('email HTML structure', () => {
    it('should include gradient header styling', async () => {
      await sendBitcoinReceivedEmail({
        toEmail: 'test@example.com',
        userName: 'Test User',
        amountSats: 1000,
        date: new Date(),
        transactionType: 'deposit'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('background: linear-gradient(135deg, #16a349 0%, #138a3d 100%)')
    })

    it('should include CTA button with proper styling', async () => {
      await sendBitcoinSentEmail({
        toEmail: 'test@example.com',
        userName: 'Test User',
        amountSats: 1000,
        date: new Date(),
        transactionType: 'withdrawal'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('class="cta-button"')
      expect(htmlContent).toContain('background: linear-gradient(135deg, #16a349 0%, #138a3d 100%)')
    })

    it('should include responsive styling', async () => {
      await sendBitcoinReceivedEmail({
        toEmail: 'test@example.com',
        userName: 'Test User',
        amountSats: 1000,
        date: new Date(),
        transactionType: 'deposit'
      })

      const htmlContent = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][2]
      expect(htmlContent).toContain('max-width: 600px')
      expect(htmlContent).toContain('viewport')
    })
  })
})