/**
 * Daily summary: the app balance counts every sat the app owes or holds, and
 * the email uses the shared template with no activity grid.
 */
import { describe, it, expect, vi } from 'vitest'
import { FakeDb } from '@/tests/helpers/fake-supabase'

vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/lightning', () => ({ lndRequest: vi.fn() }))

import { getAppBalanceBreakdown, generateEmailHTML, type DailySummaryData } from '@/lib/daily-summary'

function seedRows() {
  return new FakeDb({
    profiles: [
      { id: 'u1', balance: 1000, status: 'active' },
      { id: 'u2', balance: 500, status: 'suspended' },
      { id: 'u3', balance: 0, status: 'deleted' },
    ],
    posts: [
      { id: 'p-open', reward: 300, fixed: false, fixed_by: null, deleted_at: null },
      { id: 'p-deleted', reward: 999, fixed: false, fixed_by: null, deleted_at: '2026-11-01T00:00:00Z' },
      { id: 'p-anon-unfunded', reward: 4000, fixed: true, fixed_by: null, deleted_at: null, anonymous_reward_paid_at: null, reward_paid_at: null },
      { id: 'p-anon-unclaimed', reward: 200, fixed: true, fixed_by: null, deleted_at: null, anonymous_reward_paid_at: null, reward_paid_at: null },
      { id: 'p-anon-paid', reward: 777, fixed: true, fixed_by: null, deleted_at: null, anonymous_reward_paid_at: '2026-11-02T00:00:00Z', reward_paid_at: null },
      { id: 'p-user-paid', reward: 888, fixed: true, fixed_by: 'u1', deleted_at: null, anonymous_reward_paid_at: null, reward_paid_at: '2026-11-02T00:00:00Z' },
      { id: 'p-no-reward', reward: 0, fixed: false, fixed_by: null, deleted_at: null },
    ],
    pet_orders: [
      { id: 'o1', total_price_sats: 50, payment_status: 'paid' },
      { id: 'o2', total_price_sats: 70, payment_status: 'pending' },
    ],
    donations: [
      { id: 'd1', amount: 3000, status: 'completed' },
      { id: 'd2', amount: 9999, status: 'pending' },
    ],
    node_balance_adjustments: [{ id: 'a1', amount: 21_550, reason: 'Operator overfunded the node' }],
  })
}

function seed() {
  const db = seedRows()
  db.rpcHandlers.post_reward_is_funded = ({ p_post_id }: any) => ({ data: p_post_id !== 'p-anon-unfunded' })
  return db
}

const summary = (breakdown: any, node: number): DailySummaryData =>
  ({
    nodeBalance: { channel_balance: node, pending_balance: 0, onchain_balance: 0, total_balance: node },
    balanceBreakdown: breakdown,
    apiHealth: { voltage: { status: 'online', nodeBalance: node, discrepancy: 0 } },
  }) as any

describe('getAppBalanceBreakdown', () => {
  it('sums users (any status), open and funded unclaimed rewards, donations, paid orders and operator credits', async () => {
    const b = await getAppBalanceBreakdown(seed().client())
    expect(b).toEqual({
      userBalances: 1500,
      openIssuesBalance: 300,
      unclaimedRewards: 200,
      donationsBalance: 3000,
      paidOrdersBalance: 50,
      adjustments: 21_550,
      totalAppBalance: 1500 + 300 + 200 + 3000 + 50 + 21_550,
    })
  })

  it('fails rather than under-counting when the adjustments query errors', async () => {
    const db = seed()
    const client = db.client()
    const from = client.from
    client.from = (t: string) =>
      t === 'node_balance_adjustments'
        ? { select: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'timeout' } }) }) }) }
        : from(t)
    await expect(getAppBalanceBreakdown(client)).rejects.toThrow(/timeout/)
  })

  it('counts past the 1000-row page limit', async () => {
    const db = new FakeDb({ profiles: Array.from({ length: 2500 }, (_, i) => ({ id: `u${i}`, balance: 1 })) })
    expect((await getAppBalanceBreakdown(db.client())).userBalances).toBe(2500)
  })
})

describe('generateEmailHTML', () => {
  const breakdown = { userBalances: 700_000, openIssuesBalance: 65_230, unclaimedRewards: 0, donationsBalance: 0, paidOrdersBalance: 0, adjustments: 0, totalAppBalance: 765_230 }

  it('uses the shared template and drops the activity grid', () => {
    const html = generateEmailHTML(summary(breakdown, 786_780))
    expect(html).toContain('logo-wordmark.png')
    expect(html).toContain('Daily Summary')
    expect(html).not.toMatch(/>Tx<|title="Deposits"|>-1</)
  })

  it('flags an out-of-sync difference with its sign', () => {
    const html = generateEmailHTML(summary(breakdown, 786_780))
    expect(html).toContain('786,780 sats')
    expect(html).toContain('765,230 sats')
    expect(html).toContain('+21,550 sats')
    expect(html).toContain('Node holds more than the app accounts for')
  })

  it('reports in sync once the operator credit covers the difference', () => {
    const html = generateEmailHTML(
      summary({ ...breakdown, adjustments: 21_550, totalAppBalance: 786_780 }, 786_780)
    )
    expect(html).toContain('In sync')
    expect(html).toContain('Operator credit')
    expect(html).not.toContain('Node holds more')
  })

  it('says the node is unavailable instead of comparing against a zero balance', () => {
    const d = { ...summary(breakdown, 0), nodeBalanceError: 'LND timeout' } as any
    // Health check succeeded later; the balance shown was still never read
    d.apiHealth.voltage.status = 'online'
    const html = generateEmailHTML(d)
    expect(html).toContain('Node unreachable')
    expect(html).toContain('LND timeout')
    expect(html).not.toContain('App owes more')
    expect(html).not.toContain('−765,230')
  })
})
