import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  authenticatedRequestClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createInvoice: vi.fn(),
  checkInvoice: vi.fn(),
  deriveInvoiceIdentity: vi.fn(),
  recoverInvoicePaymentRequest: vi.fn(),

  checkRateLimit: vi.fn(),
}))

vi.mock("@/lib/request-auth", () => ({ authenticatedRequestClient: mocks.authenticatedRequestClient }))
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }))
vi.mock("@/lib/lightning", () => ({
  createInvoice: mocks.createInvoice,
  checkInvoice: mocks.checkInvoice,
  deriveInvoiceIdentity: mocks.deriveInvoiceIdentity,
  recoverInvoicePaymentRequest: mocks.recoverInvoicePaymentRequest,
}))

vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: mocks.checkRateLimit }))

import { GET, POST } from "@/app/api/mobile/wallet/deposit/route"

const user = { id: "00000000-0000-4000-8000-000000000001", email: "person@example.com" }
const connectedUserID = "00000000-0000-4000-8000-000000000002"
const invoiceID = "00000000-0000-4000-8000-000000000010"
const requestID = "00000000-0000-4000-8000-000000000011"
const paymentHash = "a".repeat(64)
const preimageBase64 = "c3RhYmxlLXByZWltYWdl"

function authClient(connected = false) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: connected ? { id: "link" } : null, error: null }) })),
        })),
      })),
    })),
  }
}

function adminClient(options: {
  transaction?: Record<string, unknown> | null
  profileBalance?: number
  outstanding?: unknown[]
  intentError?: unknown
  updateError?: unknown
  rpcResult?: Record<string, unknown>
  preparationOutcome?: string
  existingIntent?: Record<string, unknown> | null
} = {}) {
  const transaction = options.transaction === undefined ? {
    id: invoiceID,
    user_id: user.id,
    amount: 2_500,
    status: "pending",
    r_hash_str: paymentHash,
    payment_request: null,
    created_at: new Date().toISOString(),
  } : options.transaction

  const client: any = {
    rpc: vi.fn((name: string) => Promise.resolve({
      data: name === "prepare_lightning_deposit"
        ? [{ outcome: options.preparationOutcome || "prepared", transaction_id: invoiceID, current_balance: 5_000 }]
        : [options.rpcResult || { outcome: "settled", amount: 2_500, new_balance: 7_500 }],
      error: null,
    })),
  }
  client.from = vi.fn((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { balance: options.profileBalance ?? 5_000 }, error: null }) }) }) }
    }
    if (table !== "transactions") throw new Error(`unexpected table ${table}`)
    const updateResult = { data: options.updateError ? null : { id: invoiceID }, error: options.updateError || null }
    const updateChain: any = {
      eq: vi.fn(() => updateChain),
      select: vi.fn(() => updateChain),
      maybeSingle: vi.fn().mockResolvedValue(updateResult),
    }
    return {
      select: vi.fn((columns: string) => {
        if (columns === "user_id,amount,r_hash_str") {
          return { eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: options.existingIntent || null, error: null }) }) }
        }
        if (columns === "id") {
          return { eq: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ limit: vi.fn().mockResolvedValue({ data: options.outstanding || [], error: null }) }) }) }) }) }
        }
        const result = { data: transaction, error: null }
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue(result),
              single: vi.fn().mockResolvedValue(result),
            }),
          }),
        }
      }),
      insert: vi.fn(() => ({
        select: () => ({ single: vi.fn().mockResolvedValue({ data: options.intentError ? null : { id: invoiceID }, error: options.intentError || null }) }),
      })),
      update: vi.fn(() => updateChain),
    }
  })
  return client
}

function postRequest(body: unknown) {
  return new Request("https://ganamos.earth/api/mobile/wallet/deposit", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify({ ...(body as Record<string, unknown>), requestId: requestID }),
  })
}

