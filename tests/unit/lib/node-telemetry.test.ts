/**
 * Node telemetry for the daily summary: read-only LND calls summarised into
 * the node-side movements the app ledger can't see.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { lndRequest } = vi.hoisted(() => ({ lndRequest: vi.fn() }))
vi.mock('@/lib/lightning', () => ({ lndRequest }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))

import { getNodeTelemetry } from '@/lib/node-telemetry'
import { generateEmailHTML, type DailySummaryData } from '@/lib/daily-summary'

const since = new Date('2026-11-19T02:53:39Z')
const sinceUnix = Math.floor(since.getTime() / 1000)

function lnd(overrides: Record<string, any> = {}) {
  const responses: Record<string, any> = {
    '/v1/channels': { success: true, data: { channels: [
      { initiator: true, commit_fee: '1200', commitment_type: 'ANCHORS' },
      { initiator: false, commit_fee: '900', commitment_type: 'ANCHORS' },
      { initiator: true, commit_fee: '300', commitment_type: 'STATIC_REMOTE_KEY' },
    ] } },
    '/v1/balance/channels': { success: true, data: { balance: '780000', unsettled_local_balance: { sat: '25' } } },
    '/v1/balance/blockchain': { success: true, data: { confirmed_balance: '7000', unconfirmed_balance: '0' } },
    '/v1/switch': { success: true, data: { forwarding_events: [{ fee: '3' }, { fee: '5' }] } },
    payments: { success: true, data: { payments: [
      { status: 'SUCCEEDED', fee_sat: '4', value_sat: '1000' },
      { status: 'FAILED', fee_sat: '99', value_sat: '5000' },
    ] } },
    invoices: { success: true, data: { invoices: [
      { state: 'SETTLED', amt_paid_sat: '600', settle_date: String(sinceUnix + 60) },
      { state: 'SETTLED', amt_paid_sat: '999', settle_date: String(sinceUnix - 60) },
      { state: 'OPEN', amt_paid_sat: '0', settle_date: '0' },
    ] } },
    ...overrides,
  }
  lndRequest.mockImplementation(async (endpoint: string) => {
    if (endpoint.startsWith('/v1/payments')) return responses.payments
    if (endpoint.startsWith('/v1/invoices')) return responses.invoices
    return responses[endpoint]
  })
}

beforeEach(() => {
  lndRequest.mockReset()
})

describe('getNodeTelemetry', () => {
  it('summarises closing-fee reserve, fees, forwards and received payments since the reconciliation', async () => {
    lnd()
    const t = await getNodeTelemetry(since)
    expect(t.channels).toEqual({ count: 3, opened: 2, closingFeeReserve: 1500, anchorReserve: 660, inFlight: 25 })
    expect(t.routingFeesEarned).toEqual({ sats: 8, events: 2 })
    expect(t.paymentFeesPaid).toEqual({ sats: 4, payments: 1, sent: 1000 })
    expect(t.invoicesSettled).toEqual({ sats: 600, count: 1 })
    expect(t.errors).toEqual([])
  })

  it('only reads from the node and scopes history to the window', async () => {
    lnd()
    await getNodeTelemetry(since)
    for (const [endpoint, method] of lndRequest.mock.calls) {
      if (endpoint === '/v1/switch') expect(method).toBe('POST') // forwarding history query
      else expect(method ?? 'GET').toBe('GET')
    }
    const sw = lndRequest.mock.calls.find(([e]) => e === '/v1/switch')!
    expect(sw[2].start_time).toBe(String(sinceUnix))
    expect(lndRequest.mock.calls.some(([e]) => e.includes(`creation_date_start=${sinceUnix}`))).toBe(true)
  })

  it('keeps what it could read when a call fails', async () => {
    lnd({ '/v1/switch': { success: false, error: 'boom' } })
    const t = await getNodeTelemetry(since)
    expect(t.errors).toEqual(['forwarding history'])
    expect(t.paymentFeesPaid.sats).toBe(4)
  })
})

describe('getNodeTelemetry history completeness', () => {
  it('sums forwarding fees in msat before converting (fractional-sat fees are not lost)', async () => {
    lnd({ '/v1/switch': { success: true, data: { forwarding_events: [
      { fee: '0', fee_msat: '500' }, { fee: '0', fee_msat: '700' }, { fee: '1', fee_msat: '1300' },
    ] } } })
    const t = await getNodeTelemetry(since)
    expect(t.routingFeesEarned).toEqual({ sats: 2, events: 3 })
  })

  it('follows pagination offsets until the history runs out', async () => {
    lnd()
    const page1 = Array.from({ length: 1000 }, () => ({ status: 'SUCCEEDED', fee_sat: '1', value_sat: '10' }))
    const page2 = [{ status: 'SUCCEEDED', fee_sat: '5', value_sat: '10' }]
    const base = lndRequest.getMockImplementation()!
    lndRequest.mockImplementation(async (endpoint: string, ...rest: any[]) => {
      if (endpoint.startsWith('/v1/payments')) {
        return endpoint.includes('index_offset=0')
          ? { success: true, data: { payments: page1, last_index_offset: '1000' } }
          : { success: true, data: { payments: page2, last_index_offset: '1001' } }
      }
      return base(endpoint, ...rest)
    })
    const t = await getNodeTelemetry(since)
    expect(t.paymentFeesPaid).toEqual({ sats: 1005, payments: 1001, sent: 10010 })
    expect(t.errors).toEqual([])
  })

  it('counts invoices created before the window that settled inside it', async () => {
    lnd({ invoices: { success: true, data: { invoices: [
      { state: 'SETTLED', amt_paid_sat: '250', creation_date: String(sinceUnix - 3600), settle_date: String(sinceUnix + 10) },
    ] } } })
    const t = await getNodeTelemetry(since)
    expect(t.invoicesSettled).toEqual({ sats: 250, count: 1 })
    const invCall = lndRequest.mock.calls.find(([e]) => e.startsWith('/v1/invoices'))!
    expect(invCall[0]).toContain(`creation_date_start=${sinceUnix - 30 * 86400}`)
  })
})

describe('daily summary email with telemetry', () => {
  it('shows the node-side movements', async () => {
    lnd()
    const t = await getNodeTelemetry(since)
    const html = generateEmailHTML({
      nodeBalance: { channel_balance: 780000, pending_balance: 0, onchain_balance: 7000, total_balance: 787000 },
      nodeTelemetry: t,
      balanceBreakdown: { userBalances: 787000, openIssuesBalance: 0, unclaimedRewards: 0, donationsBalance: 0, paidOrdersBalance: 0, adjustments: 0, totalAppBalance: 787000 },
      apiHealth: { voltage: { status: 'online', nodeBalance: 787000, discrepancy: 0 } },
    } as unknown as DailySummaryData, new Date('2026-11-24T12:00:00Z'))
    expect(html).toContain('Routing fees earned since Nov 18')
    expect(html).toContain('+8 sats (2 forwards)')
    expect(html).toContain('−4 sats (1 payments)')
    expect(html).toContain('600 sats (1 invoices)')
    expect(html).toContain('1,500 sats + 660 sats anchors')
    expect(html).toContain('Payments in flight')
  })
})
