/**
 * A small stateful, in-memory stand-in for Supabase, for unit tests of server
 * actions that move money.
 *
 * Why: chain mocks ("the 3rd .single() returns X") can only check which calls
 * were made. For payouts we want to assert the resulting STATE (balances,
 * transactions, paid markers) and that repeated / concurrent / unauthorized
 * calls cannot pay twice. This fake executes the query-builder chains the app
 * uses against plain arrays, and implements the payout RPCs with the same
 * semantics as the SQL in supabase/migrations/20261108000000_atomic_payouts.sql.
 *
 * Two clients share the same tables:
 *  - the session client (createServerSupabaseClient({ cookieStore }) or with a
 *    cookie store argument): auth comes from `fake.user`; updates go through a
 *    model of RLS / the protect_post_financial_fields trigger (see below);
 *  - the admin client (createServerSupabaseClient({ supabaseKey }) or no args):
 *    service role, no restrictions.
 * Every operation is recorded in `fake.log` with the client it used.
 */
import { vi } from 'vitest'
import { createServerSupabaseClient } from '@/lib/supabase'

export type Row = Record<string, any>
export type Tables = Record<string, Row[]>
export type ClientRole = 'session' | 'admin'

export interface LoggedOp {
  role: ClientRole
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  payload?: any
  filters: Array<[string, string, any]>
  rowsAffected: number
}

/** Columns browser sessions can't change on posts (protect_post_financial_fields). */
export const PROTECTED_POST_COLUMNS = [
  'reward', 'original_reward', 'fixed', 'fixed_by', 'fixed_at', 'total_boost_amount',
  'user_id', 'is_anonymous', 'funding_r_hash', 'funding_status', 'funding_payment_request',
  'submitted_fix_payment_hash', 'deleted_at', 'expires_at',
  'reward_paid_at', 'reward_paid_to', 'anonymous_claim_token_hash', 'anonymous_reward_paid_at',
  'anonymous_reward_payment_hash', 'anonymous_reward_payment_lock',
  'submitted_fix_lightning_address', 'submitted_fix_payout_invoice',
]

