import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '@/app/api/user/balance/route'
import {
  createMockSession,
  createMockSupabaseClient,
  createChainableMockSupabaseClient,
  createUnauthenticatedMock,
  createSuccessfulBalanceMock,
  createDatabaseErrorMock,
  createZeroBalanceMock,
  createLargeBalanceMock,
} from '@/tests/integration/helpers/user-balance-mocks'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

import { createServerSupabaseClient } from '@/lib/supabase'

describe('/api/user/balance GET endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const mockSupabase = createMockSupabaseClient({
        session: null,
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not authenticated')
    })

    it('should proceed with balance fetch when user is authenticated', async () => {
      const mockSession = createMockSession()
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: 1000 },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('Balance Retrieval', () => {
    it('should return user balance successfully', async () => {
      const mockSession = createMockSession()
      const expectedBalance = 5000
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: expectedBalance },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        balance: expectedBalance,
      })
    })

    it('should return zero balance for new user', async () => {
      const mockSession = createMockSession()
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: 0 },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balance).toBe(0)
    })

    it('should handle large balance values correctly', async () => {
      const mockSession = createMockSession()
      const largeBalance = 1000000000 // 1 billion sats
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: largeBalance },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balance).toBe(largeBalance)
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockSession = createMockSession()
      const dbError = new Error('Database connection failed')
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: null,
        profileError: dbError,
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to fetch balance')
    })

    it('should return 500 when profile is not found', async () => {
      const mockSession = createMockSession()
      const notFoundError = new Error('Profile not found')
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: null,
        profileError: notFoundError,
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to fetch balance')
    })

    it('should log errors to console when query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const mockSession = createMockSession()
      const dbError = new Error('Query timeout')
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: null,
        profileError: dbError,
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await GET()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching balance:', dbError)
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Database Query Correctness', () => {
    it('should query profiles table with correct user id', async () => {
      const userId = 'user-123'
      const mockSession = createMockSession(userId)
      
      // Create spies that can be tracked
      const selectSpy = vi.fn().mockReturnThis()
      const eqSpy = vi.fn().mockReturnThis()
      const singleSpy = vi.fn().mockResolvedValue({
        data: { balance: 1000 },
        error: null,
      })
      
      const chainMock = {
        select: selectSpy,
        eq: eqSpy,
        single: singleSpy,
      }
      
      const fromSpy = vi.fn((table: string) => chainMock)
      
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: mockSession },
          }),
        },
        from: fromSpy,
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await GET()

      expect(fromSpy).toHaveBeenCalledWith('profiles')
      expect(selectSpy).toHaveBeenCalledWith('balance')
      expect(eqSpy).toHaveBeenCalledWith('id', userId)
      expect(singleSpy).toHaveBeenCalledTimes(1)
    })

    it('should select only balance field from profiles table', async () => {
      const mockSession = createMockSession()
      
      // Create spies that can be tracked
      const selectSpy = vi.fn().mockReturnThis()
      const eqSpy = vi.fn().mockReturnThis()
      const singleSpy = vi.fn().mockResolvedValue({
        data: { balance: 500 },
        error: null,
      })
      
      const chainMock = {
        select: selectSpy,
        eq: eqSpy,
        single: singleSpy,
      }
      
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: mockSession },
          }),
        },
        from: vi.fn((table: string) => chainMock),
      }

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      await GET()

      expect(selectSpy).toHaveBeenCalledWith('balance')
    })
  })

  describe('Response Format', () => {
    it('should return consistent response structure on success', async () => {
      const mockSession = createMockSession()
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: 2500 },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('balance')
      expect(typeof data.success).toBe('boolean')
      expect(typeof data.balance).toBe('number')
    })

    it('should return consistent error structure on failure', async () => {
      const mockSession = createMockSession()
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: null,
        profileError: new Error('Test error'),
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
      expect(typeof data.error).toBe('string')
    })

    it('should not include error field in successful response', async () => {
      const mockSession = createMockSession()
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: 1000 },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(data).not.toHaveProperty('error')
    })

    it('should not include balance field in error response', async () => {
      const mockSupabase = createMockSupabaseClient({
        session: null,
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(data).not.toHaveProperty('balance')
    })
  })

  describe('Edge Cases', () => {
    it('should handle negative balance values (if allowed by database)', async () => {
      const mockSession = createMockSession()
      const negativeBalance = -100
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: negativeBalance },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balance).toBe(negativeBalance)
    })

    it('should handle decimal balance values (if allowed by database)', async () => {
      const mockSession = createMockSession()
      const decimalBalance = 99.5
      const mockSupabase = createMockSupabaseClient({
        session: mockSession,
        profile: { balance: decimalBalance },
      })

      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.balance).toBe(decimalBalance)
    })
  })
})