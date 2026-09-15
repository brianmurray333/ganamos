"use server"

const LEGACY_DEPOSIT_DISABLED = {
  success: false as const,
  error: "This deposit flow is no longer available. Please use Receive Bitcoin.",
  code: "LEGACY_DEPOSIT_DISABLED" as const,
}

/**
 * Retained only so stale clients fail closed. Current web and iOS clients use
 * the authenticated /api/mobile/wallet/deposit contract.
 */
export async function createDepositInvoice(_amount: number, _userId: string) {
  return LEGACY_DEPOSIT_DISABLED
}

/**
 * Retained only so stale clients cannot use the former non-atomic settlement
 * path. Status and settlement now run through the authenticated deposit API.
 */
export async function checkDepositStatus(_paymentHash: string) {
  return LEGACY_DEPOSIT_DISABLED
}