function getRequest(id = invoiceID) {
  return new Request(`https://ganamos.earth/api/mobile/wallet/deposit?invoiceId=${id}`, {
    headers: { authorization: "Bearer token" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkRateLimit.mockReturnValue({ allowed: true })

  mocks.authenticatedRequestClient.mockResolvedValue({ supabase: authClient(), user, error: null })
  mocks.createServerSupabaseClient.mockReturnValue(adminClient())
  mocks.deriveInvoiceIdentity.mockReturnValue({ paymentHash, preimageBase64 })
  mocks.recoverInvoicePaymentRequest.mockResolvedValue({ success: false })
  mocks.createInvoice.mockResolvedValue({ success: true, paymentRequest: "lnbc2500n1real", rHash: paymentHash })
  mocks.checkInvoice.mockResolvedValue({ success: true, settled: false, state: "OPEN", amountPaid: "0" })
})

describe("POST /api/mobile/wallet/deposit", () => {
  it("requires authentication", async () => {
    mocks.authenticatedRequestClient.mockResolvedValue({ supabase: authClient(), user: null, error: null })
    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ success: false, code: "AUTH_REQUIRED" })
    expect(mocks.createInvoice).not.toHaveBeenCalled()
  })

  it("rejects authentication helper errors even if a user object is present", async () => {
    mocks.authenticatedRequestClient.mockResolvedValue({ supabase: authClient(), user, error: new Error("invalid token") })
    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    expect(response.status).toBe(401)
    expect(mocks.createInvoice).not.toHaveBeenCalled()
  })

  it("creates a durable fixed-value invoice intent for the authenticated account", async () => {
    const admin = adminClient()
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body).toMatchObject({ success: true, invoiceId: invoiceID, paymentRequest: "lnbc2500n1real", amount: 2_500 })
    expect(body.expiresAt).toEqual(expect.any(String))
    expect(mocks.createInvoice).toHaveBeenCalledWith(2_500, "Ganamos deposit", preimageBase64)
    expect(admin.rpc).toHaveBeenCalledWith("prepare_lightning_deposit", expect.objectContaining({ p_payment_hash: paymentHash }))
  })

  it("uses the retained derivation key matching an existing request hash", async () => {
    const admin = adminClient({ existingIntent: { user_id: user.id, amount: 2_500, r_hash_str: paymentHash } })
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    await POST(postRequest({ amount: 2_500, userId: user.id }))
    expect(mocks.deriveInvoiceIdentity).toHaveBeenCalledWith(requestID, paymentHash)
  })

  it("returns the same stored invoice for an idempotent retry", async () => {
    const admin = adminClient({
      preparationOutcome: "existing",
      transaction: {
        id: invoiceID,
        user_id: user.id,
        amount: 2_500,
        status: "pending",
        r_hash_str: paymentHash,
        payment_request: "lnbc2500n1real",
        created_at: "2026-09-14T18:00:00.000Z",
      },
    })
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ invoiceId: invoiceID, paymentRequest: "lnbc2500n1real", amount: 2_500 })
    expect(mocks.createInvoice).not.toHaveBeenCalled()
  })

  it("allows a verified connected account", async () => {
    mocks.authenticatedRequestClient.mockResolvedValue({ supabase: authClient(true), user, error: null })
    const response = await POST(postRequest({ amount: 2_500, userId: connectedUserID }))
    expect(response.status).toBe(201)
  })

  it("rejects unrelated accounts and amountless invoices", async () => {
    let response = await POST(postRequest({ amount: 2_500, userId: connectedUserID }))
    expect(response.status).toBe(403)
    response = await POST(postRequest({ amount: 0, userId: user.id }))
    expect(response.status).toBe(400)
    expect(mocks.createInvoice).not.toHaveBeenCalled()
  })

  it("preflights the balance cap before creating an irreversible invoice", async () => {
    mocks.createServerSupabaseClient.mockReturnValue(adminClient({ preparationOutcome: "cap_exceeded" }))
    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "BALANCE_LIMIT" })
    expect(mocks.createInvoice).not.toHaveBeenCalled()
  })

  it("fails safely when LND does not return a real invoice", async () => {
    mocks.createInvoice.mockResolvedValue({ success: false, error: "sensitive node response" })
    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    const body = await response.json()
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ code: "LIGHTNING_UNAVAILABLE" })
    expect(JSON.stringify(body)).not.toContain("sensitive")
  })

  it("recovers the same provider invoice after an ambiguous create failure", async () => {
    mocks.createInvoice.mockRejectedValue(new Error("connection lost after commit"))
    mocks.recoverInvoicePaymentRequest
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, paymentRequest: "lnbc2500n1recovered" })

    const response = await POST(postRequest({ amount: 2_500, userId: user.id }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ paymentRequest: "lnbc2500n1recovered" })
    expect(mocks.createInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.createInvoice).toHaveBeenCalledWith(2_500, "Ganamos deposit", preimageBase64)
  })
})

describe("GET /api/mobile/wallet/deposit", () => {
  it("returns pending without mutating balances", async () => {
    const admin = adminClient()
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, status: "pending", settled: false, amount: 2_500 })
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it("requires explicit SETTLED state and exact fixed amount", async () => {
    mocks.checkInvoice.mockResolvedValue({ success: true, settled: true, state: "ACCEPTED", amountPaid: "2500" })
    let response = await GET(getRequest())
    expect(response.status).toBe(503)

    mocks.checkInvoice.mockResolvedValue({ success: true, settled: true, state: "SETTLED", amountPaid: "2500garbage" })
    response = await GET(getRequest())
    expect(response.status).toBe(409)

    mocks.checkInvoice.mockResolvedValue({ success: true, settled: true, state: "SETTLED", amountPaid: "2501" })
    response = await GET(getRequest())
    expect(response.status).toBe(409)
  })

  it("settles an owned invoice through the atomic RPC", async () => {
    const admin = adminClient()
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    mocks.checkInvoice.mockResolvedValue({ success: true, settled: true, state: "SETTLED", amountPaid: "2500" })
    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, status: "completed", settled: true, amount: 2_500, newBalance: 7_500 })
    expect(admin.rpc).toHaveBeenCalledWith("settle_lightning_deposit", { p_transaction_id: invoiceID, p_actual_amount: 2_500 })
  })

  it("authorizes connected-account ownership before querying LND", async () => {
    const admin = adminClient({ transaction: { id: invoiceID, user_id: connectedUserID, amount: 2_500, status: "pending", r_hash_str: paymentHash } })
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    mocks.authenticatedRequestClient.mockResolvedValue({ supabase: authClient(true), user, error: null })
    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(mocks.checkInvoice).toHaveBeenCalled()
  })
})
