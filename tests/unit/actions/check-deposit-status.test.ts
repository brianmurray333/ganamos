import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockCookieStore } from '@/tests/mocks'

/**
 * checkDepositStatus (app/actions/lightning-actions.ts) against a small stateful
 * in-memory database.
 *
 * Call-by-call behavior (session, ownership, amount mismatch, notifications,
 * cache revalidation, error branches) is covered with chain mocks in
 * tests/unit/actions/deposit-invoice.test.ts. This file covers what chain mocks
 * cannot: the resulting *state* (balances, transaction status, activities) and
 * what happens when two checks for the same invoice run concurrently.
 *
 * History: this file used to hold a describe.skip'd suite written against an
 * API that never existed in this codebase (an `increment_user_balance` RPC, an
 * `r_hash` column, a single Supabase client, a preimage in the response). It was
 * replaced by this suite, which keeps that suite's intents (auth, ownership,
 * idempotency, no double credit, failure atomicity, zero-amount, concurrency).
 */

const mockCookieStore = createMockCookieStore()

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

vi.mock('@/lib/lightning', () => ({
  checkInvoice: vi.fn(),
  createInvoice: vi.fn(),
  payInvoice: vi.fn(),
}))

vi.mock('@/lib/transaction-emails', () => ({
  sendBitcoinReceivedEmail: vi.fn(() => Promise.resolve({ success: true })),
}))

vi.mock('@/lib/sms-alerts', () => ({
  alertLargeDeposit: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/safety-caps', () => ({
  checkBalanceCap: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { checkDepositStatus } from '@/app/actions/lightning-actions'
import { checkInvoice } from '@/lib/lightning'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkBalanceCap } from '@/lib/safety-caps'
import {
  createMockSettledInvoiceResponse,
  createMockUnsettledInvoiceResponse,
} from '@/tests/unit/helpers/invoice-status-helpers'

const USER_ID = 'user-depositor'
const OTHER_USER_ID = 'user-other'
const R_HASH = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
const TX_ID = 'tx-deposit-1'
const START_BALANCE = 5000
const DEPOSIT = 1000

type Row = Record<string, any>
type Tables = Record<string, Row[]>

/**
 * Minimal stateful stand-in for the Supabase query builder: supports the
 * select/eq/single, update/eq and insert chains checkDepositStatus uses.
 * Every operation yields to the event loop (optionally with extra latency) so
 * concurrent calls genuinely interleave, like real network round trips.
 */
function createFakeDb(initial: Tables) {
  const tables: Tables = JSON.parse(JSON.stringify(initial))
  const opts = {
    session: { user: { id: USER_ID } } as any,
    /** Extra latency (ms) per operation, decided per call */
    latency: (_table: string, _op: string, _columns: string) => 0,
    /** Inject an error for an update */
    failUpdate: (_table: string, _payload: Row): any => null,
  }

  const matches = (row: Row, filters: [string, any][]) => filters.every(([c, v]) => row[c] === v)
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

  function builder(table: string) {
    const filters: [string, any][] = []
    let op: 'select' | 'update' | 'insert' = 'select'
    let payload: any
    let columns = '*'

    const run = async () => {
      await wait(opts.latency(table, op, columns))
      const rows = (tables[table] ||= [])
      if (op === 'update') {
        const error = opts.failUpdate(table, payload)
        if (error) return { data: null, error }
        rows.filter(r => matches(r, filters)).forEach(r => Object.assign(r, payload))
        return { data: null, error: null }
      }
      if (op === 'insert') {
        rows.push(...(Array.isArray(payload) ? payload : [payload]))
        return { data: null, error: null }
      }
      return { data: rows.filter(r => matches(r, filters)).map(r => ({ ...r })), error: null }
    }

    const q: any = {
      select: (cols: string = '*') => {
        columns = cols
        return q
      },
      eq: (col: string, val: any) => {
        filters.push([col, val])
        return q
      },
      update: (p: Row) => {
        op = 'update'
        payload = p
        return q
      },
      insert: (p: Row) => {
        op = 'insert'
        payload = p
        return q
      },
      single: async () => {
        const { data, error } = await run()
        if (error) return { data: null, error }
        return data.length === 1
          ? { data: data[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not exactly one row' } }
      },
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    }
    return q
  }

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: opts.session }, error: null })),
    },
    from: vi.fn((table: string) => builder(table)),
  }

  return { tables, opts, client }
}

function seed(overrides: { tx?: Partial<Row>; profile?: Partial<Row> } = {}): Tables {
  return {
    transactions: [
      {
        id: TX_ID,
        user_id: USER_ID,
        type: 'deposit',
        amount: DEPOSIT,
        status: 'pending',
        r_hash_str: R_HASH,
        ...overrides.tx,
      },
    ],
    profiles: [
      {
        id: USER_ID,
        balance: START_BALANCE,
        pet_coins: START_BALANCE,
        email: 'depositor@example.com',
        name: 'Depositor',
        ...overrides.profile,
      },
    ],
    activities: [],
  }
}

