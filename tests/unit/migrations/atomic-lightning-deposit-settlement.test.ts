import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260915002000_atomic_lightning_deposit_settlement.sql"),
  "utf8",
)

describe("atomic Lightning deposit migration", () => {
  it("rechecks current reservations and caps before rearming a failed intent", () => {
    const recognizeFailed = migration.indexOf("v_rearm_failed_intent := TRUE")
    const outstandingCheck = migration.indexOf("IF v_outstanding >= 5")
    const capCheck = migration.indexOf("FROM check_balance_cap")
    const rearmUpdate = migration.indexOf("IF v_rearm_failed_intent THEN", recognizeFailed + 1)

    expect(recognizeFailed).toBeGreaterThan(-1)
    expect(outstandingCheck).toBeGreaterThan(recognizeFailed)
    expect(capCheck).toBeGreaterThan(outstandingCheck)
    expect(rearmUpdate).toBeGreaterThan(capCheck)

    const rearmBlock = migration.slice(rearmUpdate, migration.indexOf("INSERT INTO transactions", rearmUpdate))
    expect(rearmBlock).toContain("created_at = NOW()")
    expect(rearmBlock).toContain("deposit_reconcile_attempts = 0")
    expect(rearmBlock).toContain("GET DIAGNOSTICS v_affected = ROW_COUNT")
  })

  it("keeps every pending provider liability reserved until reconciliation", () => {
    const reservationQuery = migration.slice(
      migration.indexOf("SELECT COUNT(*), COALESCE(SUM(t.amount), 0)"),
      migration.indexOf("IF v_outstanding >= 5"),
    )

    expect(reservationQuery).toContain("t.status = 'pending'")
    expect(reservationQuery).not.toContain("created_at")
    expect(migration).toContain("p_payment_hash TEXT")
    expect(migration).toContain("r_hash_str, deposit_request_id")
  })

  it("uses profile-before-transaction lock ordering during settlement", () => {
    const settlement = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.settle_lightning_deposit"))
    const profileLock = settlement.indexOf("FROM profiles AS p")
    const lockedTransaction = settlement.indexOf("SELECT t.* INTO v_transaction")

    expect(profileLock).toBeGreaterThan(-1)
    expect(lockedTransaction).toBeGreaterThan(profileLock)
    expect(settlement.match(/GET DIAGNOSTICS v_affected = ROW_COUNT/g)).toHaveLength(2)
    expect(settlement).not.toContain("'payment_hash'")
  })
})
