/**
 * Minimal in-memory Supabase client for unit tests that need real
 * conditional-update semantics (locks, compare-and-swap, once-only markers).
 *
 * Supports: from(t).select(cols).eq/neq/is/in/gte/lte/or/limit/order/single/maybeSingle,
 * from(t).update(v).<filters>.select(), from(t).insert(v).select().single(),
 * from(t).delete().<filters>, and rpc(name, args) via handlers.
 * Filters apply to the rows; updates mutate them. Everything is awaitable.
 */
type Row = Record<string, any>
type Filter = (row: Row) => boolean
type RpcHandler = (args: any, db: FakeDb) => { data?: any; error?: any } | Promise<{ data?: any; error?: any }>

export class FakeDb {
  tables: Record<string, Row[]> = {}
  rpcHandlers: Record<string, RpcHandler> = {}
  calls: { table: string; op: string; values?: any }[] = []
  rpcCalls: { name: string; args: any }[] = []

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map((r) => ({ ...r }))
  }

  table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = []
    return this.tables[name]
  }

  row(table: string, id: string): Row | undefined {
    return this.table(table).find((r) => r.id === id)
  }

  client(): any {
    return {
      from: (table: string) => new Query(this, table),
      rpc: async (name: string, args: any) => {
        this.rpcCalls.push({ name, args })
        const h = this.rpcHandlers[name]
        if (!h) return { data: null, error: { message: `no rpc handler for ${name}` } }
        const r = await h(args, this)
        return { data: r.data ?? null, error: r.error ?? null }
      },
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    }
  }
}

class Query implements PromiseLike<any> {
  private filters: Filter[] = []
  private op: 'select' | 'update' | 'insert' | 'delete' = 'select'
  private values: any
  private returning = false
  private singleMode: 'none' | 'single' | 'maybe' = 'none'
  private limitN: number | null = null

  constructor(private db: FakeDb, private tableName: string) {}

  select(_cols?: string, _opts?: any) {
    if (this.op === 'select') this.op = 'select'
    else this.returning = true
    return this
  }
  update(values: any) { this.op = 'update'; this.values = values; return this }
  insert(values: any) { this.op = 'insert'; this.values = values; return this }
  delete() { this.op = 'delete'; return this }

  eq(col: string, v: any) { this.filters.push((r) => r[col] === v); return this }
  neq(col: string, v: any) { this.filters.push((r) => r[col] !== v); return this }
  is(col: string, v: any) { this.filters.push((r) => (v === null ? r[col] === null || r[col] === undefined : r[col] === v)); return this }
  in(col: string, vs: any[]) { this.filters.push((r) => vs.includes(r[col])); return this }
  gte(col: string, v: any) { this.filters.push((r) => r[col] >= v); return this }
  lte(col: string, v: any) { this.filters.push((r) => r[col] <= v); return this }
  not(col: string, op: string, v: any) {
    if (op === 'is' && v === null) this.filters.push((r) => r[col] !== null && r[col] !== undefined)
    return this
  }
  or(expr: string) {
    // supports "a.eq.x,b.eq.y"
    const parts = expr.split(',').map((p) => p.split('.'))
    this.filters.push((r) => parts.some(([c, o, ...rest]) => o === 'eq' && String(r[c]) === rest.join('.')))
    return this
  }
  order() { return this }
  limit(n: number) { this.limitN = n; return this }
  single() { this.singleMode = 'single'; return this }
  maybeSingle() { this.singleMode = 'maybe'; return this }

  private matches(): Row[] {
    return this.db.table(this.tableName).filter((r) => this.filters.every((f) => f(r)))
  }

  private exec(): { data: any; error: any } {
    this.db.calls.push({ table: this.tableName, op: this.op, values: this.values })
    let rows: Row[]
    if (this.op === 'insert') {
      const list = (Array.isArray(this.values) ? this.values : [this.values]).map((v: Row) => ({ ...v }))
      this.db.table(this.tableName).push(...list)
      rows = list
    } else if (this.op === 'update') {
      rows = this.matches()
      for (const r of rows) Object.assign(r, this.values)
      if (!this.returning) return { data: null, error: null }
    } else if (this.op === 'delete') {
      const t = this.db.table(this.tableName)
      rows = this.matches()
      this.db.tables[this.tableName] = t.filter((r) => !rows.includes(r))
      return { data: null, error: null }
    } else {
      rows = this.matches()
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN)
    const copies = rows.map((r) => ({ ...r }))
    if (this.singleMode === 'single') {
      return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { message: 'not found', code: 'PGRST116' } }
    }
    if (this.singleMode === 'maybe') return { data: copies[0] ?? null, error: null }
    return { data: copies, error: null }
  }

  then<T1 = any, T2 = never>(onfulfilled?: ((value: any) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return Promise.resolve().then(() => this.exec()).then(onfulfilled, onrejected)
  }
}
