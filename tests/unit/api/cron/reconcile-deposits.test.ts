import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  reconcilePendingDeposit: vi.fn(),
}))

vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }))
vi.mock("@/lib/deposit-settlement", () => ({ reconcilePendingDeposit: mocks.reconcilePendingDeposit }))

import { GET } from "@/app/api/cron/reconcile-deposits/route"

function adminClient(updateReturnsRow = true) {
  const updateMaybeSingle = vi.fn().mockResolvedValue({ data: updateReturnsRow ? { id: "invoice-1" } : null, error: null })
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }))
  const updateEqStatus = vi.fn(() => ({ select: updateSelect }))
  const updateEqID = vi.fn(() => ({ eq: updateEqStatus }))
  const update = vi.fn(() => ({ eq: updateEqID }))
  const admin: any = {
    from: vi.fn((table: string) => {
      if (table !== "transactions") throw new Error(`unexpected table ${table}`)
      const ordered: any = {
        limit: vi.fn().mockResolvedValue({
          data: [{ id: "invoice-1", user_id: "user-1", amount: 2_500, status: "pending", r_hash_str: "hash-1", deposit_reconcile_attempts: 0 }],
          error: null,
        }),
      }
      ordered.order = vi.fn(() => ordered)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({ or: () => ordered }),
            }),
          }),
        }),
        update,
      }
    }),
    updateEqStatus,
    updateMaybeSingle,
    update,
  }
  return admin
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "cron-test-secret"
  mocks.createServerSupabaseClient.mockReturnValue(adminClient())
  mocks.reconcilePendingDeposit.mockResolvedValue({ kind: "settled", amount: 2_500, newBalance: 7_500 })
})

describe("GET /api/cron/reconcile-deposits", () => {
  it("requires the configured cron bearer secret", async () => {
    const response = await GET(new Request("https://ganamos.earth/api/cron/reconcile-deposits"))
    expect(response.status).toBe(401)
    expect(mocks.reconcilePendingDeposit).not.toHaveBeenCalled()
  })

  it("settles pending invoices without an open client", async () => {
    const response = await GET(new Request("https://ganamos.earth/api/cron/reconcile-deposits", {
      headers: { authorization: "Bearer cron-test-secret" },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, checked: 1, settled: 1, expired: 0, delayed: 0 })
    expect(mocks.reconcilePendingDeposit).toHaveBeenCalledTimes(1)
  })

  it("marks provider-canceled invoices failed so they stop reserving balance", async () => {
    const admin = adminClient()
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    mocks.reconcilePendingDeposit.mockResolvedValue({ kind: "expired" })
    const response = await GET(new Request("https://ganamos.earth/api/cron/reconcile-deposits", {
      headers: { authorization: "Bearer cron-test-secret" },
    }))
    expect(response.status).toBe(200)
    expect(admin.updateEqStatus).toHaveBeenCalledWith("status", "pending")
  })

  it("fails closed when a required reconciliation update affects zero rows", async () => {
    const admin = adminClient(false)
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    mocks.reconcilePendingDeposit.mockResolvedValue({ kind: "error", code: "LIGHTNING_UNAVAILABLE" })
    const response = await GET(new Request("https://ganamos.earth/api/cron/reconcile-deposits", {
      headers: { authorization: "Bearer cron-test-secret" },
    }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ success: false, error: "Reconciliation persistence failed" })
  })

  it("backs off failing rows so they cannot starve newer invoices", async () => {
    const admin = adminClient()
    mocks.createServerSupabaseClient.mockReturnValue(admin)
    mocks.reconcilePendingDeposit.mockResolvedValue({ kind: "error", code: "LIGHTNING_UNAVAILABLE" })
    const response = await GET(new Request("https://ganamos.earth/api/cron/reconcile-deposits", {
      headers: { authorization: "Bearer cron-test-secret" },
    }))
    expect(response.status).toBe(200)
    expect(admin.update).toHaveBeenCalledWith(expect.objectContaining({
      deposit_reconcile_attempts: 1,
      deposit_reconcile_after: expect.any(String),
    }))
  })
})