const PG_NO_ROWS = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${++idCounter}`

export function createFakeSupabase(initial: Tables = {}) {
  const tables: Tables = JSON.parse(JSON.stringify(initial))
  const log: LoggedOp[] = []

  const fake = {
    tables,
    log,
    /** Signed-in user for the session client (null = signed out) */
    user: null as null | { id: string; email?: string },
    /** Return an error object to make an operation fail (checked before it runs) */
    failOp: (_op: LoggedOp): any => null,
    /** Extra latency (ms, or a promise to await) per operation, to interleave concurrent calls */
    latency: (_op: LoggedOp): number | Promise<unknown> => 0,
    /** Runs right before an operation executes (after latency), e.g. to simulate a concurrent writer */
    beforeOp: (_op: LoggedOp): void => {},
    /** Custom / overriding RPC handlers: (args, role) => { data, error } */
    rpcHandlers: {} as Record<string, (args: any, role: ClientRole) => { data: any; error: any } | Promise<{ data: any; error: any }>>,
    sessionClient: null as any,
    adminClient: null as any,
    /**
     * Latency function that holds every operation matching `pred` until `count` of them
     * have arrived, then releases them together: deterministic lockstep for race tests
     * ("both requests passed their checks and reached the write before either wrote").
     * Operations not matching `pred` are not delayed.
     */
    barrier(pred: (op: LoggedOp) => boolean, count = 2) {
      let arrived = 0
      let release!: () => void
      const gate = new Promise<void>(r => (release = r))
      return (op: LoggedOp) => {
        if (!pred(op)) return 0
        arrived++
        if (arrived >= count) release()
        // If fewer requests ever get here (e.g. one was rejected earlier), don't hang the
        // test until its timeout: release after a while so assertions report the outcome.
        else setTimeout(release, 500)
        return gate
      }
    },
    /** Convenience lookups */
    row: (table: string, id: string) => (tables[table] || []).find(r => r.id === id),
    rows: (table: string, pred: (r: Row) => boolean = () => true) => (tables[table] || []).filter(pred),
    ops: (pred: (op: LoggedOp) => boolean) => log.filter(pred),
    /** Route the globally-mocked createServerSupabaseClient to this fake. */
    install() {
      vi.mocked(createServerSupabaseClient).mockImplementation((options?: any) =>
        // Mirrors lib/supabase.ts: only `{ cookieStore }` yields a user-session client.
        // Anything else (no args, `{ supabaseKey }`, or a cookie store passed positionally)
        // falls through to the service-role key.
        (options?.cookieStore ? fake.sessionClient : fake.adminClient) as any
      )
      return fake
    },
  }

  const wait = (ms: number | Promise<unknown>) =>
    typeof ms !== 'number' ? ms : ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
  const isNull = (v: any) => v === null || v === undefined

  function matches(row: Row, filters: Array<[string, string, any]>) {
    return filters.every(([kind, col, val]) => {
      const v = row[col]
      switch (kind) {
        case 'eq': return v === val
        case 'neq': return v !== val
        case 'is': return val === null ? isNull(v) : v === val
        case 'not.is': return val === null ? !isNull(v) : v !== val
        case 'in': return (val as any[]).includes(v)
        case 'lt': return !isNull(v) && v < val
        case 'lte': return !isNull(v) && v <= val
        case 'gt': return !isNull(v) && v > val
        case 'gte': return !isNull(v) && v >= val
        case 'ilike': {
          const re = new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
          return !isNull(v) && re.test(String(v))
        }
        default: throw new Error(`fake-supabase: unsupported filter ${kind}`)
      }
    })
  }

  /** RLS / trigger model for session-client updates. */
  function sessionUpdate(table: string, row: Row, payload: Row): Row | null {
    if (table === 'profiles') {
      // RLS "Users can update own profile"
      if (!fake.user || row.id !== fake.user.id) return null
      const { balance, pet_coins, ...rest } = payload // balances are service-role only
      return rest
    }
    if (table === 'posts') {
      const p = { ...payload }
      for (const c of PROTECTED_POST_COLUMNS) delete p[c] // trigger pins NEW.c := OLD.c
      return p
    }
    return payload
  }

  function builder(role: ClientRole, table: string) {
    const filters: Array<[string, string, any]> = []
    let op: LoggedOp['op'] = 'select'
    let payload: any
    let returning = false
    let limitN: number | null = null

    const run = async (): Promise<{ data: any; error: any }> => {
      const entry: LoggedOp = { role, table, op, payload, filters: [...filters], rowsAffected: 0 }
      await wait(fake.latency(entry))
      fake.beforeOp(entry)
      log.push(entry)
      const injected = fake.failOp(entry)
      if (injected) return { data: null, error: injected }

      const rows = (tables[table] ||= [])
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map(r => ({ id: r.id ?? nextId(table), ...r }))
        rows.push(...list)
        entry.rowsAffected = list.length
        return { data: returning ? list.map(r => ({ ...r })) : null, error: null }
      }
      if (op === 'update') {
        const hit = rows.filter(r => matches(r, filters))
        const changed: Row[] = []
        for (const r of hit) {
          const effective = role === 'session' ? sessionUpdate(table, r, payload) : payload
          if (effective === null) continue // filtered out by RLS: silently 0 rows
          Object.assign(r, effective)
          changed.push(r)
        }
        entry.rowsAffected = changed.length
        return { data: returning ? changed.map(r => ({ ...r })) : null, error: null }
      }
      if (op === 'delete') {
        const keep = rows.filter(r => !matches(r, filters))
        entry.rowsAffected = rows.length - keep.length
        tables[table] = keep
        return { data: null, error: null }
      }
      let data = rows.filter(r => matches(r, filters)).map(r => ({ ...r }))
      if (limitN !== null) data = data.slice(0, limitN)
      entry.rowsAffected = data.length
      return { data, error: null }
    }

    const q: any = {
      select: (_cols?: string) => {
        if (op !== 'select') returning = true
        return q
      },
      insert: (p: any) => { op = 'insert'; payload = p; return q },
      update: (p: any) => { op = 'update'; payload = p; return q },
      delete: () => { op = 'delete'; return q },
      eq: (c: string, v: any) => { filters.push(['eq', c, v]); return q },
      neq: (c: string, v: any) => { filters.push(['neq', c, v]); return q },
      is: (c: string, v: any) => { filters.push(['is', c, v]); return q },
      not: (c: string, operator: string, v: any) => {
        if (operator !== 'is') throw new Error(`fake-supabase: unsupported not.${operator}`)
        filters.push(['not.is', c, v]); return q
      },
      in: (c: string, v: any[]) => { filters.push(['in', c, v]); return q },
      lt: (c: string, v: any) => { filters.push(['lt', c, v]); return q },
      lte: (c: string, v: any) => { filters.push(['lte', c, v]); return q },
      gt: (c: string, v: any) => { filters.push(['gt', c, v]); return q },
      gte: (c: string, v: any) => { filters.push(['gte', c, v]); return q },
      ilike: (c: string, v: any) => { filters.push(['ilike', c, v]); return q },
      order: () => q,
      limit: (n: number) => { limitN = n; return q },
      single: async () => {
        const { data, error } = await run()
        if (error) return { data: null, error }
        const list = Array.isArray(data) ? data : data === null ? [] : [data]
        return list.length === 1 ? { data: list[0], error: null } : { data: null, error: PG_NO_ROWS }
      },
      maybeSingle: async () => {
        const { data, error } = await run()
        if (error) return { data: null, error }
        const list = Array.isArray(data) ? data : data === null ? [] : [data]
        if (list.length > 1) return { data: null, error: PG_NO_ROWS }
        return { data: list[0] ?? null, error: null }
      },
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    }
    return q
  }

  /* ---------------- RPCs (same semantics as the SQL functions) ---------------- */

  const raise = (message: string, code = 'P0001') => ({ data: null, error: { message, code } })

  /** pay_fix_reward: pay the post's STORED reward to the fixer, exactly once. */
  function payFixReward(args: { p_post_id: string; p_fixer_id: string; p_memo: string }) {
    const post = (tables.posts ||= []).find(p => p.id === args.p_post_id)
    if (!post) return raise('post_not_found', 'P0002')
    if (post.deleted_at) return raise('post_deleted')
    if (post.reward_paid_at || post.anonymous_reward_paid_at) return raise('reward_already_paid')
    if (!post.reward || post.reward <= 0) return raise('no_reward')
    const fixer = (tables.profiles ||= []).find(p => p.id === args.p_fixer_id)
    // The SQL sets posts.reward_paid_to (FK to profiles) before its fixer check, so an unknown
    // fixer surfaces as a foreign-key violation, not 'fixer_not_found'. Whole function rolls back.
    if (!fixer) return raise('insert or update on table "posts" violates foreign key constraint "posts_reward_paid_to_fkey"', '23503')
    post.reward_paid_at = new Date().toISOString()
    post.reward_paid_to = args.p_fixer_id
    fixer.balance = (fixer.balance || 0) + post.reward
    fixer.pet_coins = (fixer.pet_coins || 0) + post.reward
    fixer.fixed_issues_count = (fixer.fixed_issues_count || 0) + 1
    const tx = { id: nextId('tx'), user_id: args.p_fixer_id, type: 'internal', amount: post.reward, status: 'completed', memo: args.p_memo }
    ;(tables.transactions ||= []).push(tx)
    return { data: [{ transaction_id: tx.id, amount: post.reward, new_balance: fixer.balance }], error: null }
  }

  /** credit_deposit: pending -> completed + credit, once; NULL if not pending for that user. */
  function creditDeposit(args: { p_transaction_id: string; p_user_id: string; p_amount: number }) {
    if (args.p_amount == null || args.p_amount < 0) return raise('invalid_amount')
    const tx = (tables.transactions ||= []).find(
      t => t.id === args.p_transaction_id && t.user_id === args.p_user_id && t.type === 'deposit' && t.status === 'pending'
    )
    if (!tx) return { data: null, error: null }
    const profile = (tables.profiles ||= []).find(p => p.id === args.p_user_id)
    if (!profile) return raise('profile_not_found', 'P0002')
    tx.status = 'completed'
    tx.amount = args.p_amount
    profile.balance = (profile.balance || 0) + args.p_amount
    profile.pet_coins = (profile.pet_coins || 0) + args.p_amount
    return { data: profile.balance, error: null }
  }

  const SERVICE_ROLE_ONLY = new Set(['pay_fix_reward', 'credit_deposit'])

  function rpcFor(role: ClientRole) {
    return vi.fn(async (fn: string, args: any) => {
      const entry: LoggedOp = { role, table: fn, op: 'rpc', payload: args, filters: [], rowsAffected: 0 }
      await wait(fake.latency(entry))
      fake.beforeOp(entry)
      log.push(entry)
      const injected = fake.failOp(entry)
      if (injected) return { data: null, error: injected }
      if (fake.rpcHandlers[fn]) return fake.rpcHandlers[fn](args, role)
      // REVOKE ... FROM anon, authenticated: browser sessions can't execute these
      if (SERVICE_ROLE_ONLY.has(fn) && role !== 'admin') {
        return raise(`permission denied for function ${fn}`, '42501')
      }
      // No awaits between check and write below: atomic like a row-locked transaction
      if (fn === 'pay_fix_reward') return payFixReward(args)
      if (fn === 'credit_deposit') return creditDeposit(args)
      return raise(`fake-supabase: unexpected rpc ${fn}`)
    })
  }

  function client(role: ClientRole) {
    return {
      __role: role,
      from: vi.fn((table: string) => builder(role, table)),
      rpc: rpcFor(role),
      auth: {
        getUser: vi.fn(async () =>
          fake.user ? { data: { user: fake.user }, error: null } : { data: { user: null }, error: { message: 'Not authenticated' } }
        ),
        getSession: vi.fn(async () =>
          fake.user ? { data: { session: { user: fake.user } }, error: null } : { data: { session: null }, error: null }
        ),
      },
    }
  }

  fake.sessionClient = client('session')
  fake.adminClient = client('admin')
  return fake
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>
