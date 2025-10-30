import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../../../../app/api/admin/node-balance/route'
import {
  createSuccessfulBalanceMock,
  createChannelBalanceFailureMock,
  createOnChainBalanceFailureMock,
  createZeroBalanceMock,
  createLargeBalanceMock,
  createMissingEnvVarsMock,
  createNetworkTimeoutMock,
  createExceptionMock,
  createMockLndRequest,
} from '../../helpers/node-balance-mocks'

// Mock the lightning module
vi.mock('../../../../lib/lightning', () => ({
  lndRequest: vi.fn(),
}))

import { lndRequest } from '../../../../lib/lightning'

describe('GET /api/admin/node-balance', () => {
  let mockRequest: NextRequest

  beforeEach(() => {
    // Create a mock NextRequest object
    mockRequest = new NextRequest('http://localhost:3457/api/admin/node-balance', {
      method: 'GET',
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Successful Balance Retrieval', () => {
    it('should return aggregated balances from channel and on-chain sources', async () => {
      // Arrange
      const mockLndRequest = createSuccessfulBalanceMock(500000, 50000, 100000)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        success: true,
        balances: {
          channel_balance: 500000,
          pending_balance: 50000,
          onchain_balance: 100000,
          total_balance: 650000, // 500000 + 50000 + 100000
        },
      })

      // Verify lndRequest was called with correct endpoints
      expect(lndRequest).toHaveBeenCalledTimes(2)
      expect(lndRequest).toHaveBeenNthCalledWith(1, '/v1/balance/channels')
      expect(lndRequest).toHaveBeenNthCalledWith(2, '/v1/balance/blockchain')
    })

    it('should handle zero balances correctly', async () => {
      // Arrange
      const mockLndRequest = createZeroBalanceMock()
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.balances).toMatchObject({
        channel_balance: 0,
        pending_balance: 0,
        onchain_balance: 0,
        total_balance: 0,
      })
    })

    it('should handle large balance values for financial reporting accuracy', async () => {
      // Arrange - Test with 100M, 10M, and 50M sats
      const mockLndRequest = createLargeBalanceMock(100000000, 10000000, 50000000)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.balances).toMatchObject({
        channel_balance: 100000000,
        pending_balance: 10000000,
        onchain_balance: 50000000,
        total_balance: 160000000,
      })
    })

    it('should calculate total balance accurately for financial reporting', async () => {
      // Arrange - Test with specific values to verify no rounding errors
      const mockLndRequest = createSuccessfulBalanceMock(123456, 78901, 234567)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(data.balances.total_balance).toBe(436924) // Exact sum
      expect(data.balances.channel_balance).toBe(123456)
      expect(data.balances.pending_balance).toBe(78901)
      expect(data.balances.onchain_balance).toBe(234567)
    })
  })

  describe('Channel Balance API Failure (Hard Failure)', () => {
    it('should return 500 error when channel balance fetch fails', async () => {
      // Arrange
      const mockLndRequest = createChannelBalanceFailureMock('LND node unavailable')
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data).toMatchObject({
        error: 'Failed to get node balance',
        details: 'LND node unavailable',
      })
      expect(data.success).toBeUndefined() // Error response doesn't include success field

      // Verify second API call was NOT made (early return on first failure)
      expect(lndRequest).toHaveBeenCalledTimes(1)
      expect(lndRequest).toHaveBeenCalledWith('/v1/balance/channels')
    })

    it('should handle LND authentication failure', async () => {
      // Arrange
      const mockLndRequest = createChannelBalanceFailureMock('Invalid macaroon')
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
      expect(data.details).toBe('Invalid macaroon')
    })
  })

  describe('On-Chain Balance API Failure (Soft Failure)', () => {
    it('should default on-chain balance to 0 when blockchain balance fetch fails', async () => {
      // Arrange
      const mockLndRequest = createOnChainBalanceFailureMock(500000, 50000)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert - Should still return 200 with on-chain defaulted to 0
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        success: true,
        balances: {
          channel_balance: 500000,
          pending_balance: 50000,
          onchain_balance: 0, // Defaults to 0 on failure
          total_balance: 550000, // Only channel + pending
        },
      })

      // Verify both API calls were made
      expect(lndRequest).toHaveBeenCalledTimes(2)
    })

    it('should continue execution even when blockchain balance is unavailable', async () => {
      // Arrange
      const mockLndRequest = createOnChainBalanceFailureMock(1000000, 0)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.total_balance).toBe(1000000) // Only channel balance
    })
  })

  describe('Environment Configuration Errors', () => {
    it('should return 500 error when environment variables are missing', async () => {
      // Arrange
      const mockLndRequest = createMissingEnvVarsMock()
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
      expect(data.details).toBe('Lightning configuration missing')
    })
  })

  describe('Network and Communication Errors', () => {
    it('should handle network timeout errors gracefully', async () => {
      // Arrange
      vi.mocked(lndRequest).mockResolvedValue(createNetworkTimeoutMock())

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to get node balance')
      expect(data.details).toBe('Failed to communicate with Lightning node')
    })

    it('should handle unexpected exceptions during request', async () => {
      // Arrange
      const mockLndRequest = createExceptionMock('Connection refused')
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('Malformed Response Handling', () => {
    it('should handle missing balance fields from LND', async () => {
      // Arrange - LND API response missing expected fields (realistic edge case)
      const mockLndRequest = vi.fn((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: {}, // Missing balance and pending_open_balance fields
          })
        }
        return Promise.resolve({
          success: true,
          data: {}, // Missing confirmed_balance field
        })
      })
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert - Missing fields default to 0 via the || "0" fallback
      expect(response.status).toBe(200)
      expect(data.balances).toMatchObject({
        channel_balance: 0,
        pending_balance: 0,
        onchain_balance: 0,
        total_balance: 0,
      })
    })
  })

  describe('Balance Reconciliation for Financial Reporting', () => {
    it('should provide all balance components for audit and reconciliation', async () => {
      // Arrange
      const mockLndRequest = createSuccessfulBalanceMock(5000000, 500000, 1000000)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert - Verify all balance components are present for reconciliation
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')

      // Verify reconciliation: total = channel + pending + onchain
      const calculatedTotal =
        data.balances.channel_balance +
        data.balances.pending_balance +
        data.balances.onchain_balance

      expect(data.balances.total_balance).toBe(calculatedTotal)
      expect(data.balances.total_balance).toBe(6500000)
    })

    it('should maintain integer precision for satoshi values', async () => {
      // Arrange - Test with edge case values
      const mockLndRequest = createSuccessfulBalanceMock(1, 1, 1)
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert - All values should be integers (no floating point errors)
      expect(Number.isInteger(data.balances.channel_balance)).toBe(true)
      expect(Number.isInteger(data.balances.pending_balance)).toBe(true)
      expect(Number.isInteger(data.balances.onchain_balance)).toBe(true)
      expect(Number.isInteger(data.balances.total_balance)).toBe(true)
      expect(data.balances.total_balance).toBe(3)
    })
  })

  describe('Response Structure Validation', () => {
    it('should return correct response structure on success', async () => {
      // Arrange
      const mockLndRequest = createSuccessfulBalanceMock()
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('balances')
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')
    })

    it('should return correct error structure on failure', async () => {
      // Arrange
      const mockLndRequest = createChannelBalanceFailureMock()
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert
      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('details')
      expect(typeof data.error).toBe('string')
    })
  })

  describe('Admin Security and Authentication', () => {
    it('should document that endpoint requires admin access for production use', async () => {
      // Note: Based on code analysis, this endpoint does NOT have visible authentication
      // middleware in the route handler. This test documents the expected behavior.
      // 
      // In production, this endpoint should be protected by:
      // 1. Next.js middleware at /api/admin/* level, OR
      // 2. Network-level security (VPN, IP allowlist), OR
      // 3. API gateway authentication
      //
      // This test serves as documentation that security must be implemented
      // at the infrastructure level since it's not in the route handler.

      // Arrange
      const mockLndRequest = createSuccessfulBalanceMock()
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)

      // Assert - Currently endpoint is accessible without auth in the handler
      expect(response.status).toBe(200)

      // Document security requirement
      console.warn(
        'SECURITY NOTE: /api/admin/node-balance endpoint must be protected by ' +
        'middleware, API gateway, or network-level security in production.'
      )
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle maximum safe integer values', async () => {
      // Arrange - Test with Number.MAX_SAFE_INTEGER
      const maxSafeInt = Number.MAX_SAFE_INTEGER
      const mockLndRequest = createSuccessfulBalanceMock(
        Math.floor(maxSafeInt / 3),
        Math.floor(maxSafeInt / 3),
        Math.floor(maxSafeInt / 3)
      )
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert - Should handle large numbers without overflow
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(Number.isSafeInteger(data.balances.total_balance)).toBe(true)
    })

    it('should handle negative balance values from LND (if any)', async () => {
      // Arrange - Edge case: LND returns negative values (shouldn't happen, but test it)
      const mockLndRequest = createMockLndRequest(
        {
          success: true,
          data: {
            balance: '-100',
            pending_open_balance: '0',
          },
        },
        {
          success: true,
          data: {
            confirmed_balance: '0',
          },
        }
      )
      vi.mocked(lndRequest).mockImplementation(mockLndRequest)

      // Act
      const response = await GET(mockRequest)
      const data = await response.json()

      // Assert - parseInt handles negative strings
      expect(response.status).toBe(200)
      expect(data.balances.channel_balance).toBe(-100)
      expect(data.balances.total_balance).toBe(-100)
    })
  })
})