describe('checkDepositStatus - resulting state (stateful fake DB)', () => {
  let db: ReturnType<typeof createFakeDb>

  const profile = () => db.tables.profiles.find(p => p.id === USER_ID)!
  const tx = () => db.tables.transactions.find(t => t.id === TX_ID)!
  const depositActivities = () => db.tables.activities.filter(a => a.type === 'deposit')

  function useDb(initial: Tables) {
    db = createFakeDb(initial)
    vi.mocked(createServerSupabaseClient).mockReturnValue(db.client as any)
    return db
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.SUPABASE_SECRET_API_KEY = 'mock-secret-api-key'
    vi.mocked(checkBalanceCap).mockResolvedValue({ allowed: true, capLevel: 'none' })
    vi.mocked(checkInvoice).mockResolvedValue(
      createMockSettledInvoiceResponse({ amountPaid: String(DEPOSIT) }) as any
    )
    useDb(seed())
  })

  describe('single check', () => {
    it('credits balance and pet_coins exactly once and completes the transaction', async () => {
      const result = await checkDepositStatus(R_HASH)

      expect(result).toMatchObject({ success: true, settled: true, amount: DEPOSIT, newBalance: START_BALANCE + DEPOSIT })
      expect(profile().balance).toBe(START_BALANCE + DEPOSIT)
      expect(profile().pet_coins).toBe(START_BALANCE + DEPOSIT)
      expect(tx().status).toBe('completed')
      expect(tx().amount).toBe(DEPOSIT)
      expect(depositActivities()).toHaveLength(1)
      expect(depositActivities()[0]).toMatchObject({ user_id: USER_ID, related_id: TX_ID, metadata: { amount: DEPOSIT, status: 'completed' } })
    })

    it('is idempotent: a second sequential check does not credit again', async () => {
      await checkDepositStatus(R_HASH)
      const second = await checkDepositStatus(R_HASH)

      expect(second).toMatchObject({ success: true, settled: true, newBalance: null })
      expect(profile().balance).toBe(START_BALANCE + DEPOSIT)
      expect(profile().pet_coins).toBe(START_BALANCE + DEPOSIT)
      expect(depositActivities()).toHaveLength(1)
    })

    it('credits the amount actually paid, not the amount the invoice was created for', async () => {
      vi.mocked(checkInvoice).mockResolvedValue(createMockSettledInvoiceResponse({ amountPaid: '1500' }) as any)

      await checkDepositStatus(R_HASH)

      expect(profile().balance).toBe(START_BALANCE + 1500)
      expect(tx().amount).toBe(1500)
    })

    it('does not change anything while the invoice is unsettled', async () => {
      vi.mocked(checkInvoice).mockResolvedValue(createMockUnsettledInvoiceResponse() as any)

      const result = await checkDepositStatus(R_HASH)

      expect(result).toEqual({ success: true, settled: false })
      expect(profile().balance).toBe(START_BALANCE)
      expect(tx().status).toBe('pending')
      expect(depositActivities()).toHaveLength(0)
    })

    it('rejects without a session and changes nothing', async () => {
      db.opts.session = null

      const result = await checkDepositStatus(R_HASH)

      expect(result).toMatchObject({ success: false, error: 'Not authenticated' })
      expect(checkInvoice).not.toHaveBeenCalled()
      expect(profile().balance).toBe(START_BALANCE)
      expect(tx().status).toBe('pending')
    })

    it("does not credit another user's pending deposit to the caller, nor to its owner", async () => {
      useDb(seed({ tx: { user_id: OTHER_USER_ID } }))
      db.tables.profiles.push({ id: OTHER_USER_ID, balance: 0, pet_coins: 0 })

      const result = await checkDepositStatus(R_HASH)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Unauthorized/)
      expect(profile().balance).toBe(START_BALANCE)
      expect(db.tables.profiles.find(p => p.id === OTHER_USER_ID)!.balance).toBe(0)
      expect(tx().status).toBe('pending')
    })

    it("does not report another user's completed deposit as the caller's", async () => {
      useDb(seed({ tx: { user_id: OTHER_USER_ID, status: 'completed' } }))

      const result = await checkDepositStatus(R_HASH)

      expect(result).toEqual({ success: false, error: 'Unauthorized' })
      expect(profile().balance).toBe(START_BALANCE)
    })

    it('blocks the credit (and leaves the transaction pending) when the hard balance cap would be exceeded', async () => {
      vi.mocked(checkBalanceCap).mockResolvedValue({ allowed: false, capLevel: 'hard', message: 'cap' })

      const result = await checkDepositStatus(R_HASH)

      expect(result).toMatchObject({ success: false, settled: true })
      expect(profile().balance).toBe(START_BALANCE)
      expect(tx().status).toBe('pending')
      expect(depositActivities()).toHaveLength(0)
    })

    it('handles a zero-amount settled invoice without changing the balance or logging an activity', async () => {
      useDb(seed({ tx: { amount: 0 } }))
      // createMockSettledInvoiceResponse treats '0' as falsy and defaults to 1000; force 0
      vi.mocked(checkInvoice).mockResolvedValue({ ...(createMockSettledInvoiceResponse() as any), amountPaid: '0' })

      const result = await checkDepositStatus(R_HASH)

      expect(result).toMatchObject({ success: true, settled: true, amount: 0 })
      expect(profile().balance).toBe(START_BALANCE)
      expect(depositActivities()).toHaveLength(0)
    })

    // REAL BUG? lightning-actions.ts marks the transaction "completed" (L315-322) BEFORE
    // crediting the balance (L332-339), in two separate non-transactional writes. If the
    // balance write fails, the transaction stays "completed" with no credit, and every
    // later poll takes the "already completed" branch (L221-246) and returns success with
    // newBalance: null, so the user's paid deposit is never credited. Intended behavior
    // (from the original suite's "balance update failure and rollback" case): a failed
    // credit must leave the deposit retryable. Remove `.fails` once that holds.
    it.fails('leaves the deposit retryable when the balance update fails', async () => {
      db.opts.failUpdate = (table, payload) =>
        table === 'profiles' && 'balance' in payload ? { message: 'balance update failed' } : null

      const first = await checkDepositStatus(R_HASH)
      expect(first).toMatchObject({ success: false, error: 'Failed to update balance' })
      expect(profile().balance).toBe(START_BALANCE)

      // Database recovers; the next poll must credit the deposit
      db.opts.failUpdate = () => null
      await checkDepositStatus(R_HASH)
      expect(profile().balance).toBe(START_BALANCE + DEPOSIT)
    })
  })

  describe('concurrent checks of the same invoice', () => {
    it('does not credit anything when concurrent checks see an unsettled invoice', async () => {
      vi.mocked(checkInvoice).mockResolvedValue(createMockUnsettledInvoiceResponse() as any)

      const results = await Promise.all([checkDepositStatus(R_HASH), checkDepositStatus(R_HASH)])

      results.forEach(r => expect(r).toEqual({ success: true, settled: false }))
      expect(profile().balance).toBe(START_BALANCE)
      expect(tx().status).toBe('pending')
    })

    // REAL BUG? Double credit race. checkDepositStatus reads the pending transaction
    // (L210-215), then marks it completed with `.update(...).eq("id", transaction.id)`
    // (L315-322) WITHOUT a `status = 'pending'` guard (no compare-and-set / row lock / RPC),
    // and credits with a read-modify-write of profiles.balance (L279-292, L332-339).
    // Two overlapping calls (the deposit page polls on setInterval; a client can also call
    // the server action directly) can both pass the pending check and both credit.
    // Here call B reads the pending transaction before A completes it, but its profile read
    // is slower (lands after A's credit), so B adds the deposit a second time.
    it.fails('credits a settled deposit exactly once when two checks overlap', async () => {
      let profileReads = 0
      db.opts.latency = (table, op, columns) => {
        if (table === 'profiles' && op === 'select' && columns.includes('balance')) {
          profileReads++
          // 2nd profile read (call B's) is slow: it lands after A has credited
          return profileReads === 2 ? 30 : 0
        }
        return 0
      }

      const results = await Promise.all([checkDepositStatus(R_HASH), checkDepositStatus(R_HASH)])

      expect(profile().balance).toBe(START_BALANCE + DEPOSIT)
      expect(profile().pet_coins).toBe(START_BALANCE + DEPOSIT)
      expect(depositActivities()).toHaveLength(1)
      expect(results.filter(r => r.success && r.newBalance != null)).toHaveLength(1)
    })

    // REAL BUG? Same race, fully interleaved: both calls credit from the same starting
    // balance (so the lost update happens to hide the double credit in `balance`), but both
    // report a fresh credit and both write a deposit activity for one payment.
    it.fails('records a single deposit activity when two checks run in lockstep', async () => {
      const results = await Promise.all([checkDepositStatus(R_HASH), checkDepositStatus(R_HASH)])

      expect(profile().balance).toBe(START_BALANCE + DEPOSIT)
      expect(depositActivities()).toHaveLength(1)
      expect(results.filter(r => r.success && r.newBalance != null)).toHaveLength(1)
    })
  })
})
