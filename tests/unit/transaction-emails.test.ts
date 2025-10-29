import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ 
    success: true, 
    messageId: 'mock-email-id' 
  }))
}))

vi.mock('@/lib/utils', () => ({
  formatSatsValue: vi.fn((sats: number) => `${sats.toLocaleString()} sats`)
}))

describe('sendBitcoinReceivedEmail', () => {
  let mockSendEmail: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const emailModule = await import('@/lib/email')
    mockSendEmail = vi.mocked(emailModule.sendEmail)
  })

  describe('deposit transactions', () => {
    it('should send email with correct subject and recipient', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      expect(mockSendEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('Bitcoin Received'),
        expect.any(String)
      )
    })

    it('should show "via Lightning" for deposit type', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('via Lightning')
      expect(htmlContent).not.toContain('from Bob')
      expect(htmlContent).not.toContain('from Alice')
    })

    it('should not render From field for deposits', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      // Should have detail rows for Amount and Date, but NOT From
      expect(htmlContent).toContain('detail-row')
      expect(htmlContent).not.toContain('From</span>')
    })
  })

  describe('internal transfers', () => {
    it('should show sender name for internal transfers', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'receiver@example.com',
        userName: 'Jane Smith',
        amountSats: 5000,
        fromName: 'Bob Johnson',
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'internal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('from Bob Johnson')
    })

    it('should render From detail row for internal transfers', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'receiver@example.com',
        userName: 'Jane Smith',
        amountSats: 5000,
        fromName: 'Bob Johnson',
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'internal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('From</span>')
      expect(htmlContent).toContain('Bob Johnson')
    })
  })

  describe('amount formatting', () => {
    it('should convert sats to BTC with 8 decimals', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 100000000, // 1 BTC
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('1.00000000 BTC')
    })

    it('should format sats value correctly', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 50000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('50,000 sats')
    })
  })

  describe('user name handling', () => {
    it('should extract first name from full name', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Michael Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('Hello John')
    })

    it('should handle single name', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'Alice',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('Hello Alice')
    })
  })

  describe('HTML structure', () => {
    it('should include proper DOCTYPE and meta tags', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('<!DOCTYPE html>')
      expect(htmlContent).toContain('charset="utf-8"')
      expect(htmlContent).toContain('viewport')
    })

    it('should include View Wallet CTA button', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('View Wallet')
      expect(htmlContent).toContain('https://www.ganamos.earth/wallet')
    })

    it('should include Ganamos branding in footer', async () => {
      const { sendBitcoinReceivedEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinReceivedEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'deposit'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('Ganamos')
      expect(htmlContent).toContain('https://www.ganamos.earth')
    })
  })
})

describe('sendBitcoinSentEmail', () => {
  let mockSendEmail: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const emailModule = await import('@/lib/email')
    mockSendEmail = vi.mocked(emailModule.sendEmail)
  })

  describe('withdrawal transactions', () => {
    it('should send email with correct subject', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'withdrawal'
      })

      expect(mockSendEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('Bitcoin Sent'),
        expect.any(String)
      )
    })

    it('should show "via Lightning" for withdrawal type', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'withdrawal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('via Lightning')
    })

    it('should not render To field for withdrawals', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'withdrawal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).not.toContain('To</span>')
    })
  })

  describe('internal transfers', () => {
    it('should show receiver name for internal transfers', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'sender@example.com',
        userName: 'Bob Johnson',
        amountSats: 5000,
        toName: 'Alice Smith',
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'internal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('to Alice Smith')
    })

    it('should render To detail row for internal transfers', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'sender@example.com',
        userName: 'Bob Johnson',
        amountSats: 5000,
        toName: 'Alice Smith',
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'internal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('To</span>')
      expect(htmlContent).toContain('Alice Smith')
    })
  })

  describe('amount formatting', () => {
    it('should include both BTC and sats amounts', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 25000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'withdrawal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('0.00025000 BTC')
      expect(htmlContent).toContain('25,000 sats')
    })
  })

  describe('HTML structure', () => {
    it('should include gradient header with "Bitcoin Sent" title', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'withdrawal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('Bitcoin Sent</h1>')
      expect(htmlContent).toContain('linear-gradient')
    })

    it('should include proper CSS styling', async () => {
      const { sendBitcoinSentEmail } = await import('@/lib/transaction-emails')
      
      await sendBitcoinSentEmail({
        toEmail: 'user@example.com',
        userName: 'John Doe',
        amountSats: 10000,
        date: new Date('2024-01-15T10:30:00Z'),
        transactionType: 'withdrawal'
      })

      const htmlContent = mockSendEmail.mock.calls[0][2]
      expect(htmlContent).toContain('<style>')
      expect(htmlContent).toContain('.container')
      expect(htmlContent).toContain('.cta-button')
    })
  })
})