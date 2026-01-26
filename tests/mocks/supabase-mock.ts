import { vi } from 'vitest'

/**
 * Consolidated Supabase mock utilities
 * Single source of truth for all Supabase mocking in tests
 */

/**
 * Creates a mock Supabase client with all common methods
 * Use this for tests that need a mock Supabase client
 *
 * Query builder methods (select, eq, order, single, etc.) are exposed both:
 * 1. On the client directly (for tests that use mockSupabaseClient.order.mockResolvedValue())
 * 2. Via .from() return value (for chaining like mockSupabaseClient.from('table').select())
 */
export function createMockSupabaseClient() {
  // Create query builder methods that are shared between client and .from() result
  const select = vi.fn().mockReturnThis()
  const insert = vi.fn().mockReturnThis()
  const update = vi.fn().mockReturnThis()
  const deleteFn = vi.fn().mockReturnThis()
  const upsert = vi.fn().mockReturnThis()
  const eq = vi.fn().mockReturnThis()
  const neq = vi.fn().mockReturnThis()
  const gt = vi.fn().mockReturnThis()
  const gte = vi.fn().mockReturnThis()
  const lt = vi.fn().mockReturnThis()
  const lte = vi.fn().mockReturnThis()
  const like = vi.fn().mockReturnThis()
  const ilike = vi.fn().mockReturnThis()
  const is = vi.fn().mockReturnThis()
  const inFn = vi.fn().mockReturnThis()
  const order = vi.fn().mockReturnThis()
  const limit = vi.fn().mockReturnThis()
  const range = vi.fn().mockReturnThis()
  const single = vi.fn().mockResolvedValue({ data: null, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

  // Query builder object that .from() returns
  const queryBuilder = {
    select,
    insert,
    update,
    delete: deleteFn,
    upsert,
    eq,
    neq,
    gt,
    gte,
    lt,
    lte,
    like,
    ilike,
    is,
    in: inFn,
    order,
    limit,
    range,
    single,
    maybeSingle,
  }

  // Set up mockReturnThis to return the queryBuilder for chaining
  select.mockReturnValue(queryBuilder)
  insert.mockReturnValue(queryBuilder)
  update.mockReturnValue(queryBuilder)
  deleteFn.mockReturnValue(queryBuilder)
  upsert.mockReturnValue(queryBuilder)
  eq.mockReturnValue(queryBuilder)
  neq.mockReturnValue(queryBuilder)
  gt.mockReturnValue(queryBuilder)
  gte.mockReturnValue(queryBuilder)
  lt.mockReturnValue(queryBuilder)
  lte.mockReturnValue(queryBuilder)
  like.mockReturnValue(queryBuilder)
  ilike.mockReturnValue(queryBuilder)
  is.mockReturnValue(queryBuilder)
  inFn.mockReturnValue(queryBuilder)
  order.mockReturnValue(queryBuilder)
  limit.mockReturnValue(queryBuilder)
  range.mockReturnValue(queryBuilder)

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn().mockReturnValue(queryBuilder),
    rpc: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn(),
        download: vi.fn(),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'mock-url' } }),
        remove: vi.fn(),
        list: vi.fn(),
      }),
      createSignedUrl: vi.fn(),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'mock-url' } }),
    },
    // Expose query builder methods directly on client for tests that use
    // mockSupabaseClient.order.mockResolvedValue() pattern
    ...queryBuilder,
  }
}

/**
 * Creates a chainable query builder mock
 * Simulates Supabase's fluent API pattern
 */
export function createMockQueryBuilder(resolvedValue: { data: any; error: any } = { data: null, error: null }) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  }
  return builder
}

/**
 * Resets all mocks in a Supabase client to default state
 * Call this in beforeEach to ensure clean state between tests
 */
export function resetMockSupabaseClient(mockClient: ReturnType<typeof createMockSupabaseClient>) {
  const defaultQueryBuilder = createMockQueryBuilder()

  // Reset auth mocks
  mockClient.auth.getSession.mockReset().mockResolvedValue({
    data: { session: null },
    error: null,
  })
  mockClient.auth.getUser.mockReset().mockResolvedValue({
    data: { user: null },
    error: null,
  })
  mockClient.auth.signOut.mockReset().mockResolvedValue({ error: null })
  mockClient.auth.signInWithPassword.mockReset()
  mockClient.auth.signUp.mockReset()

  // Reset database mocks - restore default query builder
  mockClient.from.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.rpc.mockReset()

  // Reset query builder methods that are exposed directly on the client
  // These need to be reset and re-linked to the new default query builder
  mockClient.select.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.insert.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.update.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.delete.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.upsert.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.eq.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.neq.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.gt.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.gte.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.lt.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.lte.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.like.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.ilike.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.is.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.in.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.order.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.limit.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.range.mockReset().mockReturnValue(defaultQueryBuilder)
  mockClient.single.mockReset().mockResolvedValue({ data: null, error: null })
  mockClient.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null })

  // Reset storage mocks
  mockClient.storage.from.mockReset().mockReturnValue({
    upload: vi.fn(),
    download: vi.fn(),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'mock-url' } }),
    remove: vi.fn(),
    list: vi.fn(),
  })
  mockClient.storage.createSignedUrl.mockReset()
  mockClient.storage.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'mock-url' } })
}

/**
 * Create a successful Supabase response
 */
export function createSuccessResponse<T>(data: T) {
  return {
    data,
    error: null,
  }
}

/**
 * Create an error Supabase response
 */
export function createErrorResponse(message: string, code: string = 'DB_ERROR') {
  return {
    data: null,
    error: { message, code },
  }
}

/**
 * Create a not found response (PGRST116)
 */
export function createNotFoundResponse() {
  return {
    data: null,
    error: { message: 'No rows found', code: 'PGRST116' },
  }
}
