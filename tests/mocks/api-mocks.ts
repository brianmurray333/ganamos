import { vi } from 'vitest'

/**
 * Groq SDK mock utilities for integration tests
 * Mocks AI responses without making real API calls
 */

/**
 * Create a mock Groq SDK instance with configurable responses
 */
export function createMockGroqSDK(
  options: {
    confidence?: number
    reasoning?: string
    shouldFail?: boolean
    failureMessage?: string
    malformed?: boolean
    missingReasoning?: boolean
  } = {}
) {
  const {
    confidence = 8,
    reasoning = 'The issue appears to be fixed based on the after image',
    shouldFail = false,
    failureMessage = 'AI service unavailable',
    malformed = false,
    missingReasoning = false,
  } = options

  let responseContent: string

  if (malformed) {
    responseContent = 'This is a malformed response without proper formatting'
  } else if (missingReasoning) {
    responseContent = `CONFIDENCE: ${confidence}\nSome text but no REASONING label`
  } else {
    responseContent = `CONFIDENCE: ${confidence}\nREASONING: ${reasoning}`
  }

  const mockChatCompletion = {
    choices: [
      {
        message: {
          content: responseContent,
        },
      },
    ],
  }

  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          if (shouldFail) {
            throw new Error(failureMessage)
          }
          return mockChatCompletion
        }),
      },
    },
  }
}

/**
 * Mock successful AI verification with high confidence
 */
export function mockHighConfidenceResponse() {
  return createMockGroqSDK({
    confidence: 9,
    reasoning: 'Issue clearly fixed. The after image shows the problem has been completely resolved.',
  })
}

/**
 * Mock successful AI verification with low confidence
 */
export function mockLowConfidenceResponse() {
  return createMockGroqSDK({
    confidence: 4,
    reasoning: 'Unable to confirm fix. The after image is unclear or does not show the problem area.',
  })
}

/**
 * Mock successful AI verification with medium confidence
 */
export function mockMediumConfidenceResponse() {
  return createMockGroqSDK({
    confidence: 7,
    reasoning: 'Issue appears to be fixed with reasonable confidence.',
  })
}

/**
 * Mock AI service failure
 */
export function mockAIServiceFailure() {
  return createMockGroqSDK({
    shouldFail: true,
    failureMessage: 'AI service temporarily unavailable',
  })
}

/**
 * Mock malformed AI response (missing both confidence and reasoning)
 */
export function mockMalformedResponse() {
  return createMockGroqSDK({
    malformed: true,
  })
}

/**
 * Mock AI response with missing reasoning (only has confidence)
 */
export function mockResponseMissingReasoning() {
  return createMockGroqSDK({
    confidence: 6,
    missingReasoning: true,
  })
}

/**
 * Setup Groq SDK module mock for vitest
 * Call this in test setup to replace the real Groq SDK
 */
export function setupGroqMock(mockInstance: ReturnType<typeof createMockGroqSDK>) {
  vi.doMock('groq-sdk', () => ({
    Groq: vi.fn(() => mockInstance),
  }))
}

/**
 * Reset Groq SDK mock
 * Call this in afterEach to clean up mocks
 */
export function resetGroqMock() {
  vi.doUnmock('groq-sdk')
}
