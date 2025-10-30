import { vi } from 'vitest'

/**
 * Mock factory for Voltage API (Lightning node) responses
 */
export const mockVoltageAPIResponse = {
  success: (balances = {
    channel_balance: 1000000,
    pending_balance: 50000,
    onchain_balance: 100000,
    total_balance: 1150000
  }) => ({
    success: true,
    balances
  }),
  
  error: (errorMessage = 'Failed to connect to Lightning node') => ({
    success: false,
    error: errorMessage,
    balances: {
      channel_balance: 0,
      pending_balance: 0,
      onchain_balance: 0,
      total_balance: 0
    }
  })
}

/**
 * Mock factory for Groq API responses
 */
export const mockGroqAPIResponse = {
  success: (content = 'OK') => ({
    choices: [{
      message: {
        content,
        role: 'assistant'
      }
    }]
  }),
  
  error: (errorMessage = 'Groq API error') => {
    throw new Error(errorMessage)
  }
}

/**
 * Mock factory for Resend API responses
 */
export const mockResendAPIResponse = {
  success: (messageId = 'test-message-id-123') => ({
    id: messageId,
    from: 'noreply@ganamos.earth',
    to: 'test@example.com',
    created_at: new Date().toISOString()
  }),
  
  domainsList: (domains = [{ id: 'domain-1', name: 'ganamos.earth' }]) => ({
    data: domains
  }),
  
  error: (errorMessage = 'Failed to send email') => {
    throw new Error(errorMessage)
  }
}

/**
 * Setup global fetch mock for external API calls
 */
export function setupFetchMock() {
  global.fetch = vi.fn()
  return global.fetch
}

/**
 * Mock fetch response for node balance endpoint
 */
export function mockNodeBalanceFetch(success = true, balances = {
  channel_balance: 1000000,
  pending_balance: 50000,
  onchain_balance: 100000,
  total_balance: 1150000
}) {
  const fetchMock = global.fetch as any
  fetchMock.mockResolvedValueOnce({
    ok: success,
    status: success ? 200 : 500,
    json: async () => success 
      ? mockVoltageAPIResponse.success(balances)
      : mockVoltageAPIResponse.error()
  })
}

/**
 * Mock Groq SDK
 */
export function mockGroqSDK(shouldSucceed = true) {
  vi.mock('groq-sdk', () => ({
    Groq: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async () => {
            if (!shouldSucceed) {
              throw new Error('Groq API error')
            }
            return mockGroqAPIResponse.success()
          })
        }
      }
    }))
  }))
}

/**
 * Mock Resend SDK
 */
export function mockResendSDK(shouldSucceed = true) {
  vi.mock('resend', () => ({
    Resend: vi.fn().mockImplementation(() => ({
      domains: {
        list: vi.fn().mockImplementation(async () => {
          if (!shouldSucceed) {
            throw new Error('Resend API error')
          }
          return mockResendAPIResponse.domainsList()
        })
      },
      emails: {
        send: vi.fn().mockImplementation(async () => {
          if (!shouldSucceed) {
            throw new Error('Failed to send email')
          }
          return mockResendAPIResponse.success()
        })
      }
    }))
  }))
}