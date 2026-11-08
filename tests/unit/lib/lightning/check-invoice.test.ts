import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  serverEnv: {
    lightning: {
      lndRestUrl: "https://lnd.example.test",
      lndAdminMacaroon: "test-macaroon",
    },
  },
}))
vi.mock("@/lib/lightning-validation", () => ({ extractInvoiceAmount: vi.fn() }))

import { checkInvoice } from "@/lib/lightning"

const hash = "ab".repeat(32)
const providerInvoice = {
  settled: true,
  amt_paid_sat: "2500",
  state: "SETTLED",
  creation_date: "1609459200",
  settle_date: "1609459300",
  payment_request: "lnbc2500n1private",
  r_preimage: Buffer.alloc(32, 7).toString("base64"),
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("checkInvoice production implementation", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it("returns normalized status while omitting BOLT11 and preimage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(providerInvoice))
    const result = await checkInvoice(hash)
    expect(result).toMatchObject({
      success: true,
      settled: true,
      amountPaid: "2500",
      state: "SETTLED",
      creationDate: "1609459200",
      settleDate: "1609459300",
    })
    expect(result).not.toHaveProperty("paymentRequest")
    expect(result).not.toHaveProperty("preimage")
    expect(fetch).toHaveBeenCalledWith(
      `https://lnd.example.test/v1/invoice/${hash}`,
      expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) }),
    )
  })

  it("falls back to URL-safe base64 when direct hex lookup fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ error: "not found" }, 404))
      .mockResolvedValueOnce(response(providerInvoice))
    const result = await checkInvoice(hash)
    expect(result).toMatchObject({ success: true, state: "SETTLED" })
    expect(fetch).toHaveBeenCalledTimes(2)
    const fallbackURL = vi.mocked(fetch).mock.calls[1][0].toString()
    expect(fallbackURL).toContain("/v1/invoice/")
    expect(fallbackURL).not.toContain(hash)
  })

  it("accepts an already encoded lookup key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(providerInvoice))
    const result = await checkInvoice("encoded/hash+value=")
    expect(result).toMatchObject({ success: true, settled: true })
    expect(vi.mocked(fetch).mock.calls[0][0].toString()).toContain("encoded%2Fhash%2Bvalue%3D")
  })

  it("returns only sanitized failure information for network errors", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("connect ECONNREFUSED https://secret-host"))
    const result = await checkInvoice(hash)
    expect(result).toEqual({ success: false, error: "Failed to communicate with Lightning node" })
    expect(JSON.stringify(result)).not.toContain("secret-host")
  })
})
