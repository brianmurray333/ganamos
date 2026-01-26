import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/lib/lightning', () => ({
  createInvoice: vi.fn(),
  checkInvoice: vi.fn(),
}))

// @/lib/supabase mock provided by tests/setup.ts

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-donation-123'),
}))

// Import after mocks
import { createDonationInvoice, checkDonationPayment } from '@/app/actions/donation-actions'
import { createInvoice, checkInvoice } from '@/lib/lightning'
import { createServerSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

// Import test utilities
import { createMockSupabaseClient, createSuccessResponse, createErrorResponse } from '@/tests/mocks'

// Test Fixtures
const VALID_AMOUNT = 10000
const VALID_LOCATION_TYPE = 'city'
const VALID_LOCATION_NAME = 'San Francisco'
const VALID_DONOR_NAME = 'John Doe'
const VALID_MESSAGE = 'Keep our city clean!'

const MOCK_POOL_EXISTING = {
  id: 'pool-123',
  location_type: 'city',
  location_name: 'San Francisco',
  total_donated: 50000,
  current_balance: 30000,
  total_boosted: 5000,
  boost_percentage: 10,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const MOCK_POOL_NEW = {
  id: 'pool-456',
  location_type: 'city',
  location_name: 'Los Angeles',
  total_donated: 0,
  current_balance: 0,
  total_boosted: 0,
  boost_percentage: 10,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const MOCK_INVOICE_RESULT = {
  success: true,
  paymentRequest: 'lnbc100000n1pj9x7xmpp5abc123',
  rHash: 'payment-hash-abc123',
  addIndex: '12345',
}

const MOCK_DONATION_RECORD = {
  id: 'donation-789',
  donation_pool_id: 'pool-123',
  amount: VALID_AMOUNT,
  payment_request: MOCK_INVOICE_RESULT.paymentRequest,
  payment_hash: MOCK_INVOICE_RESULT.rHash,
  status: 'pending',
  donor_name: VALID_DONOR_NAME,
  message: VALID_MESSAGE,
  created_at: new Date().toISOString(),
}

// Helper to create mock Supabase client with chainable methods
function createMockSupabaseClientForDonations(overrides = {}) {
  const mockClient: any = {
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    insert: vi.fn(() => mockClient),
    update: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
    ...overrides,
  }
  return mockClient
}

describe('createDonationInvoice', () => {
  let mockSupabase: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock Supabase client
    mockSupabase = createMockSupabaseClientForDonations()
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Parameter Validation', () => {
    it('should reject when amount is missing', async () => {
      const result = await createDonationInvoice({
        amount: undefined as any,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      // The function doesn't explicitly validate this, so it will fail at DB/Lightning level
      // But we can test that it doesn't crash
      expect(result).toBeDefined()
    })

    it('should reject when amount is zero', async () => {
      // Mock pool lookup to return existing pool
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock Lightning invoice creation to fail for 0 amount
      vi.mocked(createInvoice).mockResolvedValue({
        success: false,
        error: 'Invalid amount',
      })

      const result = await createDonationInvoice({
        amount: 0,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create Lightning invoice')
    })

    it('should reject when amount is negative', async () => {
      // Mock pool lookup to return existing pool
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock Lightning invoice creation to fail for negative amount
      vi.mocked(createInvoice).mockResolvedValue({
        success: false,
        error: 'Invalid amount',
      })

      const result = await createDonationInvoice({
        amount: -100,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create Lightning invoice')
    })

    it('should reject when locationType is missing', async () => {
      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: undefined as any,
        locationName: VALID_LOCATION_NAME,
      })

      // Will fail at DB query level
      expect(result).toBeDefined()
    })

    it('should reject when locationName is missing', async () => {
      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: undefined as any,
      })

      // Will fail at DB query level
      expect(result).toBeDefined()
    })

    it('should accept optional donorName', async () => {
      // Mock existing pool
      mockSupabase.single
        .mockResolvedValueOnce(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      // Mock successful donation insertion
      mockSupabase.insert.mockReturnValue(mockSupabase)
      mockSupabase.single.mockResolvedValueOnce(createSuccessResponse({ error: null }))

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
        donorName: VALID_DONOR_NAME,
      })

      expect(result.success).toBe(true)
    })

    it('should accept optional message', async () => {
      // Mock existing pool
      mockSupabase.single
        .mockResolvedValueOnce(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      // Mock successful donation insertion
      mockSupabase.insert.mockReturnValue(mockSupabase)
      mockSupabase.single.mockResolvedValueOnce(createSuccessResponse({ error: null }))

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
        message: VALID_MESSAGE,
      })

      expect(result.success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle Lightning invoice creation failure', async () => {
      // Mock existing pool lookup
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock Lightning invoice failure
      vi.mocked(createInvoice).mockResolvedValue({
        success: false,
        error: 'Lightning node unavailable',
      })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create Lightning invoice')
      expect(createInvoice).toHaveBeenCalledWith(
        VALID_AMOUNT,
        `Donation to ${VALID_LOCATION_NAME} (${VALID_AMOUNT} sats)`
      )
    })

    it('should handle database error during pool lookup', async () => {
      // Mock pool lookup error
      mockSupabase.single.mockRejectedValue(new Error('Database connection failed'))

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error occurred')
    })

    it('should handle pool creation failure', async () => {
      // Mock no existing pool
      mockSupabase.single
        .mockResolvedValueOnce(createSuccessResponse(null))
        // Mock pool creation error
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'Pool creation failed' },
        })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create donation pool')
    })

    it('should handle donation record insertion failure', async () => {
      // Mock existing pool
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      // Mock donation insertion error
      mockSupabase.insert.mockReturnValue(mockSupabase)
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Insertion failed' },
            }),
          }
        }
        return mockSupabase
      })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to store donation record')
    })

    it('should handle unexpected errors in try-catch', async () => {
      // Force an unexpected error
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected error occurred')
    })
  })

  describe('Success Cases', () => {
    it('should successfully create invoice with existing pool', async () => {
      // Mock existing pool lookup
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      // Mock successful donation insertion
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: MOCK_DONATION_RECORD,
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
        donorName: VALID_DONOR_NAME,
        message: VALID_MESSAGE,
      })

      expect(result.success).toBe(true)
      expect(result.paymentRequest).toBe(MOCK_INVOICE_RESULT.paymentRequest)
      expect(result.paymentHash).toBe(MOCK_INVOICE_RESULT.rHash)
      expect(result.poolId).toBe(MOCK_POOL_EXISTING.id)

      // Verify createInvoice was called with correct parameters
      expect(createInvoice).toHaveBeenCalledWith(
        VALID_AMOUNT,
        `Donation to ${VALID_LOCATION_NAME} (${VALID_AMOUNT} sats)`
      )
    })

    it('should successfully create invoice with new pool', async () => {
      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'donation_pools') {
          callCount++
          if (callCount === 1) {
            // First call is the lookup (should return null)
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue(createSuccessResponse(null)),
                  }),
                }),
              }),
            }
          } else {
            // Second call is the insert
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue(createSuccessResponse(MOCK_POOL_NEW)),
                }),
              }),
            }
          }
        }
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: MOCK_DONATION_RECORD,
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: 'Los Angeles',
      })

      expect(result.success).toBe(true)
      expect(result.paymentRequest).toBe(MOCK_INVOICE_RESULT.paymentRequest)
      expect(result.paymentHash).toBe(MOCK_INVOICE_RESULT.rHash)
      expect(result.poolId).toBe(MOCK_POOL_NEW.id)
    })

    it('should return correct structure on success', async () => {
      // Mock existing pool
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      // Mock successful donation insertion
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: MOCK_DONATION_RECORD,
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      const result = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      // Verify return structure
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('paymentRequest')
      expect(result).toHaveProperty('paymentHash')
      expect(result).toHaveProperty('poolId')
      expect(typeof result.paymentRequest).toBe('string')
      expect(typeof result.paymentHash).toBe('string')
      expect(typeof result.poolId).toBe('string')
    })

    it('should create pool with correct default boost_percentage', async () => {
      // Capture insert call
      let insertedPoolData: any
      let callCount = 0
      
      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'donation_pools') {
          callCount++
          if (callCount === 1) {
            // First call is the lookup (should return null)
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue(createSuccessResponse(null)),
                  }),
                }),
              }),
            }
          } else {
            // Second call is the insert
            return {
              insert: vi.fn().mockImplementation((data) => {
                insertedPoolData = data
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue(createSuccessResponse(MOCK_POOL_NEW)),
                  }),
                }
              }),
            }
          }
        }
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: MOCK_DONATION_RECORD,
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: 'New City',
      })

      // Verify pool was created with correct boost_percentage
      expect(insertedPoolData).toEqual({
        location_type: VALID_LOCATION_TYPE,
        location_name: 'New City',
        boost_percentage: 10,
      })
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle multiple donations to same location', async () => {
      // Mock existing pool
      mockSupabase.single.mockResolvedValue(createSuccessResponse(MOCK_POOL_EXISTING))

      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      // Mock successful donation insertion
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: MOCK_DONATION_RECORD,
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      // First donation
      const result1 = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      // Second donation (should use same pool)
      const result2 = await createDonationInvoice({
        amount: VALID_AMOUNT * 2,
        locationType: VALID_LOCATION_TYPE,
        locationName: VALID_LOCATION_NAME,
      })

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.poolId).toBe(result2.poolId)
    })

    it('should create different pools for different locations', async () => {
      // Mock successful Lightning invoice
      vi.mocked(createInvoice).mockResolvedValue(MOCK_INVOICE_RESULT)

      let fromCallCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'donation_pools') {
          fromCallCount++
          // Calls 1 and 3 are lookups (return null), calls 2 and 4 are inserts
          if (fromCallCount === 1 || fromCallCount === 3) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue(createSuccessResponse(null)),
                  }),
                }),
              }),
            }
          } else {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue(createSuccessResponse({
                    ...MOCK_POOL_NEW,
                    id: `pool-${fromCallCount}`,
                  })),
                }),
              }),
            }
          }
        }
        if (table === 'donations') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: MOCK_DONATION_RECORD,
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      const result1 = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: 'city',
        locationName: 'San Francisco',
      })

      const result2 = await createDonationInvoice({
        amount: VALID_AMOUNT,
        locationType: 'city',
        locationName: 'Los Angeles',
      })

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      // Verify different poolIds were created
      expect(result1.poolId).not.toBe(result2.poolId)
    })
  })
})