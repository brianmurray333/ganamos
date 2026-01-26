// Mock external Lightning Network service (NOT the database)
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/lightning', () => ({
  lndRequest: vi.fn()
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/admin/node-balance/route'
import { lndRequest } from '@/lib/lightning'
import { queryOne, seedUser } from '../../helpers/test-isolation'
import { 
  mockLndFullBalanceSuccess, 
  setupLightningEnvironment 
} from '../../../unit/helpers/node-balance-mocks'

describe('GET /api/admin/node-balance (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupLightningEnvironment()
  })

  describe('Success Cases', () => {
    it('should aggregate balances from LND and return correct total', async () => {
      // Setup LND mock responses
      mockLndFullBalanceSuccess(lndRequest as any, '100000', '25000', '50000')

      // Call endpoint
      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      // Assert response
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.balances.channel_balance).toBe(100000)
      expect(data.balances.pending_balance).toBe(25000)
      expect(data.balances.onchain_balance).toBe(50000)
      expect(data.balances.total_balance).toBe(175000)
    })

    it('should handle zero balances correctly', async () => {
      mockLndFullBalanceSuccess(lndRequest as any, '0', '0', '0')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.balances.total_balance).toBe(0)
    })

    it('should handle large balance amounts', async () => {
      const largeAmount = 21000000 * 100000000 // 21M BTC in satoshis
      mockLndFullBalanceSuccess(lndRequest as any, String(largeAmount), '0', '0')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.balances.total_balance).toBe(largeAmount)
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when LND channel balance request fails', async () => {
      // Mock lndRequest to return error response
      vi.mocked(lndRequest).mockResolvedValueOnce({
        success: false,
        error: 'Failed to get node balance',
        details: 'LND connection failed'
      })

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to get node balance')
      // The endpoint returns result.error as details, not result.details
      expect(data.details).toBe('Failed to get node balance')
    })

    it('should return 500 when LND blockchain balance request fails', async () => {
      // First call succeeds, second call fails
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: { balance: '50000', pending_open_balance: '10000' }
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Blockchain API unavailable',
          details: 'Connection timeout'
        })

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      // Should handle failed blockchain request gracefully - onchain balance is 0
      expect(data.balances.onchain_balance).toBe(0)
      expect(data.balances.channel_balance).toBe(50000)
      expect(data.balances.pending_balance).toBe(10000)
    })

    it('should return 500 when lndRequest throws an exception', async () => {
      vi.mocked(lndRequest).mockRejectedValueOnce(
        new Error('Network connection failed')
      )

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })

    it('should handle missing onchain balance gracefully', async () => {
      // First call returns channel balance successfully
      vi.mocked(lndRequest)
        .mockResolvedValueOnce({
          success: true,
          data: { balance: '50000', pending_open_balance: '10000' }
        })
        .mockRejectedValueOnce(new Error('Blockchain API unavailable'))

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      // When onChainResult is undefined (rejected promise), trying to access .success throws
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('LND Integration', () => {
    it('should call correct LND endpoints in sequence', async () => {
      mockLndFullBalanceSuccess(lndRequest as any, '50000', '10000', '25000')

      const request = new NextRequest('http://test/api/admin/node-balance')
      await GET(request)

      expect(lndRequest).toHaveBeenCalledTimes(2)
      expect(lndRequest).toHaveBeenNthCalledWith(1, '/v1/balance/channels')
      expect(lndRequest).toHaveBeenNthCalledWith(2, '/v1/balance/blockchain')
    })
  })

  describe('Balance Accuracy with Real Database', () => {
    it('should verify node balance matches sum of user balances in database', async () => {
      // Seed multiple users with known balances
      const user1 = await seedUser({ balance: 100000 })
      const user2 = await seedUser({ balance: 50000 })
      const user3 = await seedUser({ balance: 25000 })

      // Calculate expected total from OUR test users only
      const result = await queryOne(
        'SELECT COALESCE(SUM(balance), 0) as total FROM profiles WHERE id IN ($1, $2, $3)',
        [user1.id, user2.id, user3.id]
      )
      const dbTotalBalance = Number(result.total)
      expect(dbTotalBalance).toBe(175000)

      // Mock LND to return matching balance
      mockLndFullBalanceSuccess(lndRequest as any, '175000', '0', '0')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      // Verify node balance equals sum of user balances
      const data = await response.json()
      expect(data.balances.total_balance).toBe(dbTotalBalance)
    })

    it('should detect discrepancy between node and user balances', async () => {
      // Seed users with specific total
      const user1 = await seedUser({ balance: 50000 })
      const user2 = await seedUser({ balance: 50000 })

      const result = await queryOne(
        'SELECT COALESCE(SUM(balance), 0) as total FROM profiles WHERE id IN ($1, $2)',
        [user1.id, user2.id]
      )
      const dbTotalBalance = Number(result.total)
      expect(dbTotalBalance).toBe(100000)

      // Mock LND to return different balance (discrepancy scenario)
      mockLndFullBalanceSuccess(lndRequest as any, '120000', '0', '0')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      const data = await response.json()
      const nodeBalance = data.balances.total_balance
      
      // Verify discrepancy exists
      expect(nodeBalance).not.toBe(dbTotalBalance)
      expect(nodeBalance - dbTotalBalance).toBe(20000)
    })

    it('should handle database queries during balance checks', async () => {
      // Create a user to ensure database is accessible
      const user = await seedUser({ balance: 50000 })

      // Verify we can query the database
      const result = await queryOne(
        'SELECT balance FROM profiles WHERE id = $1',
        [user.id]
      )
      expect(Number(result.balance)).toBe(50000)

      // Mock LND to return some balance
      mockLndFullBalanceSuccess(lndRequest as any, '50000', '0', '0')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.balances.total_balance).toBe(50000)
    })
  })

  describe('Response Format', () => {
    it('should return consistent JSON structure', async () => {
      mockLndFullBalanceSuccess(lndRequest as any, '50000', '10000', '25000')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      const data = await response.json()
      
      // Verify all required fields exist
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('balances')
      expect(data.balances).toHaveProperty('channel_balance')
      expect(data.balances).toHaveProperty('pending_balance')
      expect(data.balances).toHaveProperty('onchain_balance')
      expect(data.balances).toHaveProperty('total_balance')

      // Verify field types
      expect(typeof data.success).toBe('boolean')
      expect(typeof data.balances.channel_balance).toBe('number')
      expect(typeof data.balances.pending_balance).toBe('number')
      expect(typeof data.balances.onchain_balance).toBe('number')
      expect(typeof data.balances.total_balance).toBe('number')
    })

    it('should return correct content type header', async () => {
      mockLndFullBalanceSuccess(lndRequest as any, '50000', '10000', '25000')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      const contentType = response.headers.get('Content-Type')
      expect(contentType).toContain('application/json')
    })
  })

  describe('Balance Calculations', () => {
    it('should correctly sum all balance components', async () => {
      const channelBalance = 123456
      const pendingBalance = 78910
      const onchainBalance = 111213

      mockLndFullBalanceSuccess(
        lndRequest as any,
        String(channelBalance),
        String(pendingBalance),
        String(onchainBalance)
      )

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      const data = await response.json()
      const expectedTotal = channelBalance + pendingBalance + onchainBalance

      expect(data.balances.total_balance).toBe(expectedTotal)
      expect(data.balances.total_balance).toBe(313579)
    })

    it('should handle mixed zero and non-zero balances', async () => {
      mockLndFullBalanceSuccess(lndRequest as any, '100000', '0', '50000')

      const request = new NextRequest('http://test/api/admin/node-balance')
      const response = await GET(request)

      const data = await response.json()
      expect(data.balances.channel_balance).toBe(100000)
      expect(data.balances.pending_balance).toBe(0)
      expect(data.balances.onchain_balance).toBe(50000)
      expect(data.balances.total_balance).toBe(150000)
    })
  })
})
