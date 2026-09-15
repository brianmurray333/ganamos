import { describe, expect, it } from "vitest"
import { createDepositInvoice } from "@/app/actions/lightning-actions"

describe("legacy createDepositInvoice action", () => {
  it("fails closed without creating a payable invoice", async () => {
    const result = await createDepositInvoice(1_000, "00000000-0000-4000-8000-000000000001")

    expect(result).toEqual({
      success: false,
      error: "This deposit flow is no longer available. Please use Receive Bitcoin.",
      code: "LEGACY_DEPOSIT_DISABLED",
    })
  })
})
