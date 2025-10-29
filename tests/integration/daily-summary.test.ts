import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/admin/daily-summary/route'
import * as dailySummary from '@/lib/daily-summary'
import * as email from '@/lib/email'
import * as lightning from '@/lib/lightning'

// Mock environment variables
const mockEnv = {
  CRON_SECRET: 'test-cron-secret-123',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3457',
  GROQ_API_KEY: 'test-groq-key',
  RESEND_API_KEY: 'test-resend-key',
  LND_REST_URL: 'https://test-voltage.com',
  LND_ADMIN_MACAROON: 'test-macaroon',
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
}

// Mock external dependencies
vi.mock('@/lib/lightning', () => ({
  lndRequest: vi.fn()
}))

vi.mock('groq-sdk', () => ({
  Groq: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }]
        })
      }
    }
  }))
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    domains: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 'test-domain' }] })
    },
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' } })
    }
  }))
}))

// Mock Supabase client - create a factory function to reset between tests
const createMockSupabaseClient = () => ({
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
  rpc: vi.fn()
})

const mockSupabaseClient = createMockSupabaseClient()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}))

describe('/api/admin/daily-summary Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv
  let globalFetchSpy: any

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env }
    
    // Set mock environment variables
    Object.assign(process.env, mockEnv)

    // Mock global fetch for internal API calls
    globalFetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
      const urlString = url.toString()
      
      if (urlString.includes('/api/admin/node-balance')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            balances: {
              channel_balance: 5000000,
              pending_balance: 100000,
              onchain_balance: 500000,
              total_balance: 5600000
            }
          })
        } as Response)
      }
      
      return Promise.resolve({
        ok: false,
        statusText: 'Not Found'
      } as Response)
    })

    // Reset all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    
    // Restore fetch
    globalFetchSpy?.mockRestore()
  })

  describe('Authorization', () => {
    it('should return 401 when CRON_SECRET is missing from request', async () => {
      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 401 when CRON_SECRET is invalid', async () => {
      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary', {
        headers: {
          'authorization': 'Bearer wrong-secret'
        }
      })
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should accept valid CRON_SECRET and process request', async () => {
      // Mock successful email sending
      vi.spyOn(email, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-message-id'
      })

      // Mock successful data aggregation
      const mockSummaryData = createMockDailySummaryData()
      vi.spyOn(dailySummary, 'getDailySummaryData').mockResolvedValue(mockSummaryData)

      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary', {
        headers: {
          'authorization': `Bearer ${mockEnv.CRON_SECRET}`
        }
      })
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Daily summary email sent successfully')
      expect(data.messageId).toBe('test-message-id')
    })
  })

  describe('HTTP Methods', () => {
    let getDailySummaryDataSpy: any

    beforeEach(() => {
      vi.spyOn(email, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-message-id'
      })

      const mockSummaryData = createMockDailySummaryData()
      getDailySummaryDataSpy = vi.spyOn(dailySummary, 'getDailySummaryData').mockResolvedValue(mockSummaryData)
    })

    afterEach(() => {
      getDailySummaryDataSpy?.mockRestore()
    })

    it('should handle GET requests', async () => {
      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary', {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${mockEnv.CRON_SECRET}`
        }
      })
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle POST requests', async () => {
      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${mockEnv.CRON_SECRET}`
        }
      })
      
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Data Aggregation - Node Balance', () => {
    it('should fetch node balance from Voltage API', async () => {
      // Mock lndRequest for channel balance
      const mockLndRequest = vi.mocked(lightning.lndRequest)
      mockLndRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/v1/balance/channels') {
          return Promise.resolve({
            success: true,
            data: {
              balance: '5000000',
              pending_open_balance: '100000'
            }
          })
        }
        if (endpoint === '/v1/balance/blockchain') {
          return Promise.resolve({
            success: true,
            data: {
              confirmed_balance: '500000'
            }
          })
        }
        return Promise.resolve({ success: false, error: 'Unknown endpoint' })
      })

      // Mock Supabase profiles query
      mockSupabaseClient.from.mockReturnValue(mockSupabaseClient)
      mockSupabaseClient.select.mockReturnValue(mockSupabaseClient)
      mockSupabaseClient.neq.mockResolvedValue({
        data: [
          { balance: 2000000 },
          { balance: 1500000 },
          { balance: 2000000 }
        ],
        error: null
      })

      const data = await dailySummary.getDailySummaryData()

      expect(data.nodeBalance.channel_balance).toBe(5000000)
      expect(data.nodeBalance.pending_balance).toBe(100000)
      expect(data.nodeBalance.onchain_balance).toBe(500000)
      expect(data.nodeBalance.total_balance).toBe(5600000)
      expect(data.appTotalBalance).toBe(5500000) // Sum of profile balances
    })

    it('should calculate balance discrepancy correctly', async () => {
      const mockLndRequest = vi.mocked(lightning.lndRequest)
      mockLndRequest.mockResolvedValue({
        success: true,
        data: {
          balance: '5000000',
          pending_open_balance: '100000',
          confirmed_balance: '500000'
        }
      })

      mockSupabaseClient.from.mockReturnValue(mockSupabaseClient)
      mockSupabaseClient.select.mockReturnValue(mockSupabaseClient)
      mockSupabaseClient.neq.mockResolvedValue({
        data: [
          { balance: 3000000 },
          { balance: 2000000 }
        ],
        error: null
      })

      const data = await dailySummary.getDailySummaryData()

      const expectedDiscrepancy = data.nodeBalance.total_balance - data.appTotalBalance
      expect(data.apiHealth.voltage.discrepancy).toBe(expectedDiscrepancy)
      expect(data.apiHealth.voltage.status).toBe('online')
    })
  })

  describe('Data Aggregation - Balance Audit', () => {
    it('should pass audit when profile balances match transaction calculations', async () => {
      const testUserId = 'test-user-1'
      const testBalance = 1000

      // Mock profiles query
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: testUserId, email: 'test@example.com', balance: testBalance }
                  ],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [
                    { type: 'deposit', amount: 500 },
                    { type: 'deposit', amount: 600 },
                    { type: 'withdrawal', amount: 100 }
                  ],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })

      const data = await dailySummary.getDailySummaryData()

      expect(data.balanceAudit.status).toBe('passed')
      expect(data.balanceAudit.usersWithDiscrepancies).toBe(0)
      expect(data.balanceAudit.totalDiscrepancy).toBe(0)
      expect(data.balanceAudit.discrepancies).toHaveLength(0)
    })

    it('should fail audit and report discrepancies when balances do not match', async () => {
      const testUserId = 'test-user-discrepancy'
      const profileBalance = 1000
      const calculatedBalance = 900 // Transactions total 900 but profile shows 1000

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: testUserId, email: 'discrepancy@example.com', balance: profileBalance }
                  ],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [
                    { type: 'deposit', amount: 500 },
                    { type: 'deposit', amount: 400 }
                  ],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })

      const data = await dailySummary.getDailySummaryData()

      expect(data.balanceAudit.status).toBe('failed')
      expect(data.balanceAudit.usersWithDiscrepancies).toBe(1)
      expect(data.balanceAudit.totalDiscrepancy).toBe(100)
      expect(data.balanceAudit.discrepancies).toHaveLength(1)
      expect(data.balanceAudit.discrepancies[0]).toMatchObject({
        email: 'discrepancy@example.com',
        profileBalance: 1000,
        calculatedBalance: 900,
        difference: 100
      })
    })

    it('should handle internal transaction type correctly in balance calculation', async () => {
      const testUserId = 'test-user-internal'
      const profileBalance = 2000

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: testUserId, email: 'internal@example.com', balance: profileBalance }
                  ],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [
                    { type: 'deposit', amount: 1000 },
                    { type: 'internal', amount: 500 }, // Internal adds to balance
                    { type: 'withdrawal', amount: 300 },
                    { type: 'internal', amount: 800 }
                  ],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })

      const data = await dailySummary.getDailySummaryData()

      // Calculated: 1000 + 500 + 800 - 300 = 2000
      expect(data.balanceAudit.status).toBe('passed')
      expect(data.balanceAudit.usersWithDiscrepancies).toBe(0)
    })
  })

  describe('Data Aggregation - API Health Checks', () => {
    beforeEach(() => {
      // Set up minimal mocks for balance audit and other queries
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [{ id: 'test', email: 'test@test.com', balance: 5000000 }],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              }),
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [{ type: 'deposit', amount: 5000000 }],
                  error: null
                })
              })
            })
          }
        }

        if (table === 'posts') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [],
        error: null
      })
    })

    it('should report Voltage API as online when node balance fetch succeeds', async () => {
      const data = await dailySummary.getDailySummaryData()

      expect(data.apiHealth.voltage.status).toBe('online')
      expect(data.apiHealth.voltage.nodeBalance).toBeGreaterThan(0)
      expect(data.apiHealth.voltage.error).toBeUndefined()
    })

    it('should report Groq API as online when health check passes', async () => {
      const data = await dailySummary.getDailySummaryData()

      expect(data.apiHealth.groq.status).toBe('online')
      expect(data.apiHealth.groq.error).toBeUndefined()
    })

    it('should report Resend API as online when health check passes', async () => {
      const data = await dailySummary.getDailySummaryData()

      expect(data.apiHealth.resend.status).toBe('online')
      expect(data.apiHealth.resend.error).toBeUndefined()
    })

    it('should report error status when API keys are missing', async () => {
      delete process.env.GROQ_API_KEY

      const data = await dailySummary.getDailySummaryData()

      expect(data.apiHealth.groq.status).toBe('error')
      expect(data.apiHealth.groq.error).toContain('GROQ_API_KEY not configured')
    })
  })

  describe('Data Aggregation - 24 Hour Metrics', () => {
    it('should aggregate transaction counts and amounts correctly', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [{ id: 'test', email: 'test@test.com', balance: 5000000 }],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [
                    { type: 'deposit', amount: 1000, status: 'completed' },
                    { type: 'deposit', amount: 2000, status: 'completed' },
                    { type: 'withdrawal', amount: 500, status: 'completed' },
                    { type: 'withdrawal', amount: 300, status: 'completed' }
                  ],
                  error: null
                })
              }),
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [{ type: 'deposit', amount: 5000000 }],
                  error: null
                })
              })
            })
          }
        }

        if (table === 'posts') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [],
        error: null
      })

      const data = await dailySummary.getDailySummaryData()

      expect(data.last24Hours.transactions.count).toBe(4)
      expect(data.last24Hours.deposits.count).toBe(2)
      expect(data.last24Hours.deposits.amount).toBe(3000)
      expect(data.last24Hours.withdrawals.count).toBe(2)
      expect(data.last24Hours.withdrawals.amount).toBe(800)
    })

    it('should aggregate post rewards and earnings correctly', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [{ id: 'test', email: 'test@test.com', balance: 5000000 }],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              }),
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [{ type: 'deposit', amount: 5000000 }],
                  error: null
                })
              })
            })
          }
        }

        if (table === 'posts') {
          return {
            select: () => ({
              gte: (field: string) => {
                if (field === 'created_at') {
                  return Promise.resolve({
                    data: [
                      { reward: 500 },
                      { reward: 800 },
                      { reward: 300 }
                    ],
                    error: null
                  })
                }
                
                // For fixed_at (earnings)
                return {
                  eq: () => Promise.resolve({
                    data: [
                      { reward: 500 },
                      { reward: 800 }
                    ],
                    error: null
                  })
                }
              }
            })
          }
        }

        return mockSupabaseClient
      })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [],
        error: null
      })

      const data = await dailySummary.getDailySummaryData()

      expect(data.last24Hours.rewards.count).toBe(3)
      expect(data.last24Hours.rewards.amount).toBe(1600)
      expect(data.last24Hours.earnings.count).toBe(2)
      expect(data.last24Hours.earnings.amount).toBe(1300)
    })

    it('should count active users correctly', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [{ id: 'test', email: 'test@test.com', balance: 5000000 }],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              }),
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [{ type: 'deposit', amount: 5000000 }],
                  error: null
                })
              })
            })
          }
        }

        if (table === 'posts') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: ['user1', 'user2', 'user3'],
        error: null
      })

      const data = await dailySummary.getDailySummaryData()

      expect(data.last24Hours.activeUsers).toBe(3)
    })
  })

  describe('Email Generation', () => {
    it('should generate HTML email with correct structure', () => {
      const mockData = createMockDailySummaryData()
      const html = dailySummary.generateEmailHTML(mockData)

      expect(html).toContain('<h2>Ganamos Daily Summary')
      expect(html).toContain('<h3>Node & App Balances</h3>')
      expect(html).toContain('<h3>Last 24 Hours Activity</h3>')
      expect(html).toContain('<h3>Balance Audit</h3>')
      expect(html).toContain('<h3>API Health Checks</h3>')
    })

    it('should display passed balance audit with green checkmark', () => {
      const mockData = createMockDailySummaryData()
      mockData.balanceAudit.status = 'passed'
      
      const html = dailySummary.generateEmailHTML(mockData)

      expect(html).toContain('✅ Balance audit check confirmed')
      expect(html).toContain('color: green')
    })

    it('should display failed balance audit with red warning and discrepancies', () => {
      const mockData = createMockDailySummaryData()
      mockData.balanceAudit.status = 'failed'
      mockData.balanceAudit.usersWithDiscrepancies = 2
      mockData.balanceAudit.totalDiscrepancy = 500
      mockData.balanceAudit.discrepancies = [
        {
          email: 'user1@example.com',
          profileBalance: 1000,
          calculatedBalance: 900,
          difference: 100
        },
        {
          email: 'user2@example.com',
          profileBalance: 2000,
          calculatedBalance: 1600,
          difference: 400
        }
      ]
      
      const html = dailySummary.generateEmailHTML(mockData)

      expect(html).toContain('⚠️ Balance discrepancies detected!')
      expect(html).toContain('color: red')
      expect(html).toContain('Users with Discrepancies')
      expect(html).toContain('user1@example.com')
      expect(html).toContain('user2@example.com')
      expect(html).toContain('Profile: 1,000 sats')
      expect(html).toContain('Calculated: 900 sats')
    })

    it('should display API health status correctly', () => {
      const mockData = createMockDailySummaryData()
      
      const html = dailySummary.generateEmailHTML(mockData)

      expect(html).toContain('✅ Voltage API: Online')
      expect(html).toContain('✅ Groq API: Online')
      expect(html).toContain('✅ Resend API: Online')
    })

    it('should display API errors when services are offline', () => {
      const mockData = createMockDailySummaryData()
      mockData.apiHealth.voltage.status = 'error'
      mockData.apiHealth.voltage.error = 'Connection timeout'
      mockData.apiHealth.groq.status = 'offline'
      mockData.apiHealth.groq.error = 'API key invalid'
      
      const html = dailySummary.generateEmailHTML(mockData)

      expect(html).toContain('❌ Voltage API: ERROR')
      expect(html).toContain('Connection timeout')
      expect(html).toContain('❌ Groq API: OFFLINE')
      expect(html).toContain('API key invalid')
    })

    it('should format numbers with thousands separators', () => {
      const mockData = createMockDailySummaryData()
      mockData.nodeBalance.total_balance = 5600000
      mockData.last24Hours.deposits.amount = 123456
      
      const html = dailySummary.generateEmailHTML(mockData)

      expect(html).toContain('5,600,000 sats')
      expect(html).toContain('123,456 sats')
    })
  })

  describe('Email Delivery', () => {
    it('should call sendEmail with correct parameters', async () => {
      const sendEmailSpy = vi.spyOn(email, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-message-id'
      })

      const mockData = createMockDailySummaryData()
      vi.spyOn(dailySummary, 'getDailySummaryData').mockResolvedValue(mockData)

      const result = await dailySummary.sendDailySummaryEmail('admin@example.com')

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'admin@example.com',
        expect.stringContaining('Ganamos Daily Summary'),
        expect.stringContaining('<h2>Ganamos Daily Summary')
      )
      expect(result.success).toBe(true)
      expect(result.messageId).toBe('test-message-id')
    })

    it('should return error when email sending fails', async () => {
      vi.spyOn(email, 'sendEmail').mockResolvedValue({
        success: false,
        error: 'SMTP connection failed'
      })

      const mockData = createMockDailySummaryData()
      vi.spyOn(dailySummary, 'getDailySummaryData').mockResolvedValue(mockData)

      const result = await dailySummary.sendDailySummaryEmail('admin@example.com')

      expect(result.success).toBe(false)
      expect(result.error).toBe('SMTP connection failed')
    })

    it('should use default email when no recipient specified', async () => {
      const sendEmailSpy = vi.spyOn(email, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-message-id'
      })

      const mockData = createMockDailySummaryData()
      vi.spyOn(dailySummary, 'getDailySummaryData').mockResolvedValue(mockData)

      await dailySummary.sendDailySummaryEmail()

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'brianmurray03@gmail.com',
        expect.any(String),
        expect.any(String)
      )
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when data aggregation fails', async () => {
      vi.spyOn(dailySummary, 'getDailySummaryData').mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary', {
        headers: {
          'authorization': `Bearer ${mockEnv.CRON_SECRET}`
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should return 500 when email sending fails', async () => {
      const mockData = createMockDailySummaryData()
      vi.spyOn(dailySummary, 'getDailySummaryData').mockResolvedValue(mockData)
      vi.spyOn(email, 'sendEmail').mockResolvedValue({
        success: false,
        error: 'Email service unavailable'
      })

      const request = new NextRequest('http://localhost:3457/api/admin/daily-summary', {
        headers: {
          'authorization': `Bearer ${mockEnv.CRON_SECRET}`
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email')
      expect(data.details).toBe('Email service unavailable')
    })
  })

  describe('Response Structure', () => {
    it('should return DailySummaryData with all required fields', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              neq: () => ({
                order: () => Promise.resolve({
                  data: [],
                  error: null
                })
              })
            })
          }
        }
        
        if (table === 'transactions') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              }),
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              })
            })
          }
        }

        if (table === 'posts') {
          return {
            select: () => ({
              gte: () => ({
                eq: () => Promise.resolve({
                  data: [],
                  error: null
                })
              })
            })
          }
        }

        return mockSupabaseClient
      })
      
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null })

      const data = await dailySummary.getDailySummaryData()

      // Verify top-level structure
      expect(data).toHaveProperty('nodeBalance')
      expect(data).toHaveProperty('appTotalBalance')
      expect(data).toHaveProperty('balanceAudit')
      expect(data).toHaveProperty('apiHealth')
      expect(data).toHaveProperty('last24Hours')

      // Verify nodeBalance structure
      expect(data.nodeBalance).toHaveProperty('channel_balance')
      expect(data.nodeBalance).toHaveProperty('pending_balance')
      expect(data.nodeBalance).toHaveProperty('onchain_balance')
      expect(data.nodeBalance).toHaveProperty('total_balance')

      // Verify balanceAudit structure
      expect(data.balanceAudit).toHaveProperty('status')
      expect(data.balanceAudit).toHaveProperty('totalUsers')
      expect(data.balanceAudit).toHaveProperty('usersWithDiscrepancies')
      expect(data.balanceAudit).toHaveProperty('totalDiscrepancy')
      expect(data.balanceAudit).toHaveProperty('discrepancies')

      // Verify apiHealth structure
      expect(data.apiHealth).toHaveProperty('voltage')
      expect(data.apiHealth).toHaveProperty('groq')
      expect(data.apiHealth).toHaveProperty('resend')

      // Verify last24Hours structure
      expect(data.last24Hours).toHaveProperty('transactions')
      expect(data.last24Hours).toHaveProperty('deposits')
      expect(data.last24Hours).toHaveProperty('withdrawals')
      expect(data.last24Hours).toHaveProperty('rewards')
      expect(data.last24Hours).toHaveProperty('earnings')
      expect(data.last24Hours).toHaveProperty('activeUsers')
    })
  })
})

// Helper function to create mock daily summary data
function createMockDailySummaryData(): dailySummary.DailySummaryData {
  return {
    nodeBalance: {
      channel_balance: 5000000,
      pending_balance: 100000,
      onchain_balance: 500000,
      total_balance: 5600000
    },
    appTotalBalance: 5500000,
    balanceAudit: {
      status: 'passed',
      totalUsers: 10,
      usersWithDiscrepancies: 0,
      totalDiscrepancy: 0,
      discrepancies: []
    },
    apiHealth: {
      voltage: {
        status: 'online',
        nodeBalance: 5600000,
        discrepancy: 100000
      },
      groq: {
        status: 'online'
      },
      resend: {
        status: 'online'
      }
    },
    last24Hours: {
      transactions: {
        count: 25
      },
      deposits: {
        count: 10,
        amount: 50000
      },
      withdrawals: {
        count: 8,
        amount: 30000
      },
      rewards: {
        count: 5,
        amount: 25000
      },
      earnings: {
        count: 3,
        amount: 15000
      },
      activeUsers: 12
    }
  }
}