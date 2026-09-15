import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { reconcilePendingDeposit, type PendingDeposit } from "@/lib/deposit-settlement"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type ReconciliationRow = PendingDeposit & { deposit_reconcile_attempts?: number | null }

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const admin = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
  const { data, error } = await admin
    .from("transactions")
    .select("id,user_id,amount,status,r_hash_str,deposit_reconcile_attempts")
    .eq("type", "deposit")
    .eq("status", "pending")
    .not("r_hash_str", "is", null)
    .or(`deposit_reconcile_after.is.null,deposit_reconcile_after.lte.${new Date().toISOString()}`)
    .order("deposit_reconcile_after", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) {
    console.error("[Deposit Reconciliation] Pending-invoice query failed", { category: "database" })
    return NextResponse.json({ success: false, error: "Reconciliation query failed" }, { status: 500 })
  }

  const counts = { checked: 0, settled: 0, expired: 0, delayed: 0 }
  let persistenceFailed = false
  const processRow = async (row: ReconciliationRow) => {
    if (!row.r_hash_str) return
    counts.checked += 1
    const result = await reconcilePendingDeposit(admin, row as PendingDeposit)
    if (result.kind === "settled") {
      counts.settled += 1
    } else if (result.kind === "expired") {
      const { data: updated, error: updateError } = await admin.from("transactions").update({ status: "failed" }).eq("id", row.id).eq("status", "pending").select("id").maybeSingle()
      if (updateError || !updated) {
        persistenceFailed = true
        console.error("[Deposit Reconciliation] Expiration update failed", { category: "database" })
        return
      }
      counts.expired += 1
    } else if (result.kind === "pending") {
      const { data: updated, error: updateError } = await admin.from("transactions").update({
        deposit_reconcile_after: new Date(Date.now() + 60_000).toISOString(),
      }).eq("id", row.id).eq("status", "pending").select("id").maybeSingle()
      if (updateError || !updated) {
        persistenceFailed = true
        console.error("[Deposit Reconciliation] Pending update failed", { category: "database" })
      }
    } else if (result.kind === "error") {
      const attempts = (row.deposit_reconcile_attempts || 0) + 1
      const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6))
      const { data: updated, error: updateError } = await admin.from("transactions").update({
        deposit_reconcile_attempts: attempts,
        deposit_reconcile_after: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      }).eq("id", row.id).eq("status", "pending").select("id").maybeSingle()
      if (updateError || !updated) {
        persistenceFailed = true
        console.error("[Deposit Reconciliation] Backoff update failed", { category: "database" })
        return
      }
      counts.delayed += 1
    }
  }

  const rows = data || []
  for (let index = 0; index < rows.length; index += 5) {
    await Promise.all(rows.slice(index, index + 5).map(processRow))
  }

  if (persistenceFailed) {
    return NextResponse.json({ success: false, error: "Reconciliation persistence failed" }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...counts })
}
