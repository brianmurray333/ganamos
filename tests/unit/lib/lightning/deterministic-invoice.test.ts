import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  serverEnv: {
    lightning: {
      lndRestUrl: "https://lightning.invalid",
      lndAdminMacaroon: "test-macaroon",
    },
  },
}))
vi.mock("@/lib/lightning-validation", () => ({ extractInvoiceAmount: vi.fn() }))

import { checkInvoice, createInvoice, deriveInvoiceIdentity, recoverInvoicePaymentRequest } from "@/lib/lightning"

describe("deterministic Lightning invoice identity", () => {
  beforeEach(() => {
    process.env.DEPOSIT_INVOICE_DERIVATION_KEYS = "new-derivation-key-that-is-at-least-32-bytes,old-derivation-key-that-is-at-least-32-bytes"
  })
  afterEach(() => vi.unstubAllGlobals())

  it("derives the same private preimage and hash for the same logical request", () => {
    const first = deriveInvoiceIdentity("00000000-0000-4000-8000-000000000011")
    const retry = deriveInvoiceIdentity("00000000-0000-4000-8000-000000000011")
    const other = deriveInvoiceIdentity("00000000-0000-4000-8000-000000000012")

    expect(first).toEqual(retry)
    expect(first.paymentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.paymentHash).not.toBe(other.paymentHash)
    expect(Buffer.from(first.preimageBase64, "base64")).toHaveLength(32)
  })

  it("recovers identities created with a retained old key after rotation", () => {
    process.env.DEPOSIT_INVOICE_DERIVATION_KEYS = "old-derivation-key-that-is-at-least-32-bytes"
    const oldIdentity = deriveInvoiceIdentity("00000000-0000-4000-8000-000000000011")
    process.env.DEPOSIT_INVOICE_DERIVATION_KEYS = "new-derivation-key-that-is-at-least-32-bytes,old-derivation-key-that-is-at-least-32-bytes"
    expect(deriveInvoiceIdentity("00000000-0000-4000-8000-000000000011", oldIdentity.paymentHash)).toEqual(oldIdentity)
  })

  it("sends the stable preimage to LND AddInvoice", async () => {
    const identity = deriveInvoiceIdentity("00000000-0000-4000-8000-000000000011")
    const providerHash = Buffer.from(identity.paymentHash, "hex").toString("base64")
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      payment_request: "lnbc2500n1deterministic",
      r_hash: providerHash,
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await createInvoice(2_500, "Ganamos deposit", identity.preimageBase64)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)

    expect(body).toMatchObject({ value: "2500", memo: "Ganamos deposit", r_preimage: identity.preimageBase64 })
    expect(result).toMatchObject({ success: true, paymentRequest: "lnbc2500n1deterministic", rHash: identity.paymentHash })
  })

  it("keeps payment requests out of general status results", async () => {
    const identity = deriveInvoiceIdentity("00000000-0000-4000-8000-000000000011")
    const providerResult = {
      payment_request: "lnbc2500n1private",
      settled: false,
      state: "OPEN",
      amt_paid_sat: "0",
    }
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify(providerResult),
      { status: 200, headers: { "content-type": "application/json" } },
    )))
    vi.stubGlobal("fetch", fetchMock)

    const status = await checkInvoice(identity.paymentHash)
    expect(status).toMatchObject({ success: true, state: "OPEN" })
    expect(status).not.toHaveProperty("paymentRequest")
    expect(status).not.toHaveProperty("preimage")

    const recovery = await recoverInvoicePaymentRequest(identity.paymentHash)
    expect(recovery).toEqual({ success: true, paymentRequest: "lnbc2500n1private" })
  })
})
