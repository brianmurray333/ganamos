import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Next.js cookies (MUST be at top level before imports)
const mockCookies = vi.fn(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}))

// Mock external dependencies at module level (must be before imports)
vi.mock('@/lib/lightning', () => ({
  createInvoice: vi.fn(),
}))

// @/lib/supabase mock provided by tests/setup.ts

import { createDepositInvoice } from '@/app/actions/lightning-actions'
import { createInvoice } from '@/lib/lightning'
import { createServerSupabaseClient } from '@/lib/supabase'

// Test constants
const TEST_USER_ID = 'test-user-123'
const TEST_AMOUNT = 1000
const TEST_PAYMENT_REQUEST = 'lnbc10u1p0test123'
const TEST_R_HASH = 'abc123def456'

// Chainable Supabase mock builder
function createMockSupabaseClient() {
  const mockClient = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    insert: vi.fn(() => mockClient),
    update: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    limit: vi.fn(() => mockClient),
  }
  return mockClient
}

describe('createDepositInvoice', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>
  let mockAdminSupabase: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    // Reset all mocks between tests
    vi.clearAllMocks()
    
    // Create fresh mock Supabase clients (one for auth, one for admin)
    mockSupabase = createMockSupabaseClient()
    mockAdminSupabase = createMockSupabaseClient()
    
    // Return different clients for different calls (first is auth client, second+ are admin)
    let callCount = 0
    vi.mocked(createServerSupabaseClient).mockImplementation(() => {
      callCount++
      return (callCount === 1 ? mockSupabase : mockAdminSupabase) as any
    })
    
    // Mock environment variables
    process.env.SUPABASE_SECRET_API_KEY = 'mock-service-role-key'
  })

  describe('Success Cases', () => {
    it('should successfully create deposit invoice with valid session and userId', async () => {
      // Arrange
      const mockSession = {
        user: { id: TEST_USER_ID, email: 'test@example.com' },
        access_token: 'mock-token',
      }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            ...mockAdminSupabase,
            select: vi.fn(() => ({
              ...mockAdminSupabase,
              limit: vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null })),
            })),
            insert: vi.fn(() => ({
              ...mockAdminSupabase,
              select: vi.fn(() => Promise.resolve({
                data: [{
                  id: 'tx-123',
                  user_id: TEST_USER_ID,
                  type: 'deposit',
                  amount: TEST_AMOUNT,
                  status: 'pending',
                  r_hash_str: TEST_R_HASH,
                  payment_request: TEST_PAYMENT_REQUEST,
                }],
                error: null,
              })),
            })),
          } as any
        }
        return mockAdminSupabase as any
      })

      vi.mocked(createInvoice).mockResolvedValue({
        success: true,
        paymentRequest: TEST_PAYMENT_REQUEST,
        rHash: TEST_R_HASH,
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(true)
      expect(result.paymentRequest).toBe(TEST_PAYMENT_REQUEST)
      expect(result.rHash).toBe(TEST_R_HASH)
      expect(createInvoice).toHaveBeenCalledWith(TEST_AMOUNT, expect.stringContaining('Deposit'))
    })

    it('should create invoice for zero amount (amount-less invoice)', async () => {
      // Arrange
      const mockSession = {
        user: { id: TEST_USER_ID, email: 'test@example.com' },
        access_token: 'mock-token',
      }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            ...mockAdminSupabase,
            select: vi.fn(() => ({
              ...mockAdminSupabase,
              limit: vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null })),
            })),
            insert: vi.fn(() => ({
              ...mockAdminSupabase,
              select: vi.fn(() => Promise.resolve({
                data: [{
                  id: 'tx-123',
                  user_id: TEST_USER_ID,
                  type: 'deposit',
                  amount: 0,
                  status: 'pending',
                }],
                error: null,
              })),
            })),
          } as any
        }
        return mockAdminSupabase as any
      })

      vi.mocked(createInvoice).mockResolvedValue({
        success: true,
        paymentRequest: TEST_PAYMENT_REQUEST,
        rHash: TEST_R_HASH,
      })

      // Act
      const result = await createDepositInvoice(0, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(true)
      expect(createInvoice).toHaveBeenCalledWith(0, expect.any(String))
    })
  })

  describe('Authentication Failures', () => {
    it('should succeed with userId fallback when no session exists', async () => {
      // Arrange - Implementation allows userId fallback for server-side operations
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            ...mockAdminSupabase,
            select: vi.fn(() => ({
              ...mockAdminSupabase,
              limit: vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null })),
            })),
            insert: vi.fn(() => ({
              ...mockAdminSupabase,
              select: vi.fn(() => Promise.resolve({
                data: [{
                  id: 'tx-123',
                  user_id: TEST_USER_ID,
                  type: 'deposit',
                  amount: TEST_AMOUNT,
                  status: 'pending',
                }],
                error: null,
              })),
            })),
          } as any
        }
        return mockAdminSupabase as any
      })

      vi.mocked(createInvoice).mockResolvedValue({
        success: true,
        paymentRequest: TEST_PAYMENT_REQUEST,
        rHash: TEST_R_HASH,
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(true)
      expect(result.paymentRequest).toBe(TEST_PAYMENT_REQUEST)
    })

    it('should fail when no session and no userId provided', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      // Act - @ts-expect-error: Testing invalid input
      const result = await createDepositInvoice(TEST_AMOUNT, '')

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Not authenticated')
      expect(createInvoice).not.toHaveBeenCalled()
    })

    it('should fail when session error occurs', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session expired' } as any,
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Authentication error')
    })

    it('should fail when trying to create for unauthorized user', async () => {
      // Arrange
      const differentUserId = 'different-user-456'
      const mockSession = {
        user: { id: TEST_USER_ID, email: 'test@example.com' },
        access_token: 'mock-token',
      }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      // Mock connected_accounts check to return null (not connected)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'connected_accounts') {
          return {
            ...mockSupabase,
            select: vi.fn(() => ({
              ...mockSupabase,
              eq: vi.fn(() => ({
                ...mockSupabase,
                eq: vi.fn(() => ({
                  ...mockSupabase,
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
          } as any
        }
        return mockSupabase as any
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, differentUserId)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  describe('Invoice Creation Failures', () => {
    it('should fail when Lightning invoice creation fails', async () => {
      // Arrange
      const mockSession = {
        user: { id: TEST_USER_ID, email: 'test@example.com' },
        access_token: 'mock-token',
      }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            ...mockAdminSupabase,
            select: vi.fn(() => ({
              ...mockAdminSupabase,
              limit: vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null })),
            })),
          } as any
        }
        return mockAdminSupabase as any
      })

      vi.mocked(createInvoice).mockResolvedValue({
        success: false,
        error: 'Failed to create invoice',
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to create invoice')
    })
  })

  describe('Database Failures', () => {
    it('should fail when transactions table check fails', async () => {
      // Arrange
      const mockSession = {
        user: { id: TEST_USER_ID, email: 'test@example.com' },
        access_token: 'mock-token',
      }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            ...mockAdminSupabase,
            select: vi.fn(() => ({
              ...mockAdminSupabase,
              limit: vi.fn(() => Promise.resolve({
                data: null,
                error: { message: 'Table not found' },
              })),
            })),
          } as any
        }
        return mockAdminSupabase as any
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Transactions table not found')
    })

    it('should fail when transaction insertion fails', async () => {
      // Arrange
      const mockSession = {
        user: { id: TEST_USER_ID, email: 'test@example.com' },
        access_token: 'mock-token',
      }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            ...mockAdminSupabase,
            select: vi.fn(() => ({
              ...mockAdminSupabase,
              limit: vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null })),
            })),
            insert: vi.fn(() => ({
              ...mockAdminSupabase,
              select: vi.fn(() => Promise.resolve({
                data: null,
                error: { message: 'Insert failed' },
              })),
            })),
          } as any
        }
        return mockAdminSupabase as any
      })

      vi.mocked(createInvoice).mockResolvedValue({
        success: true,
        paymentRequest: TEST_PAYMENT_REQUEST,
        rHash: TEST_R_HASH,
      })

      // Act
      const result = await createDepositInvoice(TEST_AMOUNT, TEST_USER_ID)

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to store invoice')
    })
  })
})
