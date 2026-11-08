import { checkInvoice } from "@/lib/lightning"

export type PendingDeposit = {
  id: string
  user_id: string
  amount: number
  status: string
  r_hash_str: string
}

export type DepositReconciliation =
  | { kind: "pending" }
  | { kind: "expired" }
  | { kind: "settled"; amount: number; newBalance: number | null }
  | { kind: "error"; code: "LIGHTNING_UNAVAILABLE" | "LIGHTNING_INVALID_STATE" | "AMOUNT_MISMATCH" | "SETTLEMENT_FAILED" | "SETTLEMENT_BLOCKED" }

function parseStatus(value: unknown) {
  if (!value || typeof value !== "object") return null
  const result = value as Record<string, unknown>
  if (result.success !== true || typeof result.settled !== "boolean" || typeof result.state !== "string") return null
  return { settled: result.settled, state: result.state.toUpperCase(), amountPaid: result.amountPaid }
}

function strictSatoshiAmount(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : value
  if (typeof text !== "string" || !/^[0-9]+$/.test(text)) return null
  const amount = Number(text)
  return Number.isSafeInteger(amount) ? amount : null
}

export async function reconcilePendingDeposit(admin: any, transaction: PendingDeposit): Promise<DepositReconciliation> {
  let rawStatus: unknown
  try {
    rawStatus = await checkInvoice(transaction.r_hash_str)
  } catch {
    return { kind: "error", code: "LIGHTNING_UNAVAILABLE" }
  }

  const status = parseStatus(rawStatus)
  if (!status) return { kind: "error", code: "LIGHTNING_UNAVAILABLE" }
  if (!status.settled) {
    if (status.state === "CANCELED") return { kind: "expired" }
    return { kind: "pending" }
  }
  if (status.state !== "SETTLED") return { kind: "error", code: "LIGHTNING_INVALID_STATE" }

  const actualAmount = strictSatoshiAmount(status.amountPaid)
  if (actualAmount === null || actualAmount < 100 || actualAmount > 10_000_000 || actualAmount !== transaction.amount) {
    console.error("[Deposit Reconciliation] Settlement amount mismatch", { category: "provider" })
    return { kind: "error", code: "AMOUNT_MISMATCH" }
  }

  const { data, error } = await admin.rpc("settle_lightning_deposit", {
    p_transaction_id: transaction.id,
    p_actual_amount: actualAmount,
  })
  if (error || !data?.[0]) return { kind: "error", code: "SETTLEMENT_FAILED" }

  const result = data[0] as { outcome: string; amount: number; new_balance: number | null }
  if (result.outcome === "settled" || result.outcome === "already_settled") {
    return { kind: "settled", amount: result.amount, newBalance: result.new_balance }
  }
  if (result.outcome === "amount_mismatch") return { kind: "error", code: "AMOUNT_MISMATCH" }
  return { kind: "error", code: "SETTLEMENT_BLOCKED" }
}
