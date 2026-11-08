import { describe, expect, it } from "vitest"
import { checkDepositStatus, createDepositInvoice } from "@/app/actions/lightning-actions"

const disabledResult = {
  success: false,
  error: "This deposit flow is no longer available. Please use Receive Bitcoin.",
  code: "LEGACY_DEPOSIT_DISABLED",
}

describe("legacy Lightning deposit actions", () => {
  it("cannot create invoices through the obsolete action", async () => {
    await expect(createDepositInvoice(1_000, "account-id")).resolves.toEqual(disabledResult)
  })

  it("cannot settle invoices through the obsolete action", async () => {
    await expect(checkDepositStatus("provider-payment-hash")).resolves.toEqual(disabledResult)
  })
})